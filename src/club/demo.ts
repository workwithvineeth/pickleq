import { newId } from '../db/db';
import { ClubError, type ClubBackend, type ClubBundle, type ClubUser, type MatchBundle, type MyClub, type MyClubMatches, type PublicTournament, type ScorePatch, type TournamentBundle } from './backend';
import { buildSampleClub } from './domain/sample';
import { buildTournamentRows, checkDivision, type NewMatchRow, type NewTournamentInput } from './plan';
import { isAdmin, isStaff, type Club, type ClubMatch, type ClubPlayer, type ClubTournament, type Division, type Entry, type Member, type Role, type Share, type SharedSummary, type SummaryData } from './types';

interface DemoState {
  v: 1;
  user: ClubUser | null;
  clubs: Club[];
  members: (Member & { clubId: string })[];
  players: ClubPlayer[];
  tournaments: ClubTournament[];
  divisions: Division[];
  entries: Entry[];
  matches: ClubMatch[];
  summaries: (SharedSummary & { clubId: string })[];
}

const KEY = 'pq-club-demo-v1';
const empty = (): DemoState => ({ v: 1, user: null, clubs: [], members: [], players: [], tournaments: [], divisions: [], entries: [], matches: [], summaries: [] });

/**
 * Club mode kept entirely on this phone, for trying it out. It follows the same rules as the club server
 * (who can see and change what), so it behaves the same. Nothing is sent anywhere.
 */
export class DemoBackend implements ClubBackend {
  readonly kind = 'demo' as const;
  private s: DemoState;
  private storage: Storage | null;

  constructor(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.storage = storage;
    this.s = this.load();
  }

