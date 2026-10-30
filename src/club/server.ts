import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId } from '../db/db';
import type { Format } from '../domain/types';
import { ClubError, type AdminClub, type AdminClubDetail, type AdminOverview, type AdminTournament, type ClubBackend, type EntryPatch, type ListingReview, type MatchPatch, type ClubBundle, type MatchBundle, type MyClub, type MyClubMatches, type MyEntry, type ImportEntryRow, type ImportResult, type OfflineEntry, type PinSignIn, type PublicEvent, type PublicTournament, type RegistrationPatch, type ScorePatch, type TournamentBundle, type TournamentDetails } from './backend';
import { buildTournamentRows, checkDivisionSetup, type NewMatchRow, type NewTournamentInput } from './plan';
import type { DrawPlan } from './registration';
import type { Club, ClubMatch, ClubPlayer, ClubTournament, Division, DivisionRules, Entry, EntryPerson, Listing, ListingStatus, Member, Registration, Role, ScorerLink, ScorerView, Share, SharedSummary, SummaryData } from './types';

/* Row shapes as stored on the server (snake_case). */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const n = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

const toClub = (r: Row): Club => ({ id: String(r.id), name: String(r.name), city: s(r.city), inviteCode: String(r.invite_code), settings: (r.settings as Club['settings']) ?? {}, logoUrl: s(r.logo_url) });
const toPlayer = (r: Row): ClubPlayer => ({
  id: String(r.id), clubId: String(r.club_id), name: String(r.name), duprSingles: n(r.dupr_singles), duprDoubles: n(r.dupr_doubles),
  duprId: s(r.dupr_id), userId: s(r.user_id), claimCode: s(r.claim_code), share: (r.share as Share) ?? {}, sample: !!r.sample,
});
const toTournament = (r: Row): ClubTournament => ({
  id: String(r.id), clubId: String(r.club_id), name: String(r.name), startDate: String(r.start_date), startTime: String(r.start_time).slice(0, 5),
  courts: Number(r.courts), slotMinutes: Number(r.slot_minutes), status: r.status as ClubTournament['status'], isPublic: !!r.is_public, publicSlug: String(r.public_slug),
  city: s(r.city), venue: s(r.venue), about: s(r.about), contact: s(r.contact), link: s(r.link), entryMode: r.entry_mode === 'registration' ? 'registration' : 'roster',
  registrationOpen: !!r.registration_open, entriesClose: s(r.entries_close), upiId: s(r.upi_id), listing: (r.listing as Listing) ?? 'none',
  listingStatus: (r.listing_status as ListingStatus) ?? 'none', rejectReason: s(r.reject_reason), reviewedAt: s(r.reviewed_at), drawnAt: s(r.drawn_at), posterUrl: s(r.poster_url),
});
const toRules = (r: Row): DivisionRules => ({ maxDupr: n(r.max_dupr), ...(r.dupr_cap === 'average' ? { duprCap: 'average' as const } : {}), gender: (r.gender as DivisionRules['gender']) ?? 'open', minAge: n(r.min_age), cap: n(r.cap), fee: n(r.fee) });
const fromRules = (r?: DivisionRules): Row => ({ max_dupr: r?.maxDupr ?? null, dupr_cap: r?.duprCap === 'average' ? 'average' : 'each', gender: r?.gender ?? 'open', min_age: r?.minAge ?? null, cap: r?.cap ?? null, fee: r?.fee ?? null });
const toPerson = (p: Row): EntryPerson => ({ name: String(p.name ?? ''), phone: String(p.phone ?? ''), duprId: s(p.duprId), dupr: n(p.dupr), gender: (p.gender as EntryPerson['gender']) ?? '', age: n(p.age), ...(p.adult === true ? { adult: true } : {}) });
const fromPerson = (p: EntryPerson): Row => ({ name: p.name.trim(), phone: p.phone.trim(), duprId: p.duprId?.trim().toUpperCase() || '', dupr: p.dupr ?? null, gender: p.gender, age: p.age ?? null, ...(p.adult && p.age === undefined ? { adult: true } : {}) });
const toRegistration = (r: Row): Registration => ({
  id: String(r.id), tournamentId: String(r.tournament_id), divisionId: String(r.division_id), clubId: String(r.club_id), userId: s(r.user_id),
  source: r.source === 'offline' ? 'offline' : 'online', players: ((r.players as Row[]) ?? []).map(toPerson), status: r.status as Registration['status'],
  payment: r.payment as Registration['payment'], paymentRef: s(r.payment_ref), note: s(r.note), entryId: s(r.entry_id), createdAt: String(r.created_at),
});
const toEvent = (r: Row): PublicEvent => ({
  slug: String(r.slug), name: String(r.name), startDate: String(r.start_date), startTime: String(r.start_time ?? '08:00').slice(0, 5), city: s(r.city), venue: s(r.venue),
  club: String(r.club), listing: r.listing as Listing, status: r.status as ClubTournament['status'], entryMode: r.entry_mode === 'registration' ? 'registration' : 'roster',
  registrationOpen: !!r.registration_open, entriesClose: s(r.entries_close), results: !!r.results, drawn: !!r.drawn, contact: s(r.contact), link: s(r.link),
  about: s(r.about), upiId: s(r.upi_id), posterUrl: s(r.poster_url),
  divisions: ((r.divisions as Row[]) ?? []).map((d) => ({ id: String(d.id), name: String(d.name), kind: d.kind as Division['kind'], rules: toRules(d), taken: Number(d.taken ?? 0) })),
});
/** Server functions answer {"error": "..."} for things a person can fix; this turns that into a message. */
function answer<T extends Row>(r: unknown): T {
  const x = r as Row | null;
  if (!x) throw new ClubError('No answer from the club server. Try again.');
  if (x.error) throw new ClubError(String(x.error));
  return x as T;
}
/**
 * A division's format column: { pool, ko } plus, since the format options, the knockout shape and per-round formats:
 * { stages: { qf, sf, final, … }, shape: 'ko', extra: n }. Older rows hold one format for everything.
 */
