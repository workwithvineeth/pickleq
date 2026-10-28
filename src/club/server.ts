import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId } from '../db/db';
import type { Format } from '../domain/types';
import { ClubError, type ClubBackend, type ClubBundle, type MatchBundle, type MyClub, type MyClubMatches, type PublicTournament, type ScorePatch, type TournamentBundle } from './backend';
import { buildTournamentRows, checkDivision, type NewMatchRow, type NewTournamentInput } from './plan';
import type { Club, ClubMatch, ClubPlayer, ClubTournament, Division, Entry, Member, Role, Share, SharedSummary, SummaryData } from './types';

/* Row shapes as stored on the server (snake_case). */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const n = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

const toClub = (r: Row): Club => ({ id: String(r.id), name: String(r.name), city: s(r.city), inviteCode: String(r.invite_code), settings: (r.settings as Club['settings']) ?? {} });
const toPlayer = (r: Row): ClubPlayer => ({
  id: String(r.id), clubId: String(r.club_id), name: String(r.name), duprSingles: n(r.dupr_singles), duprDoubles: n(r.dupr_doubles),
  userId: s(r.user_id), claimCode: s(r.claim_code), share: (r.share as Share) ?? {}, sample: !!r.sample,
});
const toTournament = (r: Row): ClubTournament => ({
  id: String(r.id), clubId: String(r.club_id), name: String(r.name), startDate: String(r.start_date), startTime: String(r.start_time).slice(0, 5),
  courts: Number(r.courts), slotMinutes: Number(r.slot_minutes), status: r.status as ClubTournament['status'], isPublic: !!r.is_public, publicSlug: String(r.public_slug),
});
const formats = (f: unknown): { pool: Format; ko: Format } => {
  const x = f as { pool?: Format; ko?: Format } & Partial<Format>;
  if (x?.pool) return { pool: x.pool, ko: x.ko ?? x.pool };
  return { pool: x as Format, ko: x as Format };
};
const toDivision = (r: Row): Division => {
  const f = formats(r.format);
  return { id: String(r.id), tournamentId: String(r.tournament_id), clubId: String(r.club_id), name: String(r.name), kind: r.kind as Division['kind'], format: f.pool, koFormat: f.ko, pools: Number(r.pools), advance: Number(r.advance), sort: Number(r.sort ?? 0) };
};
const toEntry = (r: Row): Entry => ({ id: String(r.id), divisionId: String(r.division_id), clubId: String(r.club_id), playerIds: r.player_ids as string[], seed: n(r.seed), pool: n(r.pool) });
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
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'pq-club-auth' } });
  }

  async currentUser() {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }

  async sendCode(email: string) {
    check(await this.sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } }));
  }

  async verifyCode(email: string, code: string) {
    check(await this.sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }));
    // Pick up any club roles waiting for this email.
    check(await this.sb.rpc('claim_pending'));
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

  async updatePlayer(id: string, patch: { name?: string; duprSingles?: number | null; duprDoubles?: number | null }) {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.duprSingles !== undefined) row.dupr_singles = patch.duprSingles;
    if (patch.duprDoubles !== undefined) row.dupr_doubles = patch.duprDoubles;
    check(await this.sb.from('club_players').update(row).eq('id', id));
  }

  async setRole(clubId: string, userId: string, role: Role) { check(await this.sb.rpc('set_member_role', { cid: clubId, member: userId, new_role: role })); }
  async removeMember(clubId: string, userId: string) { check(await this.sb.from('club_members').delete().eq('club_id', clubId).eq('user_id', userId)); }
  async leaveClub(clubId: string) { check(await this.sb.rpc('leave_club', { cid: clubId })); }

  async createTournament(input: NewTournamentInput) {
    if (input.name.trim().length < 2) throw new ClubError('Give the tournament a name');
    for (const d of input.divisions) { const e = checkDivision(d); if (e) throw new ClubError(e); }
    const ps = (check(await this.sb.from('club_players').select('*').eq('club_id', input.clubId)) as Row[]).map(toPlayer);
    const rows = buildTournamentRows(input, new Map(ps.map((p) => [p.id, p])), newId);
    const t = rows.tournament;
    check(await this.sb.from('tournaments').insert({ id: t.id, club_id: t.clubId, name: t.name, start_date: t.startDate, start_time: t.startTime, courts: t.courts, slot_minutes: t.slotMinutes, status: t.status, is_public: t.isPublic, public_slug: t.publicSlug }));
    check(await this.sb.from('divisions').insert(rows.divisions.map((d) => ({ id: d.id, tournament_id: d.tournamentId, club_id: d.clubId, name: d.name, kind: d.kind, format: { pool: d.format, ko: d.koFormat }, pools: d.pools, advance: d.advance, sort: d.sort }))));
    check(await this.sb.from('entries').insert(rows.entries.map((e) => ({ id: e.id, division_id: e.divisionId, club_id: e.clubId, player_ids: e.playerIds, seed: e.seed ?? null, pool: e.pool ?? null }))));
    check(await this.sb.from('club_matches').insert(rows.matches.map(fromMatch)));
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

  async setMySharing(playerId: string, share: Share) { check(await this.sb.rpc('set_my_sharing', { pid: playerId, choice: share })); }
  async shareMySummary(playerId: string, data: SummaryData) { check(await this.sb.rpc('share_my_summary', { pid: playerId, summary: data })); }

  async publicTournament(slug: string): Promise<PublicTournament | null> {
    const r = check(await this.sb.rpc('public_tournament', { slug })) as Row | null;
    if (!r) return null;
    return {
      name: String(r.name), startDate: String(r.start_date), startTime: String(r.start_time ?? '08:00').slice(0, 5), slotMinutes: Number(r.slot_minutes ?? 20), status: r.status as PublicTournament['status'], club: String(r.club),
      divisions: (r.divisions as Row[]).map((d) => { const f = formats(d.format); return { id: String(d.id), name: String(d.name), kind: d.kind as Division['kind'], pools: Number(d.pools), advance: Number(d.advance), format: f.pool, koFormat: f.ko }; }),
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
}