  private load(): DemoState {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) { const v = JSON.parse(raw) as DemoState; if (v.v === 1) return v; }
    } catch { /* start fresh */ }
    return empty();
  }
  private save() { try { this.storage?.setItem(KEY, JSON.stringify(this.s)); } catch { /* storage full or blocked: keep in memory */ } }

  /** Signs in as you and creates Pickleball Central with its sample tournament (only the first time). */
  async start(name: string): Promise<string> {
    if (!this.s.user) this.s.user = { id: 'demo-you', email: 'demo (on this phone)' };
    let club = this.s.clubs.find((c) => c.name === 'Pickleball Central');
    if (!club) {
      const d = buildSampleClub(this.s.user.id, name.trim() || 'You');
      club = d.club;
      this.s.clubs.push(d.club);
      this.s.members.push(...d.members.map((m) => ({ ...m, clubId: d.club.id })));
      this.s.players.push(...d.players);
      this.s.tournaments.push(d.tournament);
      this.s.divisions.push(...d.divisions);
      this.s.entries.push(...d.entries);
      this.s.matches.push(...d.matches);
    }
    this.save();
    return club.id;
  }

  /** Removes the demo completely. */
  reset() { this.s = empty(); this.save(); }

  private me(): ClubUser {
    if (!this.s.user) throw new ClubError('Sign in first');
    return this.s.user;
  }
  private role(clubId: string): Role | null {
    const u = this.s.user;
    return u ? this.s.members.find((m) => m.clubId === clubId && m.userId === u.id)?.role ?? null : null;
  }
  private need(clubId: string, ok: (r: Role | null) => boolean, msg: string) { if (!ok(this.role(clubId))) throw new ClubError(msg); }
  private club(id: string): Club { const c = this.s.clubs.find((x) => x.id === id); if (!c) throw new ClubError('Club not found'); return c; }

  async currentUser() { return this.s.user; }
  async sendCode() { throw new ClubError('The demo signs you in without a code'); }
  async verifyCode() { throw new ClubError('The demo signs you in without a code'); }
  async signOut() { this.s.user = null; this.save(); }

  async myClubs(): Promise<MyClub[]> {
    const u = this.s.user;
    if (!u) return [];
    return this.s.members.filter((m) => m.userId === u.id).map((m) => ({
      club: this.club(m.clubId), role: m.role, myPlayerId: this.s.players.find((p) => p.clubId === m.clubId && p.userId === u.id)?.id,
    }));
  }

  async createClub(name: string, city: string, myName: string) {
    const u = this.me();
    if (name.trim().length < 2) throw new ClubError('Give the club a name');
    const club: Club = { id: newId(), name: name.trim(), city: city.trim() || undefined, inviteCode: newId().replace(/-/g, '').slice(0, 10), settings: {} };
    this.s.clubs.push(club);
    this.s.members.push({ clubId: club.id, userId: u.id, role: 'owner', name: myName.trim() || 'Me' });
    this.s.players.push({ id: newId(), clubId: club.id, name: myName.trim() || 'Me', userId: u.id, share: {} });
    this.save();
    return club.id;
  }

  async joinClub(code: string) {
    const club = this.s.clubs.find((c) => c.inviteCode === code.trim());
    if (!club) throw new ClubError('That invite link is not valid');
    if (!this.role(club.id)) throw new ClubError('In the demo you are already in Pickleball Central');
    return club.id;
  }

  async clubBundle(clubId: string): Promise<ClubBundle> {
    const role = this.role(clubId);
    if (!role) throw new ClubError('You are not in this club');
    const u = this.me();
    const players = this.s.players.filter((p) => p.clubId === clubId);
    const myPlayerId = players.find((p) => p.userId === u.id)?.id;
    return {
      club: this.club(clubId), role, myPlayerId,
      members: this.s.members.filter((m) => m.clubId === clubId).map(({ clubId: _c, ...m }) => m),
      players,
      tournaments: this.s.tournaments.filter((t) => t.clubId === clubId).sort((a, b) => b.startDate.localeCompare(a.startDate)),
      matches: this.s.matches.filter((m) => m.clubId === clubId),
      summaries: this.s.summaries.filter((x) => x.clubId === clubId && (isStaff(role) || x.playerId === myPlayerId)).map(({ clubId: _c, ...x }) => x),
    };
  }

  async addPlayer(clubId: string, p: { name: string; duprSingles?: number; duprDoubles?: number }) {
    this.need(clubId, isStaff, 'Only coaches and admins can add players');
    if (!p.name.trim()) throw new ClubError('Enter the player’s name');
    const row: ClubPlayer = { id: newId(), clubId, name: p.name.trim(), duprSingles: p.duprSingles, duprDoubles: p.duprDoubles, claimCode: newId().replace(/-/g, '').slice(0, 12), share: {} };
    this.s.players.push(row);
    this.save();
    return row;
  }

  async updatePlayer(id: string, patch: { name?: string; duprSingles?: number | null; duprDoubles?: number | null }) {
    const p = this.s.players.find((x) => x.id === id);
    if (!p) throw new ClubError('Player not found');
    this.need(p.clubId, isStaff, 'Only coaches and admins can edit players');
    if (patch.name !== undefined) p.name = patch.name.trim() || p.name;
    if (patch.duprSingles !== undefined) p.duprSingles = patch.duprSingles ?? undefined;
    if (patch.duprDoubles !== undefined) p.duprDoubles = patch.duprDoubles ?? undefined;
    this.save();
  }

  async setRole(clubId: string, userId: string, role: Role) {
    this.need(clubId, isAdmin, 'Only club admins can change roles');
    const m = this.s.members.find((x) => x.clubId === clubId && x.userId === userId);
    if (!m) throw new ClubError('Member not found');
    if (m.role === 'owner' || role === 'owner') throw new ClubError('The owner’s role can’t be changed');
    if (role === 'admin' && this.role(clubId) !== 'owner') throw new ClubError('Only the owner can make admins');
    m.role = role;
    this.save();
  }

  async removeMember(clubId: string, userId: string) {
    this.need(clubId, isAdmin, 'Only club admins can remove members');
    const m = this.s.members.find((x) => x.clubId === clubId && x.userId === userId);
    if (!m || m.role === 'owner') throw new ClubError('The owner can’t be removed');
    this.s.members = this.s.members.filter((x) => x !== m);
    this.save();
  }

  async leaveClub(clubId: string) {
    const u = this.me();
    if (this.role(clubId) === 'owner') throw new ClubError('The owner can’t leave. Hand over the club or delete it.');
    const mine = this.s.players.filter((p) => p.clubId === clubId && p.userId === u.id);
    this.s.summaries = this.s.summaries.filter((x) => !mine.some((p) => p.id === x.playerId));
    for (const p of mine) { p.userId = undefined; p.share = {}; }
    this.s.members = this.s.members.filter((m) => !(m.clubId === clubId && m.userId === u.id));
    this.save();
  }

  async createTournament(input: NewTournamentInput) {
    this.need(input.clubId, isStaff, 'Only coaches and admins can create tournaments');
    if (input.name.trim().length < 2) throw new ClubError('Give the tournament a name');
    for (const d of input.divisions) { const e = checkDivision(d); if (e) throw new ClubError(e); }
    const players = new Map(this.s.players.filter((p) => p.clubId === input.clubId).map((p) => [p.id, p]));
    const rows = buildTournamentRows(input, players, newId);
    const now = new Date().toISOString();
    this.s.tournaments.push(rows.tournament);
    this.s.divisions.push(...rows.divisions);
    this.s.entries.push(...rows.entries);
    this.s.matches.push(...rows.matches.map((m) => ({ ...m, updatedAt: now })));
    this.save();
    return rows.tournament.id;
  }

  async tournamentBundle(id: string): Promise<TournamentBundle> {
    const t = this.s.tournaments.find((x) => x.id === id);
    if (!t) throw new ClubError('Tournament not found');
    const role = this.role(t.clubId);
    if (!role) throw new ClubError('You are not in this club');
    return {
      club: this.club(t.clubId), role, tournament: t,
      divisions: this.s.divisions.filter((d) => d.tournamentId === id).sort((a, b) => a.sort - b.sort),
      entries: this.s.entries.filter((e) => this.s.divisions.some((d) => d.id === e.divisionId && d.tournamentId === id)),
      matches: this.s.matches.filter((m) => m.tournamentId === id),
      players: this.s.players.filter((p) => p.clubId === t.clubId),
    };
  }

  async updateTournament(id: string, patch: Partial<Pick<ClubTournament, 'status' | 'isPublic'>>) {
    const t = this.s.tournaments.find((x) => x.id === id);
    if (!t) throw new ClubError('Tournament not found');
    this.need(t.clubId, isStaff, 'Only coaches and admins can change the tournament');
    Object.assign(t, patch);
    this.save();
  }

  async addMatches(rows: NewMatchRow[]) {
    for (const r of rows) this.need(r.clubId, isStaff, 'Only coaches and admins can add matches');
    const now = new Date().toISOString();
    this.s.matches.push(...rows.map((r) => ({ ...r, updatedAt: now })));
    this.save();
  }

  async matchBundle(matchId: string): Promise<MatchBundle> {
    const m = this.s.matches.find((x) => x.id === matchId);
    if (!m) throw new ClubError('Match not found');
    const role = this.role(m.clubId);
    if (!role) throw new ClubError('You are not in this club');
    return {
      club: this.club(m.clubId), role, match: m, players: this.s.players.filter((p) => p.clubId === m.clubId),
      tournament: this.s.tournaments.find((t) => t.id === m.tournamentId), divisionName: this.s.divisions.find((d) => d.id === m.divisionId)?.name,
    };
  }

  async saveScore(matchId: string, patch: ScorePatch) {
    const m = this.s.matches.find((x) => x.id === matchId);
    if (!m) throw new ClubError('Match not found');
    this.need(m.clubId, isStaff, 'Only coaches and admins can score matches');
    Object.assign(m, patch, { winner: patch.winner, updatedAt: new Date().toISOString() });
    this.save();
  }

  async setMySharing(playerId: string, share: Share) {
    const u = this.me();
    const p = this.s.players.find((x) => x.id === playerId && x.userId === u.id);
    if (!p) throw new ClubError('You can only change your own sharing');
    p.share = { record: !!share.record, tags: !!share.tags, training: !!share.training };
    if (!share.record && !share.tags && !share.training) this.s.summaries = this.s.summaries.filter((x) => x.playerId !== playerId);
    this.save();
  }

  async shareMySummary(playerId: string, data: SummaryData) {
    const u = this.me();
    const p = this.s.players.find((x) => x.id === playerId && x.userId === u.id);
    if (!p) throw new ClubError('You can only share your own summary');
    this.s.summaries = this.s.summaries.filter((x) => x.playerId !== playerId);
    this.s.summaries.push({ playerId, clubId: p.clubId, data, updatedAt: new Date().toISOString() });
    this.save();
  }

  async publicTournament(slug: string): Promise<PublicTournament | null> {
    const t = this.s.tournaments.find((x) => x.publicSlug === slug && x.isPublic);
    if (!t) return null;
    const names = new Map(this.s.players.map((p) => [p.id, p.name]));
    const divs = this.s.divisions.filter((d) => d.tournamentId === t.id).sort((a, b) => a.sort - b.sort);
    return {
      name: t.name, startDate: t.startDate, startTime: t.startTime, slotMinutes: t.slotMinutes, status: t.status, club: this.club(t.clubId).name,
      divisions: divs.map(({ id, name, kind, pools, advance, format, koFormat }) => ({ id, name, kind, pools, advance, format, koFormat })),
      entries: this.s.entries.filter((e) => divs.some((d) => d.id === e.divisionId)).map((e) => ({ id: e.id, divisionId: e.divisionId, seed: e.seed, pool: e.pool, names: e.playerIds.map((p) => names.get(p) ?? '') })),
      matches: this.s.matches.filter((m) => m.tournamentId === t.id).map((m) => ({
        id: m.id, divisionId: m.divisionId, stage: m.stage, pool: m.pool, round: m.round, bracketPos: m.bracketPos, slot: m.slot, court: m.court,
        entryA: m.entryA, entryB: m.entryB, games: m.games.map((g) => ({ points: '', a: g.a, b: g.b })), status: m.status, winner: m.winner,
      })),
    };
  }

  async myClubMatches(): Promise<MyClubMatches[]> {
    const u = this.s.user;
    if (!u) return [];
    return this.s.players.filter((p) => p.userId === u.id && this.role(p.clubId)).map((p) => ({
      club: this.club(p.clubId), playerId: p.id,
      players: this.s.players.filter((x) => x.clubId === p.clubId),
      tournaments: this.s.tournaments.filter((t) => t.clubId === p.clubId),
      matches: this.s.matches.filter((m) => m.clubId === p.clubId && (m.sideA.includes(p.id) || m.sideB.includes(p.id))),
    }));
  }
}