type FormatJson = { pool?: Format; ko?: Format; stages?: Division['stageFormats']; shape?: 'ko'; extra?: number } & Partial<Format>;
const formats = (f: unknown): Pick<Division, 'format' | 'koFormat' | 'shape' | 'extra' | 'stageFormats'> => {
  const x = (f ?? {}) as FormatJson;
  if (!x.pool) return { format: x as Format, koFormat: x as Format };
  return {
    format: x.pool, koFormat: x.ko ?? x.pool,
    ...(x.shape === 'ko' ? { shape: 'ko' as const } : {}),
    ...(x.extra ? { extra: Number(x.extra) } : {}),
    ...(x.stages && Object.keys(x.stages).length ? { stageFormats: x.stages } : {}),
  };
};
export const formatJson = (d: Pick<Division, 'format' | 'koFormat' | 'shape' | 'extra' | 'stageFormats'>): FormatJson => ({
  pool: d.format, ko: d.koFormat,
  ...(d.stageFormats && Object.keys(d.stageFormats).length ? { stages: d.stageFormats } : {}),
  ...(d.shape === 'ko' ? { shape: 'ko' as const } : {}),
  ...(d.extra ? { extra: d.extra } : {}),
});
const toDivision = (r: Row): Division => ({
  id: String(r.id), tournamentId: String(r.tournament_id), clubId: String(r.club_id), name: String(r.name), kind: r.kind as Division['kind'],
  ...formats(r.format), pools: Number(r.pools), advance: Number(r.advance), sort: Number(r.sort ?? 0), rules: toRules(r),
});
const toEntry = (r: Row): Entry => ({ id: String(r.id), divisionId: String(r.division_id), clubId: String(r.club_id), playerIds: r.player_ids as string[], seed: n(r.seed), pool: n(r.pool), status: r.status === 'withdrawn' ? 'withdrawn' : 'active' });
const toLink = (r: Row): ScorerLink => ({ id: String(r.id), tournamentId: String(r.tournament_id), clubId: String(r.club_id), court: n(r.court), token: String(r.token), pin: String(r.pin), label: s(r.label), revoked: !!r.revoked, lastUsedAt: s(r.last_used_at) });
const toScorerView = (r: Row): ScorerView => {
  const t = r.tournament as Row;
  return {
    court: n(r.court), label: s(r.label), club: String(r.club),
    tournament: { name: String(t.name), startDate: String(t.start_date), startTime: String(t.start_time ?? '08:00').slice(0, 5), slotMinutes: Number(t.slot_minutes ?? 20), courts: Number(t.courts ?? 1), status: t.status as ClubTournament['status'] },
    matches: ((r.matches as Row[]) ?? []).map((m) => ({
      id: String(m.id), stage: m.stage as ClubMatch['stage'], pool: n(m.pool), round: n(m.round), slot: n(m.slot), court: n(m.court), division: s(m.division),
      format: m.format as Format, games: (m.games as ClubMatch['games']) ?? [], status: m.status as ClubMatch['status'], winner: (m.winner as ClubMatch['winner']) ?? undefined,
      playedOn: s(m.played_on), namesA: (m.names_a as string[]) ?? [], namesB: (m.names_b as string[]) ?? [],
    })),
  };
};
const toMatch = (r: Row): ClubMatch => ({
  id: String(r.id), clubId: String(r.club_id), tournamentId: s(r.tournament_id), divisionId: s(r.division_id), stage: r.stage as ClubMatch['stage'],
  pool: n(r.pool), round: n(r.round), bracketPos: n(r.bracket_pos), slot: n(r.slot), court: n(r.court), entryA: s(r.entry_a), entryB: s(r.entry_b),
  sideA: (r.side_a as string[]) ?? [], sideB: (r.side_b as string[]) ?? [], format: r.format as Format, games: (r.games as ClubMatch['games']) ?? [],
  status: r.status as ClubMatch['status'], winner: (r.winner as ClubMatch['winner']) ?? undefined, playedOn: s(r.played_on), updatedAt: String(r.updated_at),
});
const fromMatch = (m: NewMatchRow): Row => ({
  id: m.id, club_id: m.clubId, tournament_id: m.tournamentId ?? null, division_id: m.divisionId ?? null, stage: m.stage, pool: m.pool ?? null, round: m.round ?? null,
  bracket_pos: m.bracketPos ?? null, slot: m.slot ?? null, court: m.court ?? null, entry_a: m.entryA ?? null, entry_b: m.entryB ?? null,
  side_a: m.sideA, side_b: m.sideB, format: m.format, games: m.games, status: m.status, winner: m.winner ?? null, played_on: m.playedOn ?? null,
});

/** Turns server errors into short messages a person can act on. */
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) {
    const msg = res.error.message;
    if (/fetch|network/i.test(msg)) throw new ClubError('No connection to the club server. Check your internet and try again.');
    throw new ClubError(msg);
  }
  return res.data;
}

