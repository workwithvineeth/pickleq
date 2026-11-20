import { cleanLog, cleanSession, logProblem, ratingProblem, sessionProblem, type RatingKind, type StudioRatingInput, type ClaimPreview, type FoundPlayer, type MyPlayer, type OfficialMatch, type StudioData, type StudioGoal, type StudioLog, type StudioLogInput, type StudioSession, type StudioSessionInput, type StudioSettings } from './playerStudio';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId } from '../db/ids';
import type { Format } from '../domain/types';
import { ClubError, type ClaimEmailOutcome, type ClaimEmailStatus, type ClaimStatus, type SupportSession, type AdminClub, type AdminClubDetail, type AdminMember, type AdminOverview, type AdminTournament, type ClubBackend, type EntryPatch, type ListingReview, type ApprovalRequest, type NewTestimonial, type MatchPatch, type ClubBundle, type MatchBundle, type MyClub, type MyClubMatches, type MyEntry, type ImportEntryRow, type ImportResult, type OfflineEntry, type PinSignIn, type PublicEvent, type PublicTournament, type RegistrationPatch, type ScorePatch, type TournamentAccess, type DeskLabel, type LatePerson, type LatePayment, type TournamentBundle, type TournamentDetails } from './backend';
import { authMessage, LEAKED_PASSWORD, passwordLeaked, passwordProblem } from './authText';
import { buildTournamentRows, checkDivisionSetup, type NewMatchRow, type NewTournamentInput } from './plan';
import { cleanEmail, type DrawPlan } from './registration';
import type { Approval, Club, ClubMatch, ScoringMode, HostingStatus, Testimonial, TestimonialStatus, ClubPlayer, ClubTournament, Division, DivisionRules, Entry, EntryPerson, Listing, ListingStatus, Member, Registration, Role, ScorerLink, ScorerView, Share, SharedSummary, SummaryData } from './types';
import { isApproved, NOT_APPROVED, PICK_NEEDS_TRUST } from './types';
import { teamNames } from './teamName';

/* Row shapes as stored on the server (snake_case). */
type Row = Record<string, unknown>;
/** Roster columns the app may read (claim_code is server-only since Module 4). */
/** The optional side-out keys of a stored game (rallies, scoring mode, first server), when present. */
const rallyKeys = (g: Row) => ({ ...(typeof g.rallies === 'string' && g.rallies ? { rallies: g.rallies } : {}), ...(g.mode === 'sideout' || g.mode === 'rally' ? { mode: g.mode as ScoringMode } : {}), ...(g.serve === 'A' || g.serve === 'B' ? { serve: g.serve as 'A' | 'B' } : {}) });
const PLAYER_COLS = 'id,club_id,name,dupr_singles,dupr_doubles,dupr_id,user_id,share,sample,created_at,claimed_at';
const s = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const n = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

const toClub = (r: Row): Club => ({ id: String(r.id), name: String(r.name), city: s(r.city), inviteCode: String(r.invite_code), settings: (r.settings as Club['settings']) ?? {}, logoUrl: s(r.logo_url),
  hosting: (s(r.hosting) as Club['hosting']) ?? undefined, hostingReason: s(r.hosting_reason), hostingPhone: s(r.hosting_phone), trusted: !!r.trusted });
