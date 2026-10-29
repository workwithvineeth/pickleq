import { newId } from '../db/db';
import { ClubError, type ClubBackend, type EntryPatch, type ListingReview, type MatchPatch, type ClubBundle, type ClubUser, type MatchBundle, type MyClub, type MyClubMatches, type MyEntry, type OfflineEntry, type PublicEvent, type PublicTournament, type RegistrationPatch, type ScorePatch, type TournamentBundle, type TournamentDetails } from './backend';
import { buildSampleClub, SAMPLE_CLUB_NAME, SAMPLE_TOURNAMENT_NAME } from './domain/sample';
import { buildSampleEvents, SAMPLE_EVENTS_VERSION } from './domain/sampleEvents';
import { blobToDataUrl } from './poster';
import { buildTournamentRows, checkDivisionSetup, type NewMatchRow, type NewTournamentInput } from './plan';
import { digits, entryProblem, isActive, type DrawPlan } from './registration';
import { isAdmin, isStaff, type Club, type ClubMatch, type ClubPlayer, type ClubTournament, type Division, type Entry, type EntryPerson, type Listing, type ListingStatus, type Member, type Registration, type Role, type ScorerLink, type ScorerView, type Share, type SharedSummary, type SummaryData } from './types';

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
  scorerLinks?: (ScorerLink & { failed: number; lockedUntil?: number })[];
  /** Module 2 (added later, so older demos don't have them yet). */
  registrations?: Registration[];
  /** Version 1 was a boolean; later sample sets bump SAMPLE_EVENTS_VERSION. */
  eventsSeeded?: boolean | number;
}

const KEY = 'pq-club-demo-v1';
const empty = (): DemoState => ({ v: 1, user: null, clubs: [], members: [], players: [], tournaments: [], divisions: [], entries: [], matches: [], summaries: [], scorerLinks: [] });
const randomToken = () => (newId() + newId()).replace(/-/g, '').slice(0, 40);
const randomPin = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
const SCORE_SHAPE = /^[AB]*$/;