export class ServerBackend implements ClubBackend {
  readonly kind = 'server' as const;
  private sb: SupabaseClient;

  constructor(url: string, key: string) {
    // PKCE: the email's sign-in link comes back with ?code=… which is swapped for a session on this browser.
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'pq-club-auth' } });
  }

  async currentUser() {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }

  async sendCode(email: string) {
    // The email carries a sign-in link back to this app (and a 6-digit code once the club's own email service is set up).
    const back = `${window.location.origin}${window.location.pathname}`;
    check(await this.sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: back } }));
  }

  async finishLinkSignIn(): Promise<boolean> {
    const url = new URL(window.location.href);
    const err = url.searchParams.get('error_description') ?? new URLSearchParams(url.hash.split('?')[1] ?? '').get('error_description');
    const code = url.searchParams.get('code');
    if (!code && !err) return false;
    // Clean the address bar so a reload doesn't try the same link again.
    window.history.replaceState(null, '', `${url.pathname}${url.hash.split('?')[0] || '#/club-signin'}`);
    if (err) throw new ClubError(/expired|invalid/i.test(err) ? 'That sign-in link has expired or was already used. Send a new one.' : err);
    // getSession waits for the client to finish swapping the link's code for a session.
    const { data } = await this.sb.auth.getSession();
    if (!data.session) throw new ClubError('That link didn’t sign you in. Open it on the same phone and browser you asked for it on, or send a new one.');
    check(await this.sb.rpc('claim_pending'));
    return true;
  }

  async verifyCode(email: string, code: string) {
    check(await this.sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }));
    // Pick up any club roles waiting for this email.
    check(await this.sb.rpc('claim_pending'));
  }

  async pinSignIn(a: PinSignIn) {
    const { data, error } = await this.sb.functions.invoke('pin-sign-in', { body: a });
    // Expected problems (wrong PIN, lockout) come back as { error } with status 200; anything else is a failure.
    const r = (data ?? {}) as Row;
    if (r.error) throw new ClubError(String(r.error));
    if (error || !r.token_hash) throw new ClubError('Sign-in didn’t work just now. Check your internet and try again.');
    check(await this.sb.auth.verifyOtp({ token_hash: String(r.token_hash), type: 'magiclink' }));
    if (a.mode === 'account') check(await this.sb.rpc('claim_pending'));
    return { tournamentId: s(r.tournament_id) };
  }

  async hasMyPin() { return !!check(await this.sb.rpc('has_my_pin')); }

  async setMyPin(pin: string) {
    if (!/^\d{4,6}$/.test(pin)) throw new ClubError('A PIN is 4 to 6 digits');
    check(await this.sb.rpc('set_my_pin', { p_pin: pin }));
  }

  async eventPin(tournamentId: string) {
    const rows = check(await this.sb.from('tournament_pins').select('pin').eq('tournament_id', tournamentId)) as Row[];
    return rows[0] ? String(rows[0].pin) : null;
  }

  async setEventPin(tournamentId: string, pin?: string) {
    if (pin !== undefined && !/^\d{4,6}$/.test(pin)) throw new ClubError('A PIN is 4 to 6 digits');
    return String(check(await this.sb.rpc('set_event_pin', { p_tournament: tournamentId, p_pin: pin ?? null })));
  }

  async setClubLogo(clubId: string, image: Blob) {
    const path = `${clubId}/logo.jpg`;
    const up = await this.sb.storage.from('posters').upload(path, image, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (up.error) throw new ClubError(/row-level|policy|Unauthorized|403/i.test(up.error.message) ? 'Only the club’s coaches and admins can change the logo' : `The logo didn’t upload: ${up.error.message}`);
    const url = `${this.sb.storage.from('posters').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    check(await this.sb.rpc('set_club_logo', { p_club: clubId, p_url: url }));
    return url;
  }

  async publicClubLogo(slug: string) {
    const r = check(await this.sb.rpc('public_club_logo', { p_slug: slug })) as Row | null;
    return r ? { club: String(r.club), logoUrl: s(r.logo_url) } : null;
  }

  async signOut() { await this.sb.auth.signOut(); }

  private async uid(): Promise<string> {
    const u = await this.currentUser();
    if (!u) throw new ClubError('Sign in first');
    return u.id;
  }

  async myClubs(): Promise<MyClub[]> {
    const uid = await this.uid();
    const rows = check(await this.sb.from('club_members').select('role, clubs(*)').eq('user_id', uid)) as Row[];
    const mine = check(await this.sb.from('club_players').select('id, club_id').eq('user_id', uid)) as Row[];
    return rows.filter((r) => r.clubs).map((r) => {
      const club = toClub(r.clubs as Row);
      return { club, role: r.role as Role, myPlayerId: s(mine.find((p) => p.club_id === club.id)?.id) };
    });
  }

  async createClub(name: string, city: string, myName: string) {
    return String(check(await this.sb.rpc('create_club', { club_name: name.trim(), club_city: city, my_name: myName })));
  }

  async joinClub(code: string, claim: string | null, myName: string) {
    return String(check(await this.sb.rpc('join_club', { code, claim, my_name: myName })));
  }

  async clubBundle(clubId: string): Promise<ClubBundle> {
    const uid = await this.uid();
    const [club, members, players, tournaments, matches, summaries] = await Promise.all([
      this.sb.from('clubs').select('*').eq('id', clubId).single(),
      this.sb.from('club_members').select('user_id, role').eq('club_id', clubId),
      this.sb.from('club_players').select('*').eq('club_id', clubId).order('name'),
      this.sb.from('tournaments').select('*').eq('club_id', clubId).order('start_date', { ascending: false }),
      this.sb.from('club_matches').select('*').eq('club_id', clubId),
      this.sb.from('shared_summaries').select('*').eq('club_id', clubId),
    ]);
    const ms = check(members) as Row[];
    const me = ms.find((m) => m.user_id === uid);
    if (!me) throw new ClubError('You are not in this club');
    const ps = (check(players) as Row[]).map(toPlayer);
    const profiles = check(await this.sb.from('profiles').select('id, display_name').in('id', ms.map((m) => String(m.user_id)))) as Row[];
    const nameOf = (id: unknown) => String(profiles.find((p) => p.id === id)?.display_name || ps.find((p) => p.userId === id)?.name || 'Member');
    return {
      club: toClub(check(club) as Row), role: me.role as Role, myPlayerId: ps.find((p) => p.userId === uid)?.id,
      members: ms.map((m): Member => ({ userId: String(m.user_id), role: m.role as Role, name: nameOf(m.user_id) })),
      players: ps,
      tournaments: (check(tournaments) as Row[]).map(toTournament),
      matches: (check(matches) as Row[]).map(toMatch),
      summaries: (check(summaries) as Row[]).map((r): SharedSummary => ({ playerId: String(r.player_id), data: r.data as SummaryData, updatedAt: String(r.updated_at) })),
    };
  }

  async addPlayer(clubId: string, p: { name: string; duprSingles?: number; duprDoubles?: number }) {
    const row = check(await this.sb.from('club_players').insert({ club_id: clubId, name: p.name.trim(), dupr_singles: p.duprSingles ?? null, dupr_doubles: p.duprDoubles ?? null }).select('*').single()) as Row;
    return toPlayer(row);
  }

  async updatePlayer(id: string, patch: { name?: string; duprSingles?: number | null; duprDoubles?: number | null; duprId?: string | null }) {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.duprSingles !== undefined) row.dupr_singles = patch.duprSingles;
    if (patch.duprDoubles !== undefined) row.dupr_doubles = patch.duprDoubles;
    if (patch.duprId !== undefined) {
      const v = patch.duprId?.trim() || null;
      if (v && !/^[A-Za-z0-9-]{3,20}$/.test(v)) throw new ClubError('A DUPR ID is letters and numbers only');
      row.dupr_id = v;
    }
    check(await this.sb.from('club_players').update(row).eq('id', id));
  }

  async setRole(clubId: string, userId: string, role: Role) { check(await this.sb.rpc('set_member_role', { cid: clubId, member: userId, new_role: role })); }
  async removeMember(clubId: string, userId: string) { check(await this.sb.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId)); }
  async leaveClub(clubId: string) { check(await this.sb.rpc('leave_club', { cid: clubId })); }

  async createTournament(input: NewTournamentInput) {
    if (input.name.trim().length < 2) throw new ClubError('Give the tournament a name');
    const mode = input.entryMode ?? 'roster';
    for (const d of input.divisions) { const e = checkDivisionSetup(d, input.listingOnly ? 'registration' : mode); if (e) throw new ClubError(e); }
    const ps = (check(await this.sb.from('club_players').select('*').eq('club_id', input.clubId)) as Row[]).map(toPlayer);
    const rows = buildTournamentRows(input, new Map(ps.map((p) => [p.id, p])), newId);
    const t = rows.tournament;
    check(await this.sb.from('tournaments').insert({
      id: t.id, club_id: t.clubId, name: t.name, start_date: t.startDate, start_time: t.startTime, courts: t.courts, slot_minutes: t.slotMinutes, status: t.status, is_public: t.isPublic, public_slug: t.publicSlug,
      city: t.city || null, venue: t.venue || null, about: t.about || null, contact: t.contact || null, link: t.link || null, entry_mode: mode,
      registration_open: mode === 'registration', entries_close: t.entriesClose || null, upi_id: t.upiId || null,
    }));
    check(await this.sb.from('divisions').insert(rows.divisions.map((d) => ({ id: d.id, tournament_id: d.tournamentId, club_id: d.clubId, name: d.name, kind: d.kind, format: formatJson(d), pools: d.pools, advance: d.advance, sort: d.sort, ...fromRules(d.rules) }))));
    if (rows.entries.length) check(await this.sb.from('entries').insert(rows.entries.map((e) => ({ id: e.id, division_id: e.divisionId, club_id: e.clubId, player_ids: e.playerIds, seed: e.seed ?? null, pool: e.pool ?? null }))));
    if (rows.matches.length) check(await this.sb.from('club_matches').insert(rows.matches.map(fromMatch)));
    return t.id;
  }

  async tournamentBundle(id: string): Promise<TournamentBundle> {
    const uid = await this.uid();
    const t = toTournament(check(await this.sb.from('tournaments').select('*').eq('id', id).single()) as Row);
    const [club, role, divisions, entries, matches, players] = await Promise.all([
      this.sb.from('clubs').select('*').eq('id', t.clubId).single(),
      this.sb.from('club_members').select('role').eq('club_id', t.clubId).eq('user_id', uid).single(),
      this.sb.from('divisions').select('*').eq('tournament_id', id).order('sort'),
      this.sb.from('entries').select('*, divisions!inner(tournament_id)').eq('divisions.tournament_id', id),
      this.sb.from('club_matches').select('*').eq('tournament_id', id),
      this.sb.from('club_players').select('*').eq('club_id', t.clubId),
    ]);
    return {
      club: toClub(check(club) as Row), role: (check(role) as Row).role as Role, tournament: t,
      divisions: (check(divisions) as Row[]).map(toDivision), entries: (check(entries) as Row[]).map(toEntry),
      matches: (check(matches) as Row[]).map(toMatch), players: (check(players) as Row[]).map(toPlayer),
    };
  }

  async updateTournament(id: string, patch: Partial<Pick<ClubTournament, 'status' | 'isPublic'>>) {
    const row: Row = {};
    if (patch.status) row.status = patch.status;
    if (patch.isPublic !== undefined) row.is_public = patch.isPublic;
    check(await this.sb.from('tournaments').update(row).eq('id', id));
  }

  async addMatches(rows: NewMatchRow[]) { if (rows.length) check(await this.sb.from('club_matches').insert(rows.map(fromMatch))); }

  async matchBundle(matchId: string): Promise<MatchBundle> {
    const uid = await this.uid();
    const m = toMatch(check(await this.sb.from('club_matches').select('*').eq('id', matchId).single()) as Row);
    const [club, role, players, t, d] = await Promise.all([
      this.sb.from('clubs').select('*').eq('id', m.clubId).single(),
      this.sb.from('club_members').select('role').eq('club_id', m.clubId).eq('user_id', uid).single(),
      this.sb.from('club_players').select('*').eq('club_id', m.clubId),
      m.tournamentId ? this.sb.from('tournaments').select('*').eq('id', m.tournamentId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      m.divisionId ? this.sb.from('divisions').select('name').eq('id', m.divisionId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    const tr = check(t) as Row | null, dr = check(d) as Row | null;
    return {
      club: toClub(check(club) as Row), role: (check(role) as Row).role as Role, match: m, players: (check(players) as Row[]).map(toPlayer),
      tournament: tr ? toTournament(tr) : undefined, divisionName: dr ? String(dr.name) : undefined,
    };
  }

  async saveScore(matchId: string, patch: ScorePatch) {
    const uid = await this.uid();
    check(await this.sb.from('club_matches').update({ games: patch.games, status: patch.status, winner: patch.winner ?? null, played_on: patch.playedOn ?? null, updated_at: new Date().toISOString(), updated_by: uid }).eq('id', matchId));
  }

  async patchMatches(changes: { id: string; patch: MatchPatch }[]) {
    const now = new Date().toISOString();
    for (const { id, patch } of changes) {
      const row: Row = { updated_at: now, updated_by: await this.uid() };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.winner !== undefined) row.winner = patch.winner;
      if (patch.games !== undefined) row.games = patch.games;
      if (patch.court !== undefined) row.court = patch.court;
      if (patch.slot !== undefined) row.slot = patch.slot;
      if (patch.sideA !== undefined) row.side_a = patch.sideA;
      if (patch.sideB !== undefined) row.side_b = patch.sideB;
      const res = check(await this.sb.from('club_matches').update(row).eq('id', id).select('id')) as Row[];
      if (!res.length) throw new ClubError('You can’t change this match');
    }
  }

  async addEntry(e: Entry) {
    check(await this.sb.from('entries').insert({ id: e.id, division_id: e.divisionId, club_id: e.clubId, player_ids: e.playerIds, seed: e.seed ?? null, pool: e.pool ?? null, status: e.status ?? 'active' }));
  }

  async updateEntry(id: string, patch: EntryPatch) {
    const row: Row = {};
    if (patch.playerIds) row.player_ids = patch.playerIds;
    if (patch.status) row.status = patch.status;
    if (patch.pool !== undefined) row.pool = patch.pool;
    const res = check(await this.sb.from('entries').update(row).eq('id', id).select('id')) as Row[];
    if (!res.length) throw new ClubError('You can’t change this entry');
  }

  async scorerLinks(tournamentId: string): Promise<ScorerLink[]> {
    const rows = check(await this.sb.from('scorer_links').select('*').eq('tournament_id', tournamentId).order('court', { ascending: true, nullsFirst: false })) as Row[];
    return rows.map(toLink);
  }

  async createScorerLinks(tournamentId: string, clubId: string, courts: (number | null)[]) {
    const rows = check(await this.sb.from('scorer_links').insert(courts.map((c) => ({ tournament_id: tournamentId, club_id: clubId, court: c }))).select('*')) as Row[];
    return rows.map(toLink);
  }

  async updateScorerLink(id: string, patch: { revoked?: boolean; pin?: string }) {
    if (patch.pin !== undefined && !/^\d{4,6}$/.test(patch.pin)) throw new ClubError('A PIN is 4 to 6 digits');
    const row: Row = { failed_attempts: 0, locked_until: null };
    if (patch.revoked !== undefined) row.revoked = patch.revoked;
    if (patch.pin !== undefined) row.pin = patch.pin;
    check(await this.sb.from('scorer_links').update(row).eq('id', id));
  }

  async scorerOpen(token: string, pin: string): Promise<ScorerView> {
    const r = check(await this.sb.rpc('scorer_open', { p_token: token, p_pin: pin })) as Row | null;
    if (!r) throw new ClubError('This scorer link isn’t valid. Ask the organiser for a new one.');
    if (r.error) throw new ClubError(String(r.error));
    return toScorerView(r);
  }

  async scorerSave(token: string, pin: string, matchId: string, patch: ScorePatch) {
    const r = check(await this.sb.rpc('scorer_save', { p_token: token, p_pin: pin, p_match: matchId, p_games: patch.games, p_status: patch.status, p_winner: patch.winner ?? null, p_played_on: patch.playedOn ?? null })) as Row | null;
    if (r?.error) throw new ClubError(String(r.error));
  }

  async setMySharing(playerId: string, share: Share) { check(await this.sb.rpc('set_my_sharing', { pid: playerId, choice: share })); }
  async shareMySummary(playerId: string, data: SummaryData) { check(await this.sb.rpc('share_my_summary', { pid: playerId, summary: data })); }

  async publicTournament(slug: string): Promise<PublicTournament | null> {
    const r = check(await this.sb.rpc('public_tournament', { slug })) as Row | null;
    if (!r) return null;
    return {
      name: String(r.name), startDate: String(r.start_date), startTime: String(r.start_time ?? '08:00').slice(0, 5), slotMinutes: Number(r.slot_minutes ?? 20), status: r.status as PublicTournament['status'], club: String(r.club),
      divisions: (r.divisions as Row[]).map((d) => ({ id: String(d.id), name: String(d.name), kind: d.kind as Division['kind'], pools: Number(d.pools), advance: Number(d.advance), ...formats(d.format) })),
      entries: (r.entries as Row[]).map((e) => ({ id: String(e.id), divisionId: String(e.division_id), seed: n(e.seed), pool: n(e.pool), names: (e.names as string[]) ?? [] })),
      matches: (r.matches as Row[]).map((m) => ({
        id: String(m.id), divisionId: s(m.division_id), stage: m.stage as ClubMatch['stage'], pool: n(m.pool), round: n(m.round), bracketPos: n(m.bracket_pos),
        slot: n(m.slot), court: n(m.court), entryA: s(m.entry_a), entryB: s(m.entry_b), games: ((m.games as Row[]) ?? []).map((g) => ({ points: '', a: Number(g.a), b: Number(g.b) })),
        status: m.status as ClubMatch['status'], winner: (m.winner as ClubMatch['winner']) ?? undefined,
      })),
    };
  }

  async myClubMatches(): Promise<MyClubMatches[]> {
    const uid = await this.uid();
    const mine = (check(await this.sb.from('club_players').select('*').eq('user_id', uid)) as Row[]).map(toPlayer);
    const out: MyClubMatches[] = [];
    for (const p of mine) {
      const [club, players, tournaments, a, b] = await Promise.all([
        this.sb.from('clubs').select('*').eq('id', p.clubId).single(),
        this.sb.from('club_players').select('*').eq('club_id', p.clubId),
        this.sb.from('tournaments').select('*').eq('club_id', p.clubId),
        this.sb.from('club_matches').select('*').eq('club_id', p.clubId).eq('status', 'done').contains('side_a', [p.id]),
        this.sb.from('club_matches').select('*').eq('club_id', p.clubId).eq('status', 'done').contains('side_b', [p.id]),
      ]);
      out.push({
        club: toClub(check(club) as Row), playerId: p.id, players: (check(players) as Row[]).map(toPlayer),
        tournaments: (check(tournaments) as Row[]).map(toTournament), matches: [...(check(a) as Row[]), ...(check(b) as Row[])].map(toMatch),
      });
    }
    return out;
  }

  // ---------- Module 2: events board, registration, entries inbox, approval ----------

  async updateTournamentDetails(id: string, patch: TournamentDetails) {
    const row: Row = {};
    const text = (v: string | undefined) => (v?.trim() ? v.trim() : null);
    if (patch.name !== undefined) { if (patch.name.trim().length < 2) throw new ClubError('Give the tournament a name'); row.name = patch.name.trim(); }
    if (patch.startDate !== undefined) row.start_date = patch.startDate;
    if (patch.startTime !== undefined) row.start_time = patch.startTime;
    for (const [k, col] of [['city', 'city'], ['venue', 'venue'], ['about', 'about'], ['contact', 'contact'], ['link', 'link'], ['upiId', 'upi_id'], ['entriesClose', 'entries_close']] as const) {
      if (patch[k] !== undefined) row[col] = text(patch[k]);
    }
    if (patch.registrationOpen !== undefined) row.registration_open = patch.registrationOpen;
    if (row.link && !/^https:\/\/[^\s<>"]+$/.test(String(row.link))) throw new ClubError('A link starts with https://');
    if (row.upi_id && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(String(row.upi_id))) throw new ClubError('A UPI ID looks like name@bank');
    const res = check(await this.sb.from('tournaments').update(row).eq('id', id).select('id')) as Row[];
    if (!res.length) throw new ClubError('You can’t change this tournament');
  }

  async submitListing(id: string, listing: Listing): Promise<ListingStatus> {
    const r = answer<{ status: string }>(check(await this.sb.rpc('submit_listing', { p_tournament: id, p_listing: listing })));
    return r.status as ListingStatus;
  }

  async publicEvents(includeTest = false): Promise<PublicEvent[]> {
    return ((check(await this.sb.rpc('public_events', { p_include_test: includeTest })) as Row[]) ?? []).map(toEvent);
  }

  async publicEvent(slug: string): Promise<PublicEvent | null> {
    const r = check(await this.sb.rpc('public_event', { p_slug: slug })) as Row | null;
    return r ? toEvent(r) : null;
  }

  async recentResults(includeTest = false): Promise<PublicEvent[]> {
    return ((check(await this.sb.rpc('recent_results', { p_include_test: includeTest })) as Row[]) ?? []).map(toEvent);
  }

  async setPoster(t: ClubTournament, image: Blob): Promise<string> {
    const path = `${t.clubId}/${t.id}.jpg`;
    const up = await this.sb.storage.from('posters').upload(path, image, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (up.error) throw new ClubError(/row-level|policy|Unauthorized|403/i.test(up.error.message) ? 'Only the club’s coaches and admins can change the poster' : `The poster didn’t upload: ${up.error.message}`);
    const url = `${this.sb.storage.from('posters').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const res = check(await this.sb.from('tournaments').update({ poster_url: url }).eq('id', t.id).select('id')) as Row[];
    if (!res.length) throw new ClubError('You can’t change this tournament');
    return url;
  }

  async registerEntry(divisionId: string, players: EntryPerson[], payment: 'unpaid' | 'venue' | 'claimed', paymentRef?: string) {
    await this.uid();
    const r = answer<{ id: string; status: string }>(check(await this.sb.rpc('register_entry', { p_division: divisionId, p_players: players.map(fromPerson), p_payment: payment, p_payment_ref: paymentRef?.trim() || null })));
    return { id: String(r.id), status: r.status as Registration['status'] };
  }

  async myEntries(): Promise<MyEntry[]> {
    const rows = (check(await this.sb.rpc('my_entries')) as Row[]) ?? [];
    return rows.map((r) => ({
      id: String(r.id), status: r.status as MyEntry['status'], payment: r.payment as MyEntry['payment'], paymentRef: s(r.payment_ref), note: s(r.note),
      players: ((r.players as Row[]) ?? []).map(toPerson), division: String(r.division), kind: r.kind as MyEntry['kind'], fee: n(r.fee), slug: String(r.slug),
      tournament: String(r.tournament), startDate: String(r.start_date), startTime: String(r.start_time ?? '').slice(0, 5), city: s(r.city), venue: s(r.venue),
      club: String(r.club), upiId: s(r.upi_id), drawn: !!r.drawn, results: !!r.results,
    }));
  }

  async withdrawMyEntry(id: string) { answer(check(await this.sb.rpc('withdraw_my_entry', { p_id: id }))); }

  async registrations(tournamentId: string): Promise<Registration[]> {
    return (check(await this.sb.from('registrations').select('*').eq('tournament_id', tournamentId).order('created_at')) as Row[]).map(toRegistration);
  }

  async updateRegistration(id: string, patch: RegistrationPatch) {
    const row: Row = {};
    if (patch.status) row.status = patch.status;
    if (patch.payment) row.payment = patch.payment;
    if (patch.note !== undefined) row.note = patch.note?.trim() || null;
    if (patch.players) row.players = patch.players.map(fromPerson);
    if (patch.divisionId) row.division_id = patch.divisionId;
    const res = check(await this.sb.from('registrations').update(row).eq('id', id).select('id')) as Row[];
    if (!res.length) throw new ClubError('You can’t change this entry');
  }

  async addOfflineEntry(e: OfflineEntry) {
    check(await this.sb.from('registrations').insert({ tournament_id: e.tournamentId, division_id: e.divisionId, club_id: e.clubId, source: 'offline', players: e.players.map(fromPerson), status: e.status, payment: e.payment }));
  }

  async importEntries(tournamentId: string, rows: ImportEntryRow[]): Promise<ImportResult> {
    const r = answer<Row>(check(await this.sb.rpc('import_entries', { p_tournament: tournamentId, p_rows: rows.map((x) => ({ division: x.divisionId, players: x.players.map(fromPerson), status: x.status, payment: x.payment })) })));
    return { added: Number(r.added ?? 0), waitlisted: Number(r.waitlisted ?? 0), skipped: Number(r.skipped ?? 0), problems: ((r.problems as Row[]) ?? []).map((p) => ({ row: Number(p.row), error: String(p.error) })) };
  }

  async checkEntry(divisionId: string, players: EntryPerson[], exceptId?: string): Promise<string | null> {
    const r = check(await this.sb.rpc('check_entry', { p_division: divisionId, p_players: players.map(fromPerson), p_except: exceptId ?? null })) as Row | null;
    return r?.error ? String(r.error) : null;
  }

  async applyDraw(tournamentId: string, plan: DrawPlan) {
    const t = toTournament(check(await this.sb.from('tournaments').select('*').eq('id', tournamentId).single()) as Row);
    if (t.drawnAt) throw new ClubError('The draw is already made');
    check(await this.sb.from('club_players').insert(plan.players.map((p) => ({ id: p.id, club_id: p.clubId, name: p.name, dupr_singles: p.duprSingles ?? null, dupr_doubles: p.duprDoubles ?? null, dupr_id: p.duprId ?? null }))));
    if (plan.timing) check(await this.sb.from('tournaments').update({ courts: plan.timing.courts, slot_minutes: plan.timing.slotMinutes, start_time: plan.timing.startTime }).eq('id', tournamentId));
    for (const d of plan.divisions) check(await this.sb.from('divisions').update({ pools: d.pools, advance: d.advance, format: formatJson(d) }).eq('id', d.id));
    check(await this.sb.from('entries').insert(plan.entries.map((e) => ({ id: e.id, division_id: e.divisionId, club_id: e.clubId, player_ids: e.playerIds, seed: e.seed ?? null, pool: e.pool ?? null }))));
    check(await this.sb.from('club_matches').insert(plan.matches.map(fromMatch)));
    for (const l of plan.links) check(await this.sb.from('registrations').update({ entry_id: l.entryId }).eq('id', l.registrationId));
    check(await this.sb.from('tournaments').update({ drawn_at: new Date().toISOString(), registration_open: false }).eq('id', tournamentId));
  }

  async isPlatformAdmin() {
    if (!(await this.currentUser())) return false;
    return !!check(await this.sb.rpc('is_platform_admin'));
  }

  async listingQueue(): Promise<ListingReview[]> {
    const rows = check(await this.sb.rpc('listing_queue')) as Row[] | null;
    if (!rows) throw new ClubError('Only PaddleQ admins can review listings');
    return rows.map((r) => ({
      id: String(r.id), name: String(r.name), startDate: String(r.start_date), startTime: String(r.start_time ?? '').slice(0, 5), city: s(r.city), venue: s(r.venue),
      about: s(r.about), contact: s(r.contact), link: s(r.link), listing: r.listing as Listing, listingStatus: r.listing_status as ListingStatus,
      rejectReason: s(r.reject_reason), reviewedAt: s(r.reviewed_at), slug: String(r.slug), club: String(r.club), verified: !!r.verified, postedBy: s(r.posted_by), posterUrl: s(r.poster_url),
      divisions: ((r.divisions as Row[]) ?? []).map((d) => ({ name: String(d.name), kind: d.kind as Division['kind'], rules: toRules(d) })),
    }));
  }

  async reviewListing(id: string, approve: boolean, reason?: string) {
    answer(check(await this.sb.rpc('review_listing', { p_tournament: id, p_approve: approve, p_reason: reason ?? null })));
  }

  async addPlatformAdmin(email: string) { answer(check(await this.sb.rpc('add_platform_admin', { p_email: email }))); }

  async platformAdmins() {
    const rows = check(await this.sb.rpc('platform_admin_list')) as Row[] | null;
    return (rows ?? []).map((r) => ({ email: String(r.email), addedAt: String(r.added_at) }));
  }

  // ---------- Admin dashboard (club_mode_15_admin_dashboard) ----------
  async adminOverview(): Promise<AdminOverview> {
    const r = answer(check(await this.sb.rpc('admin_overview')));
    const num = (k: string) => Number(r[k] ?? 0);
    return {
      clubs: num('clubs'), verifiedClubs: num('verified_clubs'), upcoming: num('upcoming'), live: num('live'), finished: num('finished'), toReview: num('to_review'),
      entriesWeek: num('entries_week'), matchesWeek: num('matches_week'), accounts: num('accounts'), accountsWeek: num('accounts_week'),
      weeks: ((r.weeks as Row[]) ?? []).map((w) => ({ week: String(w.week), matches: Number(w.matches ?? 0) })),
    };
  }

  async adminClubs(): Promise<AdminClub[]> {
    return adminList(check(await this.sb.rpc('admin_clubs'))).map((r) => ({
      id: String(r.id), name: String(r.name), city: s(r.city), verified: !!r.verified, isTest: !!r.is_test,
      owners: ((r.owners as unknown[]) ?? []).map(String), members: Number(r.members ?? 0), tournaments: Number(r.tournaments ?? 0), lastEvent: s(r.last_event),
    }));
  }

  async adminClub(id: string): Promise<AdminClubDetail> {
    const r = answer(check(await this.sb.rpc('admin_club', { p_club: id })));
    return {
      id: String(r.id), name: String(r.name), city: s(r.city), verified: !!r.verified, isTest: !!r.is_test,
      people: ((r.people as Row[]) ?? []).map((p) => ({ name: String(p.name ?? ''), email: s(p.email), role: p.role as Role, helper: !!p.helper })),
      tournaments: ((r.tournaments as Row[]) ?? []).map((t) => ({ id: String(t.id), name: String(t.name), startDate: String(t.start_date), status: t.status as ClubTournament['status'] })),
    };
  }

  async setClubVerified(id: string, verified: boolean) { answer(check(await this.sb.rpc('admin_set_club_verified', { p_club: id, p_verified: verified }))); }

  async adminTournaments(): Promise<AdminTournament[]> {
    return adminList(check(await this.sb.rpc('admin_tournaments'))).map((r) => ({
      id: String(r.id), name: String(r.name), club: String(r.club), clubId: String(r.club_id), isTest: !!r.is_test, startDate: String(r.start_date),
      startTime: String(r.start_time ?? '').slice(0, 5), status: r.status as ClubTournament['status'], listing: (r.listing as Listing) ?? 'none',
      listingStatus: (r.listing_status as ListingStatus) ?? 'none', slug: String(r.slug ?? ''), results: !!r.results, registrations: Number(r.registrations ?? 0),
      matches: Number(r.matches ?? 0), matchesDone: Number(r.matches_done ?? 0), eventPin: s(r.event_pin),
      helpers: ((r.helpers as Row[]) ?? []).map((h) => ({ name: String(h.name ?? ''), addedAt: String(h.added_at ?? '') })),
    }));
  }

  async adminSetTournamentStatus(id: string, status: 'live' | 'done') {
    answer(check(await this.sb.rpc('admin_set_tournament_status', { p_tournament: id, p_status: status })));
  }

  async removePlatformAdmin(email: string) { answer(check(await this.sb.rpc('remove_platform_admin', { p_email: email }))); }
}

/** Admin list functions answer an array, or {"error": …} for someone who isn't an admin. */
function adminList(r: unknown): Row[] {
  if (Array.isArray(r)) return r as Row[];
  answer(r);
  return [];
}