const toPlayer = (r: Row): ClubPlayer => ({
  id: String(r.id), clubId: String(r.club_id), name: String(r.name), duprSingles: n(r.dupr_singles), duprDoubles: n(r.dupr_doubles),
  duprId: s(r.dupr_id), userId: s(r.user_id), claimedAt: s(r.claimed_at), share: (r.share as Share) ?? {}, sample: !!r.sample,
});
const toTournament = (r: Row): ClubTournament => ({
  id: String(r.id), clubId: String(r.club_id), name: String(r.name), startDate: String(r.start_date), startTime: String(r.start_time).slice(0, 5),
  courts: Number(r.courts), slotMinutes: Number(r.slot_minutes), status: r.status as ClubTournament['status'], isPublic: !!r.is_public, publicSlug: String(r.public_slug),
  city: s(r.city), venue: s(r.venue), about: s(r.about), contact: s(r.contact), link: s(r.link), entryMode: r.entry_mode === 'registration' ? 'registration' : 'roster',
  registrationOpen: !!r.registration_open, entriesClose: s(r.entries_close), upiId: s(r.upi_id), listing: (r.listing as Listing) ?? 'none',
  listingStatus: (r.listing_status as ListingStatus) ?? 'none', rejectReason: s(r.reject_reason), reviewedAt: s(r.reviewed_at), drawnAt: s(r.drawn_at), posterUrl: s(r.poster_url),
  approval: (s(r.approval) as Approval) ?? 'approved', approvalReason: s(r.approval_reason), approvalRequestedAt: s(r.approval_requested_at), approvalExpected: n(r.approval_expected),
  cancelledAt: s(r.cancelled_at), cancelReason: s(r.cancel_reason), archivedAt: s(r.archived_at),
});
const toTestimonial = (r: Row): Testimonial => ({
  id: String(r.id), clubId: String(r.club_id), club: s(r.club), rating: Number(r.rating), quote: String(r.quote ?? ''), personName: String(r.person_name ?? ''),
  personRole: String(r.person_role ?? ''), photoPath: s(r.photo_path), status: r.status as TestimonialStatus, featured: !!r.featured, createdAt: String(r.created_at),
});
const toRules = (r: Row): DivisionRules => ({ maxDupr: n(r.max_dupr), ...(r.dupr_cap === 'average' ? { duprCap: 'average' as const } : {}), gender: (r.gender as DivisionRules['gender']) ?? 'open', minAge: n(r.min_age), cap: n(r.cap), fee: n(r.fee) });
const fromRules = (r?: DivisionRules): Row => ({ max_dupr: r?.maxDupr ?? null, dupr_cap: r?.duprCap === 'average' ? 'average' : 'each', gender: r?.gender ?? 'open', min_age: r?.minAge ?? null, cap: r?.cap ?? null, fee: r?.fee ?? null });
const toPerson = (p: Row): EntryPerson => ({ name: String(p.name ?? ''), phone: String(p.phone ?? ''), ...(p.email ? { email: String(p.email) } : {}), duprId: s(p.duprId), dupr: n(p.dupr), gender: (p.gender as EntryPerson['gender']) ?? '', age: n(p.age), ...(p.adult === true ? { adult: true } : {}) });
const fromPerson = (p: EntryPerson): Row => ({ name: p.name.trim(), phone: p.phone.trim(), ...(p.email?.trim() ? { email: p.email.trim().toLowerCase() } : {}), duprId: p.duprId?.trim().toUpperCase() || '', dupr: p.dupr ?? null, gender: p.gender, age: p.age ?? null, ...(p.adult && p.age === undefined ? { adult: true } : {}) });
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
      playedOn: s(m.played_on), namesA: teamNames((m.names_a as string[]) ?? []), namesB: teamNames((m.names_b as string[]) ?? []),
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

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
const toMyPlayer = (r: Row): MyPlayer => ({ playerId: String(r.player_id), name: String(r.name), club: String(r.club), claimedAt: String(r.claimed_at ?? ''), duprSingles: num(r.dupr_singles), duprDoubles: num(r.dupr_doubles) });
const toPreview = (r: Row): ClaimPreview => ({
  playerId: String(r.player_id), name: String(r.name), club: String(r.club ?? ''), matches: Number(r.matches ?? 0), wins: Number(r.wins ?? 0),
  tournaments: ((r.tournaments as Row[] | null) ?? []).map((t) => ({ name: String(t.name), date: String(t.date) })),
});
const toOfficial = (r: Row): OfficialMatch => ({
  id: String(r.id), club: String(r.club), tournament: String(r.tournament), tournamentId: String(r.tournament_id), division: s(r.division),
  kind: (s(r.kind) as OfficialMatch['kind']) ?? undefined, stage: r.stage as OfficialMatch['stage'], playedOn: String(r.played_on), format: (r.format as OfficialMatch['format']) ?? {},
  games: ((r.games as Row[] | null) ?? []).map((g) => ({ a: Number(g.a), b: Number(g.b), ...(g.points ? { points: String(g.points) } : {}), ...rallyKeys(g) })),
  winner: r.winner as 'A' | 'B', mySide: r.my_side as 'A' | 'B', me: String(r.me),
  sideA: ((r.side_a as Row[] | null) ?? []).map((p) => ({ id: String(p.id), name: String(p.name) })),
  sideB: ((r.side_b as Row[] | null) ?? []).map((p) => ({ id: String(p.id), name: String(p.name) })),
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

/** Like check(), for sign-in calls: the server's wording becomes something a person can act on. */
function auth<R extends { data: unknown; error: { message: string } | null }>(res: R): R['data'] {
  if (res.error) throw new ClubError(authMessage(res.error.message));
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

  async studioLogs(): Promise<StudioLog[]> {
    const rows = check(await this.sb.from('player_studio_logs')
      .select('id,kind,played_on,opponents,partner,location,score_for,score_against,reflection,tags,match_type,games,energy,shot_ratings,setting,opponent_strength,created_at')
      .order('played_on', { ascending: false }).order('created_at', { ascending: false })) as Row[];
    return rows.map((r) => ({
      id: String(r.id), kind: r.kind as StudioLog['kind'], played_on: String(r.played_on), opponents: String(r.opponents), partner: String(r.partner ?? ''),
      location: String(r.location ?? ''), score_for: Number(r.score_for), score_against: Number(r.score_against), reflection: String(r.reflection ?? ''),
      tags: (r.tags as StudioLog['tags']) ?? {}, match_type: (r.match_type as StudioLog['match_type']) ?? null, games: (r.games as StudioLog['games']) ?? [],
      energy: r.energy == null ? null : Number(r.energy), shot_ratings: (r.shot_ratings as StudioLog['shot_ratings']) ?? {},
      setting: (r.setting as StudioLog['setting']) ?? null, opponent_strength: (r.opponent_strength as StudioLog['opponent_strength']) ?? null, created_at: s(r.created_at),
    }));
  }

  async saveStudioLog(input: StudioLogInput, id?: string): Promise<void> {
    const bad = logProblem(input);
    if (bad) throw new ClubError(bad);
    const table = this.sb.from('player_studio_logs');
    const row = cleanLog(input);
    const write = id ? table.update(row).eq('id', id) : table.insert(row);
    check(await write.select('id').single());
  }

  // ---------- Player Studio (Phase 3 Module 3): claim, official history, diary ----------

  async studioData(): Promise<StudioData> {
    const [players, official, logs, sessions, settings, ratings] = await Promise.all([
      this.sb.rpc('studio_my_players'), this.sb.rpc('studio_official_history'), this.studioLogs(),
      this.sb.from('player_studio_sessions').select('id,session_on,kind,minutes,intensity,drills,ratings,note,created_at').order('session_on', { ascending: false }).order('created_at', { ascending: false }),
      this.sb.from('player_studio_settings').select('use_official,goals').maybeSingle(),
      this.sb.from('player_studio_ratings').select('id,kind,value,rated_on').order('rated_on', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    const st = check(settings) as Row | null;
    return {
      players: ((check(players) as Row[] | null) ?? []).map(toMyPlayer),
      official: ((check(official) as Row[] | null) ?? []).map(toOfficial),
      logs,
      sessions: ((check(sessions) as Row[] | null) ?? []).map((r) => ({
        id: String(r.id), session_on: String(r.session_on), kind: r.kind as StudioSession['kind'], minutes: Number(r.minutes), intensity: r.intensity == null ? null : Number(r.intensity),
        drills: (r.drills as StudioSession['drills']) ?? [], ratings: (r.ratings as StudioSession['ratings']) ?? {}, note: String(r.note ?? ''), created_at: String(r.created_at),
      })),
      ratings: ((check(ratings) as Row[] | null) ?? []).map((r) => ({ id: String(r.id), kind: r.kind as RatingKind, value: Number(r.value), rated_on: String(r.rated_on) })),
      settings: { useOfficial: st ? st.use_official !== false : true, goals: (st?.goals as StudioGoal[] | undefined) ?? [] },
    };
  }

  async saveStudioRating(input: StudioRatingInput, id?: string) {
    const bad = ratingProblem(input);
    if (bad) throw new ClubError(bad);
    const row = { kind: input.kind, value: Math.round(input.value * 1000) / 1000, rated_on: input.rated_on };
    const table = this.sb.from('player_studio_ratings');
    check(await (id ? table.update(row).eq('id', id) : table.insert(row)).select('id').single());
  }

  async deleteStudioRating(id: string) {
    const gone = check(await this.sb.from('player_studio_ratings').delete().eq('id', id).select('id')) as Row[];
    if (!gone.length) throw new ClubError('That reading is already gone');
  }

  async deleteStudioLog(id: string) {
    const gone = check(await this.sb.from('player_studio_logs').delete().eq('id', id).select('id')) as Row[];
    if (!gone.length) throw new ClubError('That match is already gone');
  }

  async saveStudioSession(input: StudioSessionInput, id?: string): Promise<void> {
    const bad = sessionProblem(input);
    if (bad) throw new ClubError(bad);
    const row = cleanSession(input);
    const table = this.sb.from('player_studio_sessions');
    check(await (id ? table.update(row).eq('id', id) : table.insert(row)).select('id').single());
  }

  async deleteStudioSession(id: string) {
    const gone = check(await this.sb.from('player_studio_sessions').delete().eq('id', id).select('id')) as Row[];
    if (!gone.length) throw new ClubError('That session is already gone');
  }

  async saveStudioSettings(s: StudioSettings) {
    const uid = await this.uid();
    check(await this.sb.from('player_studio_settings').upsert({ user_id: uid, use_official: s.useOfficial, goals: s.goals.slice(0, 5), updated_at: new Date().toISOString() }));
  }

  /** Deletes every practice session, casual/practice match and DUPR reading you logged. Official results stay (they belong to the club). */
  async deleteMyDiary() {
    const uid = await this.uid();
    check(await this.sb.from('player_studio_sessions').delete().eq('owner_id', uid));
    check(await this.sb.from('player_studio_logs').delete().eq('owner_id', uid));
    check(await this.sb.from('player_studio_ratings').delete().eq('owner_id', uid));
  }

  async claimPreview(token: string): Promise<ClaimPreview | { error: string; mine?: boolean }> {
    const r = check(await this.sb.rpc('studio_claim_preview', { p_token: token })) as Row;
    if (r.error) return { error: String(r.error), mine: !!r.mine };
    return toPreview(r);
  }

  async foundPlayers(): Promise<FoundPlayer[]> {
    return ((check(await this.sb.rpc('studio_found_players')) as Row[] | null) ?? []).map(toPreview);
  }

  async claimPlayer(token: string | null, playerId: string | null, useInStats: boolean) {
    check(await this.sb.rpc('studio_claim', { p_token: token, p_player: playerId, p_use_in_stats: useInStats }));
  }

  async unclaimPlayer(playerId: string) { check(await this.sb.rpc('studio_unclaim', { p_player: playerId })); }

  // ---------- Module 4: player emails and emailed claim links (organisers) ----------

  /** Emails and email status for a tournament's players. Staff only (the tables' own rules). */
  async claimStatus(tournamentId: string, playerIds: string[]): Promise<ClaimStatus> {
    const [emails, log] = await Promise.all([
      playerIds.length ? this.sb.from('club_player_emails').select('player_id,email').in('player_id', playerIds) : Promise.resolve({ data: [], error: null }),
      this.sb.from('claim_email_log').select('player_id,status,sent_to,created_at').eq('tournament_id', tournamentId).order('created_at', { ascending: false }),
    ]);
    const out: ClaimStatus = { emails: {}, emailed: {} };
    for (const r of (check(emails) as Row[] | null) ?? []) out.emails[String(r.player_id)] = String(r.email);
    for (const r of (check(log) as Row[] | null) ?? []) {
      const pid = String(r.player_id ?? '');
      if (pid && !out.emailed[pid]) out.emailed[pid] = { status: r.status as ClaimEmailStatus, sentTo: String(r.sent_to), at: String(r.created_at) };
    }
    return out;
  }

  async setPlayerEmail(clubId: string, playerId: string, email: string | null) {
    const e = email?.trim().toLowerCase() || null;
    if (e && !cleanEmail(e)) throw new ClubError('That isn’t an email address');
    if (e) check(await this.sb.from('club_player_emails').upsert({ player_id: playerId, club_id: clubId, email: e }));
    else check(await this.sb.from('club_player_emails').delete().eq('player_id', playerId));
  }

  /** Sends the claim link by email (Edge Function send-claim-email, through Brevo) to players with an email. */
  async emailClaimLinks(tournamentId: string, playerIds?: string[]): Promise<ClaimEmailOutcome> {
    const { data, error } = await this.sb.functions.invoke('send-claim-email', { body: { tournament_id: tournamentId, player_ids: playerIds ?? null } });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const status = ctx?.status;
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) as Row | null : null;
      if (body?.error) throw new ClubError(String(body.error));
      if (status === 404) throw new ClubError('Emailing results isn’t switched on yet. Send the links on WhatsApp for now.');
      throw new ClubError('Emails didn’t go out just now. Check your internet and try again.');
    }
    const r = (data ?? {}) as Row;
    if (r.error) throw new ClubError(String(r.error));
    return { sent: Number(r.sent ?? 0), failed: Number(r.failed ?? 0), skipped: Number(r.skipped ?? 0), limited: !!r.limited, test: !!r.test };
  }

  /** Undo a Player Studio claim (the wrong person claimed). Logged. */
  async unlinkPlayer(playerId: string) { check(await this.sb.rpc('staff_unlink_player', { p_player: playerId })); }

  /** The organiser's private claim link for one player (made on first ask, reused after). */
  async claimLink(playerId: string): Promise<{ claimed: true } | { claimed: false; token: string }> {
    const r = check(await this.sb.rpc('studio_claim_link', { p_player: playerId })) as Row;
    return r.claimed ? { claimed: true } : { claimed: false, token: String(r.token) };
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
    check(await this.sb.rpc('claim_pending'));
    return {};
  }

  async passwordSignIn(email: string, password: string) {
    auth(await this.sb.auth.signInWithPassword({ email: email.trim(), password }));
    check(await this.sb.rpc('claim_pending'));
  }

  async signUp(email: string, password: string) {
    const bad = passwordProblem(password);
    if (bad) throw new ClubError(bad);
    if (await passwordLeaked(password)) throw new ClubError(LEAKED_PASSWORD);
    const back = `${window.location.origin}${window.location.pathname}`;
    const data = auth(await this.sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: back } }));
    // An email that already has an account comes back with no identities (Supabase hides that it exists).
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new ClubError(authMessage('already registered'));
    if (data.session) { check(await this.sb.rpc('claim_pending')); return false; }
    return true;
  }

  async confirmEmail(email: string, code: string) {
    const e = email.trim(), token = code.replace(/\s/g, '');
    const first = await this.sb.auth.verifyOtp({ email: e, token, type: 'signup' });
    if (first.error) auth(await this.sb.auth.verifyOtp({ email: e, token, type: 'email' }));
    check(await this.sb.rpc('claim_pending'));
  }

  async resendConfirm(email: string) { auth(await this.sb.auth.resend({ type: 'signup', email: email.trim() })); }

  async sendPasswordReset(email: string) {
    const back = `${window.location.origin}${window.location.pathname}`;
    auth(await this.sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: back }));
  }

  async resetPassword(email: string, code: string, password: string) {
    const bad = passwordProblem(password);
    if (bad) throw new ClubError(bad);
    if (await passwordLeaked(password)) throw new ClubError(LEAKED_PASSWORD);
    auth(await this.sb.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'recovery' }));
    auth(await this.sb.auth.updateUser({ password }));
    check(await this.sb.rpc('claim_pending'));
  }

  async setMyPassword(password: string) {
    const bad = passwordProblem(password);
    if (bad) throw new ClubError(bad);
    if (await passwordLeaked(password)) throw new ClubError(LEAKED_PASSWORD);
    auth(await this.sb.auth.updateUser({ password }));
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

  async tournamentAccess(tournamentId: string): Promise<TournamentAccess> {
    const r = answer(check(await this.sb.rpc('tournament_access', { p_tournament: tournamentId })));
    return { refereePin: String(r.referee_pin), deskPin: String(r.desk_pin), deskToken: String(r.desk_token) };
  }

  async setDeskPin(tournamentId: string, pin?: string) {
    if (pin !== undefined && !/^\d{4,6}$/.test(pin)) throw new ClubError('A PIN is 4 to 6 digits');
    return String(check(await this.sb.rpc('set_desk_pin', { p_tournament: tournamentId, p_pin: pin ?? null })));
  }

  async newDeskLink(tournamentId: string) { return String(check(await this.sb.rpc('new_desk_link', { p_tournament: tournamentId }))); }

  // ---------- The desk: its own link and desk PIN, no account ----------

  async deskLabel(token: string): Promise<DeskLabel | null> {
    const r = check(await this.sb.rpc('desk_label', { p_token: token })) as Row | null;
    return r ? { club: String(r.club), logoUrl: s(r.logo_url), tournament: String(r.tournament) } : null;
  }

  async deskOpen(token: string, pin: string): Promise<TournamentBundle> {
    const r = answer(check(await this.sb.rpc('desk_open', { p_token: token, p_pin: pin })));
    const c = r.club as Row;
    return {
      club: { id: String(c.id), name: String(c.name), city: s(c.city), inviteCode: '', settings: (c.settings as Club['settings']) ?? {}, logoUrl: s(c.logo_url) },
      role: 'coach', desk: true, tournament: toTournament(r.tournament as Row),
      divisions: ((r.divisions as Row[]) ?? []).map(toDivision), entries: ((r.entries as Row[]) ?? []).map(toEntry),
      matches: ((r.matches as Row[]) ?? []).map(toMatch), players: ((r.players as Row[]) ?? []).map(toPlayer),
    };
  }

  async deskSaveScore(token: string, pin: string, matchId: string, patch: ScorePatch) {
    answer(check(await this.sb.rpc('desk_save_score', { p_token: token, p_pin: pin, p_match: matchId, p_games: patch.games, p_status: patch.status, p_winner: patch.winner ?? null, p_played_on: patch.playedOn ?? null })));
  }

  async deskPatchMatches(token: string, pin: string, changes: { id: string; patch: MatchPatch }[]) {
    const rows = changes.map(({ id, patch }) => {
      const p: Row = {};
      if (patch.status !== undefined) p.status = patch.status;
      if (patch.winner !== undefined) p.winner = patch.winner;
      if (patch.games !== undefined) p.games = patch.games;
      if (patch.court !== undefined) p.court = patch.court;
      if (patch.slot !== undefined) p.slot = patch.slot;
      if (patch.sideA !== undefined) p.side_a = patch.sideA;
      if (patch.sideB !== undefined) p.side_b = patch.sideB;
      return { id, patch: p };
    });
    if (rows.length) answer(check(await this.sb.rpc('desk_patch_matches', { p_token: token, p_pin: pin, p_changes: rows })));
  }

  async deskAddLatePoolEntry(token: string, pin: string, e: Entry, matches: NewMatchRow[]) {
    answer(check(await this.sb.rpc('desk_add_late_pool_entry', {
      p_token: token, p_pin: pin,
      p_entry: { id: e.id, division_id: e.divisionId, club_id: e.clubId, player_ids: e.playerIds, seed: e.seed, pool: e.pool, status: e.status },
      p_matches: matches.map(fromMatch),
    })));
  }

  async deskAddEntry(token: string, pin: string, e: Entry) {
    answer(check(await this.sb.rpc('desk_add_entry', { p_token: token, p_pin: pin, p_entry: { id: e.id, division_id: e.divisionId, player_ids: e.playerIds, seed: e.seed ?? null, pool: e.pool ?? null } })));
  }

  async deskUpdateEntry(token: string, pin: string, id: string, patch: EntryPatch) {
    const p: Row = {};
    if (patch.playerIds) p.player_ids = patch.playerIds;
    if (patch.status) p.status = patch.status;
    if (patch.pool !== undefined) p.pool = patch.pool;
    answer(check(await this.sb.rpc('desk_update_entry', { p_token: token, p_pin: pin, p_entry: id, p_patch: p })));
  }

  async deskAddMatches(token: string, pin: string, rows: NewMatchRow[]) {
    if (rows.length) answer(check(await this.sb.rpc('desk_add_matches', { p_token: token, p_pin: pin, p_rows: rows.map(fromMatch) })));
  }

  async deskAddPlayer(token: string, pin: string, p: { name: string; dupr?: number }) {
    return toPlayer(answer(check(await this.sb.rpc('desk_add_player', { p_token: token, p_pin: pin, p_name: p.name, p_dupr: p.dupr ?? null }))));
  }

  async deskStart(token: string, pin: string) { answer(check(await this.sb.rpc('desk_start', { p_token: token, p_pin: pin }))); }

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
      this.sb.from('club_players').select(PLAYER_COLS).eq('club_id', clubId).order('name'),
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
    const c = toClub(check(club) as Row);
    // The owner's phone and note are only for the club's owner and admins (and RallyQ admins): club_mode_19.
    if (me.role === 'owner' || me.role === 'admin') {
      const k = check(await this.sb.from('club_contacts').select('phone, note').eq('club_id', clubId)) as Row[];
      if (k[0]) { c.hostingPhone = s(k[0].phone); c.hostingNote = s(k[0].note); }
    }
    return {
      club: c, role: me.role as Role, myPlayerId: ps.find((p) => p.userId === uid)?.id,
      members: ms.map((m): Member => ({ userId: String(m.user_id), role: m.role as Role, name: nameOf(m.user_id) })),
      players: ps,
      tournaments: (check(tournaments) as Row[]).map(toTournament),
      matches: (check(matches) as Row[]).map(toMatch),
      summaries: (check(summaries) as Row[]).map((r): SharedSummary => ({ playerId: String(r.player_id), data: r.data as SummaryData, updatedAt: String(r.updated_at) })),
    };
  }

  async addPlayer(clubId: string, p: { name: string; duprSingles?: number; duprDoubles?: number }) {
    const row = check(await this.sb.from('club_players').insert({ club_id: clubId, name: p.name.trim(), dupr_singles: p.duprSingles ?? null, dupr_doubles: p.duprDoubles ?? null }).select(PLAYER_COLS).single()) as Row;
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
    const changed = check(await this.sb.from('club_players').update(row).eq('id', id).select('id')) as Row[];
    if (!changed.length) throw new ClubError('You can’t change this player. No details were saved for them.');
  }

  async setRole(clubId: string, userId: string, role: Role) { check(await this.sb.rpc('set_member_role', { cid: clubId, member: userId, new_role: role })); }
  async removeMember(clubId: string, userId: string) { check(await this.sb.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId)); }
  async leaveClub(clubId: string) { check(await this.sb.rpc('leave_club', { cid: clubId })); }

  async createTournament(input: NewTournamentInput) {
    if (input.name.trim().length < 2) throw new ClubError('Give the tournament a name');
    const mode = input.entryMode ?? 'roster';
    if (input.platformDraft && (mode !== 'registration' || input.listingOnly || input.divisions.some((d) => d.entries.length))) {
      throw new ClubError('A platform draft must use player registration without existing entries');
    }
    for (const d of input.divisions) { const e = checkDivisionSetup(d, input.listingOnly ? 'registration' : mode); if (e) throw new ClubError(e); }
    const ps = input.platformDraft ? [] : (check(await this.sb.from('club_players').select(PLAYER_COLS).eq('club_id', input.clubId)) as Row[]).map(toPlayer);
    const rows = buildTournamentRows(input, new Map(ps.map((p) => [p.id, p])), newId);
    const t = rows.tournament;
    const tournament = {
      id: t.id, club_id: t.clubId, name: t.name, start_date: t.startDate, start_time: t.startTime, courts: t.courts, slot_minutes: t.slotMinutes, status: t.status, is_public: t.isPublic, public_slug: t.publicSlug,
      city: t.city || null, venue: t.venue || null, about: t.about || null, contact: t.contact || null, link: t.link || null, entry_mode: mode,
      registration_open: false, entries_close: t.entriesClose || null, upi_id: t.upiId || null,
    };
    const divisions = rows.divisions.map((d) => ({ id: d.id, tournament_id: d.tournamentId, club_id: d.clubId, name: d.name, kind: d.kind, format: formatJson(d), pools: d.pools, advance: d.advance, sort: d.sort, ...fromRules(d.rules) }));
    if (input.platformDraft) {
      check(await this.sb.rpc('create_platform_tournament_draft', {
        p_tournament: tournament,
        p_divisions: divisions,
      }));
      return t.id;
    }
    // Picking the players makes the draw at once, which needs approval: only trusted clubs can do that in one step.
    if (rows.matches.length) {
      const club = check(await this.sb.from('clubs').select('trusted, is_test').eq('id', input.clubId).single()) as Row;
      if (!club.trusted && !club.is_test) throw new ClubError(PICK_NEEDS_TRUST);
    }
    check(await this.sb.from('tournaments').insert(tournament));
    check(await this.sb.from('divisions').insert(divisions));
    if (rows.entries.length) check(await this.sb.from('entries').insert(rows.entries.map((e) => ({ id: e.id, division_id: e.divisionId, club_id: e.clubId, player_ids: e.playerIds, seed: e.seed ?? null, pool: e.pool ?? null }))));
    if (rows.matches.length) check(await this.sb.from('club_matches').insert(rows.matches.map(fromMatch)));
    return t.id;
  }

  async resultsBundle(id: string): Promise<TournamentBundle> {
    const r = answer(check(await this.sb.rpc('tournament_results_bundle', { p_tournament: id })));
    const c = r.club as Row;
    return {
      club: { id: String(c.id), name: String(c.name), city: s(c.city), inviteCode: '', settings: {}, logoUrl: s(c.logo_url) },
      role: r.role as Role, tournament: toTournament(r.tournament as Row),
      divisions: ((r.divisions as Row[]) ?? []).map(toDivision), entries: ((r.entries as Row[]) ?? []).map(toEntry),
      matches: ((r.matches as Row[]) ?? []).map(toMatch), players: ((r.players as Row[]) ?? []).map(toPlayer),
    };
  }

  async adminUpdateTournamentDupr(tournamentId: string, playerId: string, patch: { duprSingles?: number; duprDoubles?: number; duprId?: string }) {
    answer(check(await this.sb.rpc('admin_update_tournament_dupr', { p_tournament: tournamentId, p_player: playerId, p_patch: patch })));
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
      this.sb.from('club_players').select(PLAYER_COLS).eq('club_id', t.clubId),
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
      this.sb.from('club_players').select(PLAYER_COLS).eq('club_id', m.clubId),
      m.tournamentId ? this.sb.from('tournaments').select('*').eq('id', m.tournamentId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      m.divisionId ? this.sb.from('divisions').select('name').eq('id', m.divisionId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    const tr = check(t) as Row | null, dr = check(d) as Row | null;
    return {
      club: toClub(check(club) as Row), role: (check(role) as Row).role as Role, match: m, players: (check(players) as Row[]).map(toPlayer),
      tournament: tr ? toTournament(tr) : undefined, divisionName: dr ? String(dr.name) : undefined,
    };
  }

  async correctMatch(match: ClubMatch, games: ClubMatch['games'], reason: string) {
    check(await this.sb.rpc('correct_club_match', { p_match: match.id, p_games: games, p_reason: reason, p_updated_at: match.updatedAt }));
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

  async addLateTeam(people: LatePerson[], payment: LatePayment, e: Entry, matches: NewMatchRow[]) {
    check(await this.sb.rpc('add_late_team', {
      p_people: people.map((p) => ({ id: p.id, ...fromPerson(p) })), p_payment: payment,
      p_entry: { id: e.id, division_id: e.divisionId, club_id: e.clubId, player_ids: e.playerIds, seed: e.seed, pool: e.pool, status: e.status },
      p_matches: matches.map(fromMatch),
    }));
  }

  async deskAddLateTeam(token: string, pin: string, people: LatePerson[], payment: LatePayment, e: Entry, matches: NewMatchRow[]) {
    answer(check(await this.sb.rpc('desk_add_late_team', {
      p_token: token, p_pin: pin, p_people: people.map((p) => ({ id: p.id, ...fromPerson(p) })), p_payment: payment,
      p_entry: { id: e.id, division_id: e.divisionId, club_id: e.clubId, player_ids: e.playerIds, seed: e.seed, pool: e.pool, status: e.status },
      p_matches: matches.map(fromMatch),
    })));
  }

  async addLatePoolEntry(e: Entry, matches: NewMatchRow[]) {
    check(await this.sb.rpc('add_late_pool_entry', {
      p_entry: { id: e.id, division_id: e.divisionId, club_id: e.clubId, player_ids: e.playerIds, seed: e.seed, pool: e.pool, status: e.status },
      p_matches: matches.map(fromMatch),
    }));
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
    if (!r) throw new ClubError('This referee link isn’t valid. Ask the organiser for a new one.');
    if (r.error) throw new ClubError(String(r.error));
    return toScorerView(r);
  }

  async scorerSave(token: string, pin: string, matchId: string, patch: ScorePatch) {
    const r = check(await this.sb.rpc('scorer_save', { p_token: token, p_pin: pin, p_match: matchId, p_games: patch.games, p_status: patch.status, p_winner: patch.winner ?? null, p_played_on: patch.playedOn ?? null })) as Row | null;
    if (r?.error) throw new ClubError(String(r.error));
  }

  async setMySharing(playerId: string, share: Share) { check(await this.sb.rpc('set_my_sharing', { pid: playerId, choice: share })); }
  async shareMySummary(playerId: string, data: SummaryData) { check(await this.sb.rpc('share_my_summary', { pid: playerId, summary: data })); }

  async publicTournamentRev(slug: string): Promise<string | null> {
    const r = check(await this.sb.rpc('public_tournament_rev', { slug }));
    return typeof r === 'string' ? r : null;
  }

  async publicTournament(slug: string): Promise<PublicTournament | null> {
    const r = check(await this.sb.rpc('public_tournament', { slug })) as Row | null;
    if (!r) return null;
    return {
      name: String(r.name), startDate: String(r.start_date), startTime: String(r.start_time ?? '08:00').slice(0, 5), slotMinutes: Number(r.slot_minutes ?? 20), status: r.status as PublicTournament['status'], club: String(r.club),
      divisions: (r.divisions as Row[]).map((d) => ({ id: String(d.id), name: String(d.name), kind: d.kind as Division['kind'], pools: Number(d.pools), advance: Number(d.advance), ...formats(d.format) })),
      entries: (r.entries as Row[]).map((e) => ({ id: String(e.id), divisionId: String(e.division_id), seed: n(e.seed), pool: n(e.pool), names: teamNames((e.names as string[]) ?? []), duprs: ((e.duprs as (number | string | null)[] | null) ?? []).map((x) => (x === null || x === undefined || x === '' ? undefined : Number(x))) })),
      matches: (r.matches as Row[]).map((m) => ({
        id: String(m.id), divisionId: s(m.division_id), stage: m.stage as ClubMatch['stage'], pool: n(m.pool), round: n(m.round), bracketPos: n(m.bracket_pos),
        slot: n(m.slot), court: n(m.court), entryA: s(m.entry_a), entryB: s(m.entry_b), games: ((m.games as Row[]) ?? []).map((g) => ({ points: '', a: Number(g.a), b: Number(g.b), ...rallyKeys(g) })),
        status: m.status as ClubMatch['status'], winner: (m.winner as ClubMatch['winner']) ?? undefined,
      })),
    };
  }

  async myClubMatches(): Promise<MyClubMatches[]> {
    const uid = await this.uid();
    const mine = (check(await this.sb.from('club_players').select(PLAYER_COLS).eq('user_id', uid)) as Row[]).map(toPlayer);
    const out: MyClubMatches[] = [];
    for (const p of mine) {
      const [club, players, tournaments, a, b] = await Promise.all([
        this.sb.from('clubs').select('*').eq('id', p.clubId).single(),
        this.sb.from('club_players').select(PLAYER_COLS).eq('club_id', p.clubId),
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
    check(await this.sb.rpc('add_walk_in_registration', { p_division: e.divisionId, p_players: e.players.map(fromPerson), p_payment: e.payment }));
  }

  async importEntries(tournamentId: string, rows: ImportEntryRow[]): Promise<ImportResult> {
    const r = answer<Row>(check(await this.sb.rpc('import_entries', { p_tournament: tournamentId, p_rows: rows.map((x) => ({ division: x.divisionId, players: x.players.map(fromPerson), status: x.status, payment: x.payment })) })));
    return { added: Number(r.added ?? 0), waitlisted: Number(r.waitlisted ?? 0), skipped: Number(r.skipped ?? 0), problems: ((r.problems as Row[]) ?? []).map((p) => ({ row: Number(p.row), error: String(p.error) })) };
  }

  async checkEntry(divisionId: string, players: EntryPerson[], exceptId?: string): Promise<string | null> {
    const r = check(await this.sb.rpc('check_entry', { p_division: divisionId, p_players: players.map(fromPerson), p_except: exceptId ?? null })) as Row | null;
    return r?.error ? String(r.error) : null;
  }

  async startSupport(clubId: string, reason: string) { return (check(await this.sb.rpc('admin_start_support', { p_club: clubId, p_reason: reason })) as string | null) ?? null; }
  async endSupport(clubId: string) { check(await this.sb.rpc('admin_end_support', { p_club: clubId })); }
  async supportSessions() { return ((check(await this.sb.rpc('my_support_sessions')) as SupportSession[] | null) ?? []); }
  async deleteTournament(id: string, confirmName: string) { check(await this.sb.rpc('delete_tournament', { p_tournament: id, p_confirm_name: confirmName })); }
  async cancelTournament(id: string, reason: string) { check(await this.sb.rpc('cancel_tournament', { p_tournament: id, p_reason: reason })); }
  async archiveTournament(id: string, archive: boolean) { check(await this.sb.rpc('archive_tournament', { p_tournament: id, p_archive: archive })); }
  async platformAudit() {
    return ((check(await this.sb.from('platform_audit').select('at, action, detail, club_id, tournament_id').order('at', { ascending: false }).limit(200)) as Row[]) ?? [])
      .map((r) => ({ at: String(r.at), action: String(r.action), detail: String(r.detail ?? ''), clubId: s(r.club_id), tournamentId: s(r.tournament_id) }));
  }

  async addKnockoutStage(division: Division, advance: number) {
    if (division.shape === 'ko' || division.advance > 0) throw new ClubError('This event already has knockouts');
    check(await this.sb.from('divisions').update({ advance, format: formatJson({ ...division, shape: undefined, extra: 0 }) }).eq('id', division.id));
  }

  async applyDraw(tournamentId: string, plan: DrawPlan) {
    const t = toTournament(check(await this.sb.from('tournaments').select('*').eq('id', tournamentId).single()) as Row);
    if (t.drawnAt) throw new ClubError('The draw is already made');
    if (!isApproved(t)) throw new ClubError(NOT_APPROVED);
    check(await this.sb.from('club_players').insert(plan.players.map((p) => ({ id: p.id, club_id: p.clubId, name: p.name, dupr_singles: p.duprSingles ?? null, dupr_doubles: p.duprDoubles ?? null, dupr_id: p.duprId ?? null }))));
    // Emails live in their own table (staff and the player only), never on the roster.
    const emails = plan.players.filter((p) => p.email).map((p) => ({ player_id: p.id, club_id: p.clubId, email: p.email! }));
    if (emails.length) check(await this.sb.from('club_player_emails').insert(emails));
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
    if (!rows) throw new ClubError('Only RallyQ admins can review listings');
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
      id: String(r.id), name: String(r.name), city: s(r.city), verified: !!r.verified, isTest: !!r.is_test, trusted: !!r.trusted, hosting: (String(r.hosting ?? 'approved') as HostingStatus), logoUrl: s(r.logo_url), hostingPhone: s(r.hosting_phone), hostingNote: s(r.hosting_note), hostingReason: s(r.hosting_reason), hostingRequestedAt: s(r.hosting_requested_at),
      owners: ((r.owners as unknown[]) ?? []).map(String), members: Number(r.members ?? 0), tournaments: Number(r.tournaments ?? 0), lastEvent: s(r.last_event),
    }));
  }

  async adminClub(id: string): Promise<AdminClubDetail> {
    const r = answer(check(await this.sb.rpc('admin_club', { p_club: id })));
    return {
      id: String(r.id), name: String(r.name), city: s(r.city), verified: !!r.verified, isTest: !!r.is_test, hosting: (String(r.hosting ?? 'approved') as HostingStatus), logoUrl: s(r.logo_url), hostingPhone: s(r.hosting_phone), hostingNote: s(r.hosting_note), hostingReason: s(r.hosting_reason), hostingRequestedAt: s(r.hosting_requested_at),
      people: ((r.people as Row[]) ?? []).map((p) => ({ name: String(p.name ?? ''), email: s(p.email), role: p.role as Role, helper: !!p.helper })),
      tournaments: ((r.tournaments as Row[]) ?? []).map((t) => ({ id: String(t.id), name: String(t.name), startDate: String(t.start_date), status: t.status as ClubTournament['status'] })),
    };
  }

  async setClubHosting(id: string, approve: boolean, reason?: string) { answer(check(await this.sb.rpc('admin_set_club_hosting', { p_club: id, p_approve: approve, p_reason: reason ?? null }))); }
  async requestHosting(clubId: string, phone: string, note: string) { answer(check(await this.sb.rpc('request_hosting', { p_club: clubId, p_phone: phone, p_note: note }))); }
  async setClubVerified(id: string, verified: boolean) { answer(check(await this.sb.rpc('admin_set_club_verified', { p_club: id, p_verified: verified }))); }

  // ---------- Tournament approval ----------
  async submitTournament(id: string, expectedPlayers?: number): Promise<Approval> {
    const r = answer(check(await this.sb.rpc('submit_tournament', { p_tournament: id, p_expected: expectedPlayers ?? null })));
    return r.status as Approval;
  }
  async approvalQueue(): Promise<ApprovalRequest[]> {
    return adminList(check(await this.sb.rpc('approval_queue'))).map((r) => ({
      id: String(r.id), name: String(r.name), startDate: String(r.start_date), startTime: String(r.start_time ?? '').slice(0, 5), city: s(r.city), venue: s(r.venue),
      club: String(r.club), clubId: String(r.club_id), trusted: !!r.trusted, upiId: s(r.upi_id), entryMode: r.entry_mode === 'registration' ? 'registration' : 'roster',
      listing: (r.listing as Listing) ?? 'none', approval: r.approval as Approval, reason: s(r.reason), expected: n(r.expected), requestedAt: s(r.requested_at),
      decidedAt: s(r.decided_at), courts: Number(r.courts ?? 0), entries: Number(r.entries ?? 0), mine: !!r.mine,
      divisions: ((r.divisions as Row[]) ?? []).map((d) => ({ name: String(d.name), kind: d.kind as Division['kind'], fee: n(d.fee), cap: n(d.cap) })),
    }));
  }
  async decideTournament(id: string, approve: boolean, reason?: string) {
    answer(check(await this.sb.rpc('admin_decide_tournament', { p_tournament: id, p_approve: approve, p_reason: reason ?? null })));
  }
  async setClubTrusted(id: string, trusted: boolean) { answer(check(await this.sb.rpc('admin_set_club_trusted', { p_club: id, p_trusted: trusted }))); }

  // ---------- Testimonials ----------
  private async withPhotoUrls(list: Testimonial[]): Promise<Testimonial[]> {
    const paths = list.map((t) => t.photoPath).filter((p): p is string => !!p);
    if (!paths.length) return list;
    const { data } = await this.sb.storage.from('testimonials').createSignedUrls(paths, 3600);
    const urls = new Map<string, string>((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [String(d.path), String(d.signedUrl)]));
    return list.map((t): Testimonial => (t.photoPath ? { ...t, photoUrl: urls.get(t.photoPath) } : t));
  }
  async clubTestimonials(clubId: string): Promise<Testimonial[]> {
    const rows = check(await this.sb.from('club_testimonials').select('*').eq('club_id', clubId).neq('status', 'withdrawn').order('created_at', { ascending: false })) as Row[];
    return this.withPhotoUrls(rows.map(toTestimonial));
  }
  async submitTestimonial(input: NewTestimonial) {
    let path: string | null = null;
    if (input.photo) {
      path = `${input.clubId}/${newId()}.jpg`;
      const up = await this.sb.storage.from('testimonials').upload(path, input.photo, { contentType: 'image/jpeg' });
      if (up.error) throw new ClubError(/row-level|policy|Unauthorized|403/i.test(up.error.message) ? 'Only the club’s owner and admins can add a photo' : `The photo didn’t upload: ${up.error.message}`);
    }
    try {
      answer(check(await this.sb.rpc('submit_testimonial', { p_club: input.clubId, p_rating: input.rating, p_quote: input.quote, p_name: input.personName, p_role: input.personRole, p_photo: path, p_consent: input.consent })));
    } catch (e) {
      if (path) await this.sb.storage.from('testimonials').remove([path]).catch(() => undefined);
      throw e;
    }
  }
  async withdrawTestimonial(id: string) {
    const r = answer(check(await this.sb.rpc('withdraw_testimonial', { p_id: id })));
    if (r.photo) await this.sb.storage.from('testimonials').remove([String(r.photo)]).catch(() => undefined);
  }
  async adminTestimonials(): Promise<Testimonial[]> { return this.withPhotoUrls(adminList(check(await this.sb.rpc('admin_testimonials'))).map(toTestimonial)); }
  async setTestimonial(id: string, status: 'approved' | 'hidden', featured: boolean) {
    answer(check(await this.sb.rpc('admin_set_testimonial', { p_id: id, p_status: status, p_featured: featured })));
  }

  async adminTournaments(): Promise<AdminTournament[]> {
    return adminList(check(await this.sb.rpc('admin_tournaments'))).map((r) => ({
      id: String(r.id), name: String(r.name), club: String(r.club), clubId: String(r.club_id), isTest: !!r.is_test, startDate: String(r.start_date),
      startTime: String(r.start_time ?? '').slice(0, 5), status: r.status as ClubTournament['status'], listing: (r.listing as Listing) ?? 'none',
      listingStatus: (r.listing_status as ListingStatus) ?? 'none', slug: String(r.slug ?? ''), results: !!r.results, registrations: Number(r.registrations ?? 0),
      matches: Number(r.matches ?? 0), matchesDone: Number(r.matches_done ?? 0), eventPin: s(r.event_pin),
      deskPin: s(r.desk_pin), deskToken: s(r.desk_token), deskUsedAt: s(r.desk_used_at),
    }));
  }

  async adminSetTournamentStatus(id: string, status: 'live' | 'done') {
    answer(check(await this.sb.rpc('admin_set_tournament_status', { p_tournament: id, p_status: status })));
  }

  async removePlatformAdmin(email: string) { answer(check(await this.sb.rpc('remove_platform_admin', { p_email: email }))); }

  async adminDeleteClub(clubId: string, confirmName: string) { check(await this.sb.rpc('admin_delete_club', { p_club: clubId, p_confirm_name: confirmName })); }
  async adminDeleteTournament(tournamentId: string, confirmName: string) { check(await this.sb.rpc('admin_delete_tournament', { p_tournament: tournamentId, p_confirm_name: confirmName })); }
  async adminEditMatchResult(match: ClubMatch, games: ClubMatch['games'], reason: string) {
    check(await this.sb.rpc('admin_edit_match_result', { p_match: match.id, p_games: games, p_reason: reason, p_updated_at: match.updatedAt }));
  }
  async adminClubMembers(clubId: string): Promise<AdminMember[]> {
    const rows = (check(await this.sb.rpc('admin_club_members', { p_club: clubId })) as Row[] | null) ?? [];
    return rows.map((r) => ({ userId: String(r.user_id), email: s(r.email), name: s(r.name), role: r.role as Role, helper: !!r.helper }));
  }
  async adminSetMemberRole(clubId: string, userId: string, role: Role) { check(await this.sb.rpc('admin_set_member_role', { p_club: clubId, p_user: userId, p_role: role })); }
  async adminAddClubMember(clubId: string, email: string, role: Role) {
    return check(await this.sb.rpc('admin_add_club_member', { p_club: clubId, p_email: email, p_role: role })) === 'invited' ? 'invited' as const : 'added' as const;
  }
  async adminRemoveClubMember(clubId: string, userId: string) { check(await this.sb.rpc('admin_remove_club_member', { p_club: clubId, p_user: userId })); }
}

/** Admin list functions answer an array, or {"error": …} for someone who isn't an admin. */
function adminList(r: unknown): Row[] {
  if (Array.isArray(r)) return r as Row[];
  answer(r);
  return [];
}