/** Demos made before 29 Oct 2026 used a name a real business has. Rename it in place so nothing else changes. */
function renameLegacyDemo(s: DemoState): DemoState {
  for (const c of s.clubs) if (c.name === 'Pickleball Central') c.name = SAMPLE_CLUB_NAME;
  for (const t of s.tournaments) if (t.name === 'Pickleball Central Open') t.name = SAMPLE_TOURNAMENT_NAME;
  return s;
}

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
    // Demos started before the events board existed get its sample events too.
    const club = this.s.user ? this.s.clubs.find((c) => c.name === SAMPLE_CLUB_NAME) : undefined;
    if (club && this.seededVersion() < SAMPLE_EVENTS_VERSION) { this.seedEvents(club.id); this.save(); }
  }

  private seededVersion(): number { const v = this.s.eventsSeeded; return typeof v === 'number' ? v : v ? 1 : 0; }

  /** Puts in the current sample events, replacing earlier sample ones. Anything made in the demo by hand stays. */
  private seedEvents(clubId: string) {
    const oldClubs = new Set(this.s.clubs.filter((c) => c.name === 'PQ Demo Friends Club' || c.name === 'PQ Demo New Club').map((c) => c.id));
    const oldT = new Set(this.s.tournaments.filter((t) => oldClubs.has(t.clubId) || (/^pq-demo-/.test(t.publicSlug) && t.publicSlug !== 'pq-demo-open')).map((t) => t.id));
    const oldD = new Set(this.s.divisions.filter((d) => oldT.has(d.tournamentId)).map((d) => d.id));
    this.s.clubs = this.s.clubs.filter((c) => !oldClubs.has(c.id));
    this.s.tournaments = this.s.tournaments.filter((t) => !oldT.has(t.id));
    this.s.divisions = this.s.divisions.filter((d) => !oldD.has(d.id));
    this.s.entries = this.s.entries.filter((e) => !oldD.has(e.divisionId));
    this.s.matches = this.s.matches.filter((m) => !m.tournamentId || !oldT.has(m.tournamentId));
    this.s.registrations = (this.s.registrations ?? []).filter((r) => !oldT.has(r.tournamentId));
    const ev = buildSampleEvents(clubId, newId, this.s.players.filter((p) => p.clubId === clubId && p.sample));
    this.s.clubs.push(...ev.clubs);
    this.s.tournaments.push(...ev.tournaments);
    this.s.divisions.push(...ev.divisions);
    this.s.entries.push(...ev.entries);
    this.s.matches.push(...ev.matches);
    this.s.registrations.push(...ev.registrations);
    const open = this.s.tournaments.find((t) => t.clubId === clubId && t.name === SAMPLE_TOURNAMENT_NAME);
    if (open && !open.posterUrl) open.posterUrl = ev.openPoster;
    this.s.eventsSeeded = SAMPLE_EVENTS_VERSION;
  }

  private load(): DemoState {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) { const v = JSON.parse(raw) as DemoState; if (v.v === 1) return renameLegacyDemo({ ...v, scorerLinks: v.scorerLinks ?? [] }); }
    } catch { /* start fresh */ }
    return empty();
  }
  private save() { try { this.storage?.setItem(KEY, JSON.stringify(this.s)); } catch { /* storage full or blocked: keep in memory */ } }

  /** Signs in as you and creates PQ Demo Club with its sample tournament (only the first time). */
  async start(name: string): Promise<string> {
    if (!this.s.user) this.s.user = { id: 'demo-you', email: 'demo (on this phone)' };
    let club = this.s.clubs.find((c) => c.name === SAMPLE_CLUB_NAME);
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
    if (this.seededVersion() < SAMPLE_EVENTS_VERSION) this.seedEvents(club.id);
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
    if (!this.role(club.id)) throw new ClubError('In the demo you are already in PQ Demo Club');
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

  async updatePlayer(id: string, patch: { name?: string; duprSingles?: number | null; duprDoubles?: number | null; duprId?: string | null }) {
    const p = this.s.players.find((x) => x.id === id);
    if (!p) throw new ClubError('Player not found');
    this.need(p.clubId, isStaff, 'Only coaches and admins can edit players');
    if (patch.name !== undefined) p.name = patch.name.trim() || p.name;
    if (patch.duprSingles !== undefined) p.duprSingles = patch.duprSingles ?? undefined;
    if (patch.duprDoubles !== undefined) p.duprDoubles = patch.duprDoubles ?? undefined;
    if (patch.duprId !== undefined) {
      const v = patch.duprId?.trim() || undefined;
      if (v && !/^[A-Za-z0-9-]{3,20}$/.test(v)) throw new ClubError('A DUPR ID is letters and numbers only');
      p.duprId = v;
    }
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
    for (const d of input.divisions) { const e = checkDivisionSetup(d, input.listingOnly ? 'registration' : input.entryMode ?? 'roster'); if (e) throw new ClubError(e); }
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

  async patchMatches(changes: { id: string; patch: MatchPatch }[]) {
    for (const { id } of changes) {
      const m = this.s.matches.find((x) => x.id === id);
      if (!m) throw new ClubError('Match not found');
      this.need(m.clubId, isStaff, 'Only coaches and admins can change matches');
    }
    const now = new Date().toISOString();
    for (const { id, patch } of changes) {
      const m = this.s.matches.find((x) => x.id === id) as ClubMatch;
      const { winner, ...rest } = patch;
      Object.assign(m, rest, { updatedAt: now });
      if (winner !== undefined) m.winner = winner ?? undefined;
    }
    this.save();
  }

  async addEntry(entry: Entry) {
    this.need(entry.clubId, isStaff, 'Only coaches and admins can add entries');
    this.s.entries.push({ ...entry });
    this.save();
  }

  async updateEntry(id: string, patch: EntryPatch) {
    const e = this.s.entries.find((x) => x.id === id);
    if (!e) throw new ClubError('Entry not found');
    this.need(e.clubId, isStaff, 'Only coaches and admins can change entries');
    Object.assign(e, patch);
    this.save();
  }

  async scorerLinks(tournamentId: string): Promise<ScorerLink[]> {
    const t = this.s.tournaments.find((x) => x.id === tournamentId);
    if (!t) throw new ClubError('Tournament not found');
    this.need(t.clubId, isStaff, 'Only coaches and admins can see scorer links');
    return (this.s.scorerLinks ?? []).filter((l) => l.tournamentId === tournamentId).map(({ failed: _f, lockedUntil: _l, ...l }) => l)
      .sort((a, b) => (a.court ?? 999) - (b.court ?? 999));
  }

  async createScorerLinks(tournamentId: string, clubId: string, courts: (number | null)[]) {
    this.need(clubId, isStaff, 'Only coaches and admins can make scorer links');
    const made = courts.map((c) => ({ id: newId(), tournamentId, clubId, court: c ?? undefined, token: randomToken(), pin: randomPin(), revoked: false, failed: 0 }));
    this.s.scorerLinks = [...(this.s.scorerLinks ?? []), ...made];
    this.save();
    return made.map(({ failed: _f, ...l }) => l);
  }

  async updateScorerLink(id: string, patch: { revoked?: boolean; pin?: string }) {
    const l = (this.s.scorerLinks ?? []).find((x) => x.id === id);
    if (!l) throw new ClubError('Link not found');
    this.need(l.clubId, isStaff, 'Only coaches and admins can change scorer links');
    if (patch.pin !== undefined && !/^\d{4,6}$/.test(patch.pin)) throw new ClubError('A PIN is 4 to 6 digits');
    Object.assign(l, patch, { failed: 0, lockedUntil: undefined });
    this.save();
  }

  /** Same rules as the server: unknown or cancelled link, finished event, lockout after 8 wrong PINs. */
  private checkLink(token: string, pin: string) {
    const l = (this.s.scorerLinks ?? []).find((x) => x.token === token);
    if (!l || l.revoked) throw new ClubError('This scorer link isn’t valid. Ask the organiser for a new one.');
    const t = this.s.tournaments.find((x) => x.id === l.tournamentId);
    if (!t || t.status === 'done') throw new ClubError('This event has finished, so the scorer link no longer works.');
    if (l.lockedUntil && l.lockedUntil > Date.now()) throw new ClubError('Too many wrong PINs. Try again in 15 minutes, or ask the organiser.');
    if (pin !== l.pin) {
      l.failed += 1;
      if (l.failed >= 8) l.lockedUntil = Date.now() + 15 * 60 * 1000;
      this.save();
      throw new ClubError('Wrong PIN');
    }
    l.failed = 0; l.lockedUntil = undefined; l.lastUsedAt = new Date().toISOString();
    this.save();
    return { l, t };
  }

  async scorerOpen(token: string, pin: string): Promise<ScorerView> {
    const { l, t } = this.checkLink(token, pin);
    const name = new Map(this.s.players.map((p) => [p.id, p.name]));
    const divs = new Map(this.s.divisions.map((d) => [d.id, d.name]));
    return {
      court: l.court, label: l.label, club: this.club(t.clubId).name,
      tournament: { name: t.name, startDate: t.startDate, startTime: t.startTime, slotMinutes: t.slotMinutes, courts: t.courts, status: t.status },
      matches: this.s.matches.filter((m) => m.tournamentId === t.id && m.status !== 'void' && (l.court === undefined || m.court === l.court))
        .sort((a, b) => (a.slot ?? 1e9) - (b.slot ?? 1e9) || (a.court ?? 0) - (b.court ?? 0))
        .map((m) => ({
          id: m.id, stage: m.stage, pool: m.pool, round: m.round, slot: m.slot, court: m.court, division: m.divisionId ? divs.get(m.divisionId) : undefined,
          format: m.format, games: m.games, status: m.status, winner: m.winner, playedOn: m.playedOn,
          namesA: m.sideA.map((p) => name.get(p) ?? ''), namesB: m.sideB.map((p) => name.get(p) ?? ''),
        })),
    };
  }

  async scorerSave(token: string, pin: string, matchId: string, patch: ScorePatch) {
    const { l, t } = this.checkLink(token, pin);
    const m = this.s.matches.find((x) => x.id === matchId);
    if (!m || m.tournamentId !== t.id || (l.court !== undefined && m.court !== l.court)) throw new ClubError('This match isn’t on your court. Ask the organiser.');
    if (m.status === 'void') throw new ClubError('The organiser cancelled this match.');
    if (m.status === 'done' && patch.status === 'live') throw new ClubError('This match is already finished.');
    if (patch.status !== 'live' && patch.status !== 'done') throw new ClubError('Unknown match status');
    if (patch.status === 'done' && patch.winner !== 'A' && patch.winner !== 'B') throw new ClubError('A finished match needs a winner');
    if (patch.games.length > 5 || patch.games.some((g) => !Number.isInteger(g.a) || !Number.isInteger(g.b) || g.a < 0 || g.b < 0 || g.a > 99 || g.b > 99 || !SCORE_SHAPE.test(g.points ?? ''))) {
      throw new ClubError('Scores aren’t in the right shape');
    }
    Object.assign(m, { games: patch.games, status: patch.status, winner: patch.status === 'done' ? patch.winner : undefined, playedOn: patch.playedOn ?? m.playedOn, updatedAt: new Date().toISOString() });
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

  // ---------- Module 2: events board, registration, entries inbox, approval ----------
  // The demo user is also a PICKLEQ admin, so the approval queue can be tried.

  private regs(): Registration[] { return (this.s.registrations ??= []); }
  private tournament(id: string): ClubTournament { const t = this.s.tournaments.find((x) => x.id === id); if (!t) throw new ClubError('Tournament not found'); return t; }
  private today(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  async updateTournamentDetails(id: string, patch: TournamentDetails) {
    const t = this.tournament(id);
    this.need(t.clubId, isStaff, 'Only coaches and admins can change the tournament');
    if (patch.name !== undefined && patch.name.trim().length < 2) throw new ClubError('Give the tournament a name');
    if (patch.link?.trim() && !/^https:\/\/[^\s<>"]+$/.test(patch.link.trim())) throw new ClubError('A link starts with https://');
    if (patch.upiId?.trim() && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(patch.upiId.trim())) throw new ClubError('A UPI ID looks like name@bank');
    for (const [k, v] of Object.entries(patch)) (t as unknown as Record<string, unknown>)[k] = typeof v === 'string' ? (v.trim() || undefined) : v;
    this.save();
  }

  async submitListing(id: string, listing: Listing): Promise<ListingStatus> {
    const t = this.tournament(id);
    this.need(t.clubId, isAdmin, 'Only club admins can post to the events board');
    if (listing !== 'none' && (!t.city || !t.venue)) throw new ClubError('Add the city and venue first');
    if (listing === 'listed' && !t.contact && !t.link) throw new ClubError('Add a contact number or a link so players can enter');
    const verified = !!this.club(t.clubId).verified;
    t.listing = listing;
    t.listingStatus = listing === 'none' ? 'none' : verified ? 'approved' : 'pending';
    t.rejectReason = undefined;
    this.save();
    return t.listingStatus;
  }

  private eventOf(t: ClubTournament, detail: boolean): PublicEvent {
    const open = !!t.registrationOpen && !t.drawnAt && t.listing !== 'listed' && (!t.entriesClose || this.today() <= t.entriesClose);
    return {
      slug: t.publicSlug, name: t.name, startDate: t.startDate, startTime: t.startTime, city: t.city, venue: t.venue, club: this.club(t.clubId).name,
      listing: t.listing ?? 'none', status: t.status, entryMode: t.entryMode ?? 'roster', registrationOpen: open && (t.entryMode === 'registration'), entriesClose: t.entriesClose,
      results: t.isPublic, drawn: !!t.drawnAt, contact: t.listing === 'listed' ? t.contact : undefined, link: t.listing === 'listed' ? t.link : undefined,
      about: detail ? t.about : undefined, upiId: detail ? t.upiId : undefined, posterUrl: t.posterUrl,
      divisions: this.s.divisions.filter((d) => d.tournamentId === t.id).sort((a, b) => a.sort - b.sort).map((d) => ({
        id: d.id, name: d.name, kind: d.kind, rules: d.rules ?? {}, taken: this.regs().filter((r) => r.divisionId === d.id && (r.status === 'pending' || r.status === 'accepted')).length,
      })),
    };
  }

  async publicEvents(): Promise<PublicEvent[]> {
    const from = new Date(); from.setDate(from.getDate() - 1);
    const min = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    return this.s.tournaments.filter((t) => (t.listing ?? 'none') !== 'none' && t.listingStatus === 'approved' && t.startDate >= min && t.status !== 'done')
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name))
      .map((t) => this.eventOf(t, false));
  }

  async recentResults(): Promise<PublicEvent[]> {
    const from = new Date(); from.setDate(from.getDate() - 30);
    const min = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    return this.s.tournaments.filter((t) => (t.listing ?? 'none') !== 'none' && t.listingStatus === 'approved' && t.status === 'done' && t.isPublic && t.startDate >= min)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)).map((t) => this.eventOf(t, false));
  }

  async setPoster(t: ClubTournament, image: Blob): Promise<string> {
    const x = this.tournament(t.id);
    this.need(x.clubId, isStaff, 'Only the club’s coaches and admins can change the poster');
    if (image.size > 1_200_000) throw new ClubError('That picture is too big for the demo');
    x.posterUrl = await blobToDataUrl(image);
    this.save();
    return x.posterUrl;
  }

  async publicEvent(slug: string): Promise<PublicEvent | null> {
    const t = this.s.tournaments.find((x) => x.publicSlug === slug && x.listingStatus !== 'rejected'
      && (((x.listing ?? 'none') !== 'none' && x.listingStatus === 'approved') || x.entryMode === 'registration'));
    return t ? this.eventOf(t, true) : null;
  }

  private entryTaken(divisionId: string, players: EntryPerson[], except?: string): boolean {
    const phones = new Set(this.regs().filter((r) => r.divisionId === divisionId && isActive(r) && r.id !== except).flatMap((r) => r.players.map((p) => digits(p.phone)).filter(Boolean)));
    return players.some((p) => p.phone.trim() && phones.has(digits(p.phone)));
  }

  async registerEntry(divisionId: string, players: EntryPerson[], payment: 'unpaid' | 'venue' | 'claimed', paymentRef?: string) {
    const u = this.me();
    const d = this.s.divisions.find((x) => x.id === divisionId);
    if (!d) throw new ClubError('That event doesn’t exist');
    const t = this.tournament(d.tournamentId);
    if (!this.eventOf(t, false).registrationOpen) throw new ClubError('Entries for this tournament are closed');
    const problem = entryProblem(d.kind, d.rules, players, true);
    if (problem) throw new ClubError(problem);
    if (this.regs().some((r) => r.divisionId === d.id && r.userId === u.id && isActive(r))) throw new ClubError('You already have an entry in this event. You can withdraw it and enter again.');
    if (this.entryTaken(d.id, players)) throw new ClubError('Someone with that phone number is already entered in this event');
    if (payment === 'claimed' && ((paymentRef ?? '').trim().length < 4)) throw new ClubError('Add the UPI reference number from your payment');
    const taken = this.regs().filter((r) => r.divisionId === d.id && (r.status === 'pending' || r.status === 'accepted')).length;
    const status = d.rules?.cap !== undefined && taken >= d.rules.cap ? 'waitlist' : 'pending';
    const r: Registration = { id: newId(), tournamentId: t.id, divisionId: d.id, clubId: d.clubId, userId: u.id, source: 'online', players: players.map((p) => ({ ...p, name: p.name.trim(), phone: p.phone.trim(), duprId: p.duprId?.trim().toUpperCase() || undefined })), status, payment, paymentRef: paymentRef?.trim() || undefined, createdAt: new Date().toISOString() };
    this.regs().push(r);
    this.save();
    return { id: r.id, status: r.status };
  }

  async myEntries(): Promise<MyEntry[]> {
    const u = this.s.user;
    if (!u) return [];
    return this.regs().filter((r) => r.userId === u.id).map((r) => {
      const d = this.s.divisions.find((x) => x.id === r.divisionId) as Division;
      const t = this.tournament(r.tournamentId);
      return {
        id: r.id, status: r.status, payment: r.payment, paymentRef: r.paymentRef, note: r.note, players: r.players, division: d.name, kind: d.kind, fee: d.rules?.fee,
        slug: t.publicSlug, tournament: t.name, startDate: t.startDate, startTime: t.startTime, city: t.city, venue: t.venue, club: this.club(t.clubId).name,
        upiId: t.upiId, drawn: !!t.drawnAt, results: t.isPublic,
      };
    }).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  async withdrawMyEntry(id: string) {
    const u = this.me();
    const r = this.regs().find((x) => x.id === id && x.userId === u.id);
    if (!r) throw new ClubError('Entry not found');
    if (r.entryId) throw new ClubError('The draw is made. Ask the organiser to withdraw you.');
    if (isActive(r)) r.status = 'withdrawn';
    this.save();
  }

  async registrations(tournamentId: string): Promise<Registration[]> {
    const t = this.tournament(tournamentId);
    this.need(t.clubId, isStaff, 'Only coaches and admins can see entries');
    return this.regs().filter((r) => r.tournamentId === tournamentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => ({ ...r, players: r.players.map((p) => ({ ...p })) }));
  }

  async updateRegistration(id: string, patch: RegistrationPatch) {
    const r = this.regs().find((x) => x.id === id);
    if (!r) throw new ClubError('Entry not found');
    this.need(r.clubId, isStaff, 'Only coaches and admins can change entries');
    if (patch.players || patch.divisionId) {
      const d = this.s.divisions.find((x) => x.id === (patch.divisionId ?? r.divisionId));
      if (!d || d.tournamentId !== r.tournamentId) throw new ClubError('That event isn’t part of this tournament');
      const problem = entryProblem(d.kind, d.rules, patch.players ?? r.players, r.source === 'online');
      if (problem) throw new ClubError(problem);
    }
    if (patch.status) r.status = patch.status;
    if (patch.payment) r.payment = patch.payment;
    if (patch.note !== undefined) r.note = patch.note?.trim() || undefined;
    if (patch.players) r.players = patch.players;
    if (patch.divisionId) r.divisionId = patch.divisionId;
    this.save();
  }

  async addOfflineEntry(e: OfflineEntry) {
    this.need(e.clubId, isStaff, 'Only coaches and admins can add entries');
    const d = this.s.divisions.find((x) => x.id === e.divisionId);
    if (!d) throw new ClubError('That event doesn’t exist');
    const problem = entryProblem(d.kind, d.rules, e.players, false);
    if (problem) throw new ClubError(problem);
    this.regs().push({ id: newId(), tournamentId: e.tournamentId, divisionId: e.divisionId, clubId: e.clubId, source: 'offline', players: e.players, status: e.status, payment: e.payment, createdAt: new Date().toISOString() });
    this.save();
  }

  async checkEntry(divisionId: string, players: EntryPerson[], exceptId?: string): Promise<string | null> {
    const d = this.s.divisions.find((x) => x.id === divisionId);
    if (!d) return 'That event doesn’t exist';
    if (!isStaff(this.role(d.clubId))) return 'Only the organiser can do this';
    return entryProblem(d.kind, d.rules, players, false) ?? (this.entryTaken(d.id, players, exceptId) ? 'Someone with that phone number is already entered in this event' : null);
  }

  async applyDraw(tournamentId: string, plan: DrawPlan) {
    const t = this.tournament(tournamentId);
    this.need(t.clubId, isStaff, 'Only coaches and admins can make the draw');
    if (t.drawnAt) throw new ClubError('The draw is already made');
    const now = new Date().toISOString();
    this.s.players.push(...plan.players);
    for (const d of plan.divisions) { const x = this.s.divisions.find((y) => y.id === d.id); if (x) { x.pools = d.pools; x.advance = d.advance; } }
    this.s.entries.push(...plan.entries);
    this.s.matches.push(...plan.matches.map((m) => ({ ...m, updatedAt: now })));
    for (const l of plan.links) { const r = this.regs().find((x) => x.id === l.registrationId); if (r) r.entryId = l.entryId; }
    t.drawnAt = now;
    t.registrationOpen = false;
    this.save();
  }

  async isPlatformAdmin() { return !!this.s.user; }

  async listingQueue(): Promise<ListingReview[]> {
    this.me();
    const month = Date.now() - 30 * 86400_000;
    return this.s.tournaments.filter((t) => (t.listing ?? 'none') !== 'none' && (t.listingStatus === 'pending' || (t.reviewedAt && Date.parse(t.reviewedAt) > month)))
      .sort((a, b) => Number(b.listingStatus === 'pending') - Number(a.listingStatus === 'pending') || a.startDate.localeCompare(b.startDate))
      .map((t) => {
        const c = this.club(t.clubId);
        return {
          id: t.id, name: t.name, startDate: t.startDate, startTime: t.startTime, city: t.city, venue: t.venue, about: t.about, contact: t.contact, link: t.link,
          listing: t.listing ?? 'none', listingStatus: t.listingStatus ?? 'none', rejectReason: t.rejectReason, reviewedAt: t.reviewedAt, slug: t.publicSlug, club: c.name,
          verified: !!c.verified, postedBy: 'organiser (demo)', posterUrl: t.posterUrl,
          divisions: this.s.divisions.filter((d) => d.tournamentId === t.id).map((d) => ({ name: d.name, kind: d.kind, rules: d.rules ?? {} })),
        };
      });
  }

  async reviewListing(id: string, approve: boolean, reason?: string) {
    this.me();
    const t = this.tournament(id);
    if (!approve && (reason ?? '').trim().length < 3) throw new ClubError('Give the organiser a reason');
    t.listingStatus = approve ? 'approved' : 'rejected';
    t.rejectReason = approve ? undefined : reason?.trim();
    t.reviewedAt = new Date().toISOString();
    if (approve) this.club(t.clubId).verified = true;
    this.save();
  }

  async addPlatformAdmin(): Promise<void> { throw new ClubError('In the demo you’re the only PICKLEQ admin. Add admins on the real server.'); }
  async platformAdmins() { return this.s.user ? [{ email: this.s.user.email, addedAt: new Date().toISOString() }] : []; }
}
