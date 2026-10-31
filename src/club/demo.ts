import { newId } from '../db/ids';
import { weekStart, weeklyCounts } from './adminStats';
import { ClubError, type AdminClub, type AdminClubDetail, type AdminOverview, type AdminTournament, type ClubBackend, type EntryPatch, type ListingReview, type MatchPatch, type ClubBundle, type ClubUser, type MatchBundle, type MyClub, type MyClubMatches, type MyEntry, type ImportEntryRow, type ImportResult, type OfflineEntry, type PublicEvent, type PublicTournament, type RegistrationPatch, type ScorePatch, type DeskLabel, type TournamentAccess, type TournamentBundle, type TournamentDetails } from './backend';
import { buildSampleClub, SAMPLE_CLUB_NAME, SAMPLE_TOURNAMENT_NAME } from './domain/sample';
import { buildSampleEvents, SAMPLE_EVENTS_VERSION } from './domain/sampleEvents';
import { pinProblem, randomPin as randomPinOf } from './pins';
import { blobToDataUrl } from './poster';
import { buildTournamentRows, checkDivisionSetup, type NewMatchRow, type NewTournamentInput } from './plan';
import { digits, entryProblem, isActive, personKey, type DrawPlan } from './registration';
import { canHost, isAdmin, isStaff, type Club, type ClubMatch, type ClubPlayer, type ClubTournament, type Division, type Entry, type EntryPerson, type Listing, type ListingStatus, type Member, type Registration, type Role, type ScorerLink, type ScorerView, type Share, type SharedSummary, type SummaryData } from './types';

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
  /** One referee PIN per tournament for every court link. */
  eventPins?: Record<string, string>;
  /** Each tournament's desk link and desk PIN (never the referee PIN). */
  desks?: Record<string, { token: string; pin: string; failed: number; lockedUntil?: number }>;
  /** Module 2 (added later, so older demos don't have them yet). */
  registrations?: Registration[];
  /** Version 1 was a boolean; later sample sets bump SAMPLE_EVENTS_VERSION. */
  eventsSeeded?: boolean | number;
}

const KEY = 'pq-club-demo-v1';
const empty = (): DemoState => ({ v: 1, user: null, clubs: [], members: [], players: [], tournaments: [], divisions: [], entries: [], matches: [], summaries: [], scorerLinks: [] });
const randomToken = () => (newId() + newId()).replace(/-/g, '').slice(0, 40);
const randomPin = () => randomPinOf(4);
const SCORE_SHAPE = /^[AB]*$/;
/** Same shape check as the server: at most 5 games, each 0–99, point order as A/B letters. */
const badGames = (games: ClubMatch['games']) => !Array.isArray(games) || games.length > 5
  || games.some((g) => !Number.isInteger(g.a) || !Number.isInteger(g.b) || g.a < 0 || g.b < 0 || g.a > 99 || g.b > 99 || (g.points ?? '').length > 250 || !SCORE_SHAPE.test(g.points ?? ''));

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
    const oldClubs = new Set(this.s.clubs.filter((c) => c.name === 'PQ Demo Friends Club' || c.name === 'PQ Demo New Club' || c.name === 'PQ Demo Riverside Club' || c.name === 'PQ Demo Courtyard Club').map((c) => c.id));
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
    const mine = this.s.clubs.find((c) => c.id === clubId);
    if (mine && !mine.logoUrl) mine.logoUrl = ev.demoLogo;
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
  /** Same as the server (club_mode_19): the owner's phone and note only for the club's owner and admins. */
  private clubFor(id: string, role: Role | null): Club {
    const c = this.club(id);
    if (isAdmin(role)) return c;
    const { hostingPhone: _p, hostingNote: _n, ...rest } = c;
    return rest;
  }

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
    const club: Club = { id: newId(), name: name.trim(), city: city.trim() || undefined, inviteCode: newId().replace(/-/g, '').slice(0, 10), settings: {}, hosting: 'pending' };
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
      club: this.clubFor(clubId, role), role, myPlayerId,
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
    // Same rule as the server: an unapproved club can't host, unless a platform admin adds it (the demo's user is one).
    if (!canHost(this.club(input.clubId)) && !(await this.isPlatformAdmin())) throw new ClubError('PaddleQ hasn’t approved this club to host tournaments yet. Send the request from the club page; we’ll reply soon.');
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
      club: this.clubFor(t.clubId, role), role, tournament: t,
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
    this.pushMatches(rows);
    this.save();
  }

  /** Same as the server: a knockout match already drawn (same event, stage and bracket position, not cancelled) isn't added twice. */
  private pushMatches(rows: NewMatchRow[]) {
    const now = new Date().toISOString();
    for (const r of rows) {
      const ko = r.stage !== 'pool' && r.stage !== 'friendly' && r.divisionId && r.bracketPos !== undefined && r.status !== 'void';
      if (ko && this.s.matches.some((m) => m.divisionId === r.divisionId && m.stage === r.stage && m.bracketPos === r.bracketPos && m.status !== 'void')) continue;
      if (this.s.matches.some((m) => m.id === r.id)) continue;
      this.s.matches.push({ ...r, updatedAt: now });
    }
  }

  async matchBundle(matchId: string): Promise<MatchBundle> {
    const m = this.s.matches.find((x) => x.id === matchId);
    if (!m) throw new ClubError('Match not found');
    const role = this.role(m.clubId);
    if (!role) throw new ClubError('You are not in this club');
    return {
      club: this.clubFor(m.clubId, role), role, match: m, players: this.s.players.filter((p) => p.clubId === m.clubId),
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
    this.need(t.clubId, isStaff, 'Only coaches and admins can see referee links');
    return (this.s.scorerLinks ?? []).filter((l) => l.tournamentId === tournamentId).map(({ failed: _f, lockedUntil: _l, ...l }) => l)
      .sort((a, b) => (a.court ?? 999) - (b.court ?? 999));
  }

  async createScorerLinks(tournamentId: string, clubId: string, courts: (number | null)[]) {
    this.need(clubId, isStaff, 'Only coaches and admins can make referee links');
    const pin = this.pinOf(tournamentId);
    const made = courts.map((c) => ({ id: newId(), tournamentId, clubId, court: c ?? undefined, token: randomToken(), pin, revoked: false, failed: 0 }));
    this.s.scorerLinks = [...(this.s.scorerLinks ?? []), ...made];
    this.save();
    return made.map(({ failed: _f, ...l }) => l);
  }

  async updateScorerLink(id: string, patch: { revoked?: boolean; pin?: string }) {
    const l = (this.s.scorerLinks ?? []).find((x) => x.id === id);
    if (!l) throw new ClubError('Link not found');
    this.need(l.clubId, isStaff, 'Only coaches and admins can change referee links');
    if (patch.pin !== undefined && !/^\d{4,6}$/.test(patch.pin)) throw new ClubError('A PIN is 4 to 6 digits');
    Object.assign(l, patch, { failed: 0, lockedUntil: undefined });
    // Same as the server: one PIN for every link of the tournament.
    if (patch.pin !== undefined) this.applyPin(l.tournamentId, patch.pin);
    this.save();
  }

  private pinOf(tournamentId: string): string {
    const pins = (this.s.eventPins ??= {});
    if (!pins[tournamentId]) {
      const first = (this.s.scorerLinks ?? []).find((x) => x.tournamentId === tournamentId && !x.revoked);
      pins[tournamentId] = first?.pin ?? randomPin();
    }
    return pins[tournamentId];
  }

  private applyPin(tournamentId: string, pin: string) {
    (this.s.eventPins ??= {})[tournamentId] = pin;
    for (const x of this.s.scorerLinks ?? []) if (x.tournamentId === tournamentId) Object.assign(x, { pin, failed: 0, lockedUntil: undefined });
  }

  async eventPin(tournamentId: string) {
    const t = this.tournament(tournamentId);
    this.need(t.clubId, isStaff, 'Only coaches and admins can see the PIN');
    const p = this.pinOf(tournamentId);
    this.save();
    return p;
  }

  async setEventPin(tournamentId: string, pin?: string) {
    const t = this.tournament(tournamentId);
    this.canRun(t, 'Only the club’s organisers can change the referee PIN');
    const desk = this.deskOf(tournamentId).pin;
    if (pin !== undefined) { const bad = pinProblem(pin, desk, 'referee'); if (bad) throw new ClubError(bad); }
    const p = pin ?? randomPinOf(4, desk);
    this.applyPin(tournamentId, p);
    this.save();
    return p;
  }

  /** Organisers (staff of the club) and PaddleQ admins. In the demo, whoever is signed in is a PaddleQ admin. */
  private canRun(t: ClubTournament, msg: string) {
    if (!isStaff(this.role(t.clubId)) && !this.s.user) throw new ClubError(msg);
  }

  private deskOf(tournamentId: string) {
    const desks = (this.s.desks ??= {});
    if (!desks[tournamentId]) desks[tournamentId] = { token: randomToken(), pin: randomPinOf(6, this.s.eventPins?.[tournamentId]), failed: 0 };
    return desks[tournamentId];
  }

  async tournamentAccess(tournamentId: string): Promise<TournamentAccess> {
    const t = this.tournament(tournamentId);
    this.canRun(t, 'Only the club’s organisers can see the PINs');
    const refereePin = this.pinOf(tournamentId);
    const d = this.deskOf(tournamentId);
    this.save();
    return { refereePin, deskPin: d.pin, deskToken: d.token };
  }

  async setDeskPin(tournamentId: string, pin?: string) {
    const t = this.tournament(tournamentId);
    this.canRun(t, 'Only the club’s organisers can change the desk PIN');
    const ref = this.pinOf(tournamentId);
    if (pin !== undefined) { const bad = pinProblem(pin, ref, 'desk'); if (bad) throw new ClubError(bad); }
    Object.assign(this.deskOf(tournamentId), { pin: pin ?? randomPinOf(6, ref), failed: 0, lockedUntil: undefined });
    this.save();
    return this.deskOf(tournamentId).pin;
  }

  async newDeskLink(tournamentId: string) {
    const t = this.tournament(tournamentId);
    this.canRun(t, 'Only the club’s organisers can change the desk link');
    Object.assign(this.deskOf(tournamentId), { token: randomToken(), failed: 0, lockedUntil: undefined });
    this.save();
    return this.deskOf(tournamentId).token;
  }

  // ---------- The desk: its own link and desk PIN, this one tournament only ----------

  private deskByToken(token: string) {
    const hit = Object.entries(this.s.desks ?? {}).find(([, d]) => d.token === token);
    return hit ? { tid: hit[0], d: hit[1] } : null;
  }

  async deskLabel(token: string): Promise<DeskLabel | null> {
    const hit = this.deskByToken(token);
    const t = hit && this.s.tournaments.find((x) => x.id === hit.tid);
    const c = t && this.s.clubs.find((x) => x.id === t.clubId);
    return t && c ? { club: c.name, logoUrl: c.logoUrl, tournament: t.name } : null;
  }

  /** Same rules as the server: unknown link, finished tournament, lockout on every 5th wrong PIN (2, 4, 8 … up to 30 minutes). */
  private checkDesk(token: string, pin: string): ClubTournament {
    const hit = this.deskByToken(token);
    if (!hit) throw new ClubError('This desk link isn’t valid. Ask the organiser for the desk link again.');
    const t = this.tournament(hit.tid);
    if (t.status === 'done') throw new ClubError('This tournament is finished, so the desk link no longer works.');
    const d = hit.d;
    if (d.lockedUntil && d.lockedUntil > Date.now()) throw new ClubError('Too many wrong PINs. Wait a few minutes, then try again.');
    if (pin !== d.pin) {
      d.failed += 1;
      if (d.failed % 5 === 0) d.lockedUntil = Date.now() + Math.min(30, 2 ** (d.failed / 5)) * 60_000;
      this.save();
      throw new ClubError('Wrong desk PIN');
    }
    if (d.failed || d.lockedUntil) { d.failed = 0; d.lockedUntil = undefined; this.save(); }
    return t;
  }

  async deskOpen(token: string, pin: string): Promise<TournamentBundle> {
    const t = this.checkDesk(token, pin);
    const c = this.club(t.clubId);
    return {
      club: { id: c.id, name: c.name, city: c.city, inviteCode: '', settings: c.settings.thresholds ? { thresholds: c.settings.thresholds } : {}, logoUrl: c.logoUrl },
      role: 'coach', desk: true, tournament: t,
      divisions: this.s.divisions.filter((d) => d.tournamentId === t.id).sort((a, b) => a.sort - b.sort),
      entries: this.s.entries.filter((e) => this.s.divisions.some((d) => d.id === e.divisionId && d.tournamentId === t.id)),
      matches: this.s.matches.filter((m) => m.tournamentId === t.id),
      players: this.s.players.filter((p) => p.clubId === t.clubId)
        .map((p) => ({ id: p.id, clubId: p.clubId, name: p.name, duprSingles: p.duprSingles, duprDoubles: p.duprDoubles, share: {}, sample: p.sample }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  private deskMatch(t: ClubTournament, matchId: string): ClubMatch {
    const m = this.s.matches.find((x) => x.id === matchId);
    if (!m || m.tournamentId !== t.id) throw new ClubError('This match isn’t in your tournament.');
    return m;
  }

  /** One or two of the club's players, all different; null if not. */
  private deskPeople(clubId: string, ids: string[]): string[] | null {
    if (ids.length < 1 || ids.length > 2 || new Set(ids).size !== ids.length) return null;
    return ids.every((id) => this.s.players.some((p) => p.id === id && p.clubId === clubId)) ? ids : null;
  }

  async deskSaveScore(token: string, pin: string, matchId: string, patch: ScorePatch) {
    const t = this.checkDesk(token, pin);
    const m = this.deskMatch(t, matchId);
    if (m.status === 'void') throw new ClubError('This match was cancelled.');
    if (m.status === 'done' && patch.status === 'live') throw new ClubError('This match is already finished.');
    if (patch.status !== 'live' && patch.status !== 'done') throw new ClubError('Unknown match status');
    if (patch.status === 'done' && patch.winner !== 'A' && patch.winner !== 'B') throw new ClubError('A finished match needs a winner');
    if (badGames(patch.games)) throw new ClubError('Scores aren’t in the right shape');
    Object.assign(m, { games: patch.games, status: patch.status, winner: patch.status === 'done' ? patch.winner : undefined, playedOn: patch.playedOn ?? m.playedOn, updatedAt: new Date().toISOString() });
    this.save();
  }

  async deskPatchMatches(token: string, pin: string, changes: { id: string; patch: MatchPatch }[]) {
    const t = this.checkDesk(token, pin);
    // Check everything first: all or nothing, like the server.
    for (const { id, patch } of changes) {
      const m = this.deskMatch(t, id);
      if (patch.status !== undefined && !['scheduled', 'live', 'done', 'void'].includes(patch.status)) throw new ClubError('Unknown match status');
      if (patch.winner !== undefined && patch.winner !== null && patch.winner !== 'A' && patch.winner !== 'B') throw new ClubError('The winner is A or B');
      if (patch.games !== undefined && badGames(patch.games)) throw new ClubError('Scores aren’t in the right shape');
      if (patch.court !== undefined && (!Number.isInteger(patch.court) || patch.court < 1 || patch.court > Math.max(t.courts, 1))) throw new ClubError(`Choose a court from 1 to ${t.courts}`);
      if (patch.slot !== undefined && (!Number.isInteger(patch.slot) || patch.slot < 0 || patch.slot > 2000)) throw new ClubError('That time slot isn’t valid');
      const sa = patch.sideA !== undefined ? this.deskPeople(t.clubId, patch.sideA) : m.sideA;
      const sb = patch.sideB !== undefined ? this.deskPeople(t.clubId, patch.sideB) : m.sideB;
      if (!sa || !sb) throw new ClubError('Choose players from the club');
      if (sa.some((p) => sb.includes(p))) throw new ClubError('A player can’t be on both sides');
    }
    const now = new Date().toISOString();
    for (const { id, patch } of changes) {
      const m = this.deskMatch(t, id);
      const { winner, ...rest } = patch;
      Object.assign(m, rest, { updatedAt: now });
      if (winner !== undefined) m.winner = winner ?? undefined;
    }
    this.save();
  }

  async deskAddEntry(token: string, pin: string, entry: Entry) {
    const t = this.checkDesk(token, pin);
    const d = this.s.divisions.find((x) => x.id === entry.divisionId);
    if (!d || d.tournamentId !== t.id) throw new ClubError('That event isn’t in your tournament.');
    const need = d.kind === 'doubles' ? 2 : 1;
    const ids = this.deskPeople(t.clubId, entry.playerIds);
    if (!ids || ids.length !== need) throw new ClubError(`Choose ${need === 2 ? 'two players' : 'one player'} from the club`);
    if (this.s.entries.some((e) => e.divisionId === d.id && e.status !== 'withdrawn' && e.playerIds.some((p) => ids.includes(p)))) throw new ClubError('That player is already in this event');
    this.s.entries.push({ ...entry, clubId: t.clubId, status: 'active' });
    this.save();
  }

  async deskUpdateEntry(token: string, pin: string, id: string, patch: EntryPatch) {
    const t = this.checkDesk(token, pin);
    const e = this.s.entries.find((x) => x.id === id);
    const d = e && this.s.divisions.find((x) => x.id === e.divisionId);
    if (!e || !d || d.tournamentId !== t.id) throw new ClubError('That entry isn’t in your tournament.');
    if (patch.status !== undefined && patch.status !== 'active' && patch.status !== 'withdrawn') throw new ClubError('Unknown entry status');
    if (patch.playerIds && (!this.deskPeople(t.clubId, patch.playerIds) || patch.playerIds.length !== e.playerIds.length)) throw new ClubError('Choose players from the club');
    if (patch.pool !== undefined && (!Number.isInteger(patch.pool) || patch.pool < 1 || patch.pool > 16)) throw new ClubError('That pool isn’t valid');
    Object.assign(e, patch);
    this.save();
  }

  async deskAddMatches(token: string, pin: string, rows: NewMatchRow[]) {
    const t = this.checkDesk(token, pin);
    for (const r of rows) {
      const d = this.s.divisions.find((x) => x.id === r.divisionId);
      if (!d || d.tournamentId !== t.id) throw new ClubError('That event isn’t in your tournament.');
      if (!['pool', 'r32', 'r16', 'qf', 'sf', 'final'].includes(r.stage)) throw new ClubError('Unknown stage');
      if (!['scheduled', 'done', 'void'].includes(r.status)) throw new ClubError('Unknown match status');
      if (badGames(r.games)) throw new ClubError('Scores aren’t in the right shape');
      for (const e of [r.entryA, r.entryB]) if (e && !this.s.entries.some((x) => x.id === e && x.divisionId === d.id)) throw new ClubError('That entry isn’t in this event.');
      if ((r.sideA.length && !this.deskPeople(t.clubId, r.sideA)) || (r.sideB.length && !this.deskPeople(t.clubId, r.sideB))) throw new ClubError('Choose players from the club');
    }
    this.pushMatches(rows.map((r) => ({ ...r, clubId: t.clubId, tournamentId: t.id })));
    this.save();
  }

  async deskAddPlayer(token: string, pin: string, p: { name: string; dupr?: number }) {
    const t = this.checkDesk(token, pin);
    const name = p.name.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!name) throw new ClubError('Enter their name');
    if (p.dupr !== undefined && (!Number.isFinite(p.dupr) || p.dupr < 1 || p.dupr > 8)) throw new ClubError('DUPR is a number between 1 and 8, or leave it empty');
    const player: ClubPlayer = { id: newId(), clubId: t.clubId, name, duprSingles: p.dupr, duprDoubles: p.dupr, share: {}, sample: false };
    this.s.players.push(player);
    this.save();
    return { id: player.id, clubId: player.clubId, name, duprSingles: p.dupr, duprDoubles: p.dupr, share: {}, sample: false };
  }

  async deskStart(token: string, pin: string) {
    const t = this.checkDesk(token, pin);
    if (t.status === 'draft') { t.status = 'live'; this.save(); }
  }

  async setClubLogo(clubId: string, image: Blob) {
    this.need(clubId, isStaff, 'Only the club’s coaches and admins can change the logo');
    if (image.size > 600_000) throw new ClubError('That picture is too big for the demo');
    const c = this.s.clubs.find((x) => x.id === clubId);
    if (!c) throw new ClubError('Club not found');
    c.logoUrl = await blobToDataUrl(image);
    this.save();
    return c.logoUrl;
  }

  async publicClubLogo(slug: string) {
    const t = this.s.tournaments.find((x) => x.publicSlug === slug);
    const c = t && this.s.clubs.find((x) => x.id === t.clubId);
    return c ? { club: c.name, logoUrl: c.logoUrl } : null;
  }

  /** Same rules as the server: unknown or cancelled link, finished event, lockout after 8 wrong PINs. */
  private checkLink(token: string, pin: string) {
    const l = (this.s.scorerLinks ?? []).find((x) => x.token === token);
    if (!l || l.revoked) throw new ClubError('This referee link isn’t valid. Ask the organiser for a new one.');
    const t = this.s.tournaments.find((x) => x.id === l.tournamentId);
    if (!t || t.status === 'done') throw new ClubError('This event has finished, so the referee link no longer works.');
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
      divisions: divs.map(({ id, name, kind, pools, advance, format, koFormat, shape, extra, stageFormats }) => ({ id, name, kind, pools, advance, format, koFormat, shape, extra, stageFormats })),
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
  // The demo user is also a PaddleQ admin, so the approval queue can be tried.

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

  async importEntries(tournamentId: string, rows: ImportEntryRow[]): Promise<ImportResult> {
    const t = this.tournament(tournamentId);
    this.need(t.clubId, isStaff, 'Only the organiser can import entries');
    if (t.entryMode !== 'registration') throw new ClubError('Importing is for tournaments where players register');
    if (t.drawnAt) throw new ClubError('The draw is made. Add new players as late entries.');
    if (rows.length > 400) throw new ClubError('Import up to 400 rows at a time');
    const out: ImportResult = { added: 0, waitlisted: 0, skipped: 0, problems: [] };
    rows.forEach((x, i) => {
      const d = this.s.divisions.find((y) => y.id === x.divisionId && y.tournamentId === t.id);
      if (!d) { out.problems.push({ row: i + 1, error: 'That event isn’t part of this tournament' }); return; }
      // Same rule as the server: anyone already entered in this event (any status) is skipped.
      const known = new Set(this.regs().filter((r) => r.divisionId === d.id).flatMap((r) => r.players.map(personKey)));
      if (x.players.some((p) => known.has(personKey(p)))) { out.skipped++; return; }
      const problem = entryProblem(d.kind, d.rules, x.players, false);
      if (problem) { out.problems.push({ row: i + 1, error: problem }); return; }
      const taken = this.regs().filter((r) => r.divisionId === d.id && (r.status === 'pending' || r.status === 'accepted')).length;
      const status = d.rules?.cap !== undefined && taken >= d.rules.cap ? 'waitlist' : x.status;
      this.regs().push({ id: newId(), tournamentId: t.id, divisionId: d.id, clubId: d.clubId, source: 'offline', players: x.players.map((p) => ({ ...p, name: p.name.trim(), phone: p.phone.trim() })), status, payment: x.payment, createdAt: new Date().toISOString() });
      out.added++;
      if (status === 'waitlist') out.waitlisted++;
    });
    this.save();
    return out;
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
    if (plan.timing) Object.assign(t, plan.timing);
    for (const d of plan.divisions) {
      const i = this.s.divisions.findIndex((y) => y.id === d.id);
      if (i >= 0) this.s.divisions[i] = { ...d };
    }
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

  async addPlatformAdmin(): Promise<void> { throw new ClubError('In the demo you’re the only PaddleQ admin. Add admins on the real server.'); }
  async platformAdmins() { return this.s.user ? [{ email: this.s.user.email, addedAt: new Date().toISOString() }] : []; }

  // ---------- Admin dashboard: the same answers as the server, from the demo on this phone ----------
  async adminOverview(): Promise<AdminOverview> {
    this.me();
    const today = new Date().toISOString().slice(0, 10);
    const thisWeek = weekStart(today);
    const done = this.s.matches.filter((m) => m.status === 'done');
    const ts = this.s.tournaments;
    return {
      clubs: this.s.clubs.length, verifiedClubs: this.s.clubs.filter((c) => c.verified).length,
      upcoming: ts.filter((t) => t.status !== 'done' && t.startDate > today).length,
      live: ts.filter((t) => t.status === 'live' && t.startDate <= today).length,
      finished: ts.filter((t) => t.status === 'done').length,
      toReview: ts.filter((t) => (t.listing ?? 'none') !== 'none' && t.listingStatus === 'pending').length,
      entriesWeek: (this.s.registrations ?? []).filter((r) => r.createdAt.slice(0, 10) >= thisWeek).length,
      matchesWeek: done.filter((m) => m.updatedAt.slice(0, 10) >= thisWeek).length,
      accounts: 1, accountsWeek: 0,
      weeks: weeklyCounts(done.map((m) => m.updatedAt), today),
    };
  }

  async adminClubs(): Promise<AdminClub[]> {
    const u = this.me();
    return this.s.clubs.map((c) => {
      const ts = this.s.tournaments.filter((t) => t.clubId === c.id);
      const owners = this.s.members.filter((m) => m.clubId === c.id && m.role === 'owner').map((m) => (m.userId === u.id ? u.email : `${m.name} (demo)`));
      return {
        id: c.id, name: c.name, city: c.city, verified: !!c.verified, isTest: false, hosting: c.hosting ?? 'approved', logoUrl: c.logoUrl, hostingPhone: c.hostingPhone, hostingNote: c.hostingNote, hostingReason: c.hostingReason, owners,
        members: this.s.members.filter((m) => m.clubId === c.id).length, tournaments: ts.length,
        lastEvent: ts.map((t) => t.startDate).sort().pop(),
      };
    });
  }

  async adminClub(id: string): Promise<AdminClubDetail> {
    const u = this.me();
    const c = this.club(id);
    const order: Role[] = ['owner', 'admin', 'coach', 'player'];
    return {
      id: c.id, name: c.name, city: c.city, verified: !!c.verified, isTest: false, hosting: c.hosting ?? 'approved', logoUrl: c.logoUrl, hostingPhone: c.hostingPhone, hostingNote: c.hostingNote, hostingReason: c.hostingReason,
      people: this.s.members.filter((m) => m.clubId === id).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
        .map((m) => ({ name: m.name, email: m.userId === u.id ? u.email : undefined, role: m.role, helper: false })),
      tournaments: this.s.tournaments.filter((t) => t.clubId === id).sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, status: t.status })),
    };
  }

  async setClubHosting(id: string, approve: boolean, reason?: string) {
    this.me();
    if (!approve && (reason ?? '').trim().length < 3) throw new ClubError('Give the organiser a reason');
    const c = this.club(id);
    c.hosting = approve ? 'approved' : 'rejected'; c.hostingReason = approve ? undefined : reason!.trim().slice(0, 300);
    this.save();
  }
  async requestHosting(clubId: string, phone: string, note: string) {
    this.need(clubId, isAdmin, 'Only the club’s owner and admins can ask to host tournaments');
    const c = this.club(clubId);
    if (canHost(c)) throw new ClubError('This club can already host tournaments');
    if (phone.replace(/\D/g, '').length < 10) throw new ClubError('Add a phone number PaddleQ can call (10 digits)');
    c.hosting = 'pending'; c.hostingPhone = phone.trim().slice(0, 20); c.hostingNote = note.trim().slice(0, 500) || undefined; c.hostingReason = undefined;
    this.save();
  }
  async setClubVerified(id: string, verified: boolean) { this.me(); this.club(id).verified = verified; this.save(); }

  async adminTournaments(): Promise<AdminTournament[]> {
    this.me();
    return [...this.s.tournaments].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((t) => {
      const ms = this.s.matches.filter((m) => m.tournamentId === t.id && m.status !== 'void');
      return {
        id: t.id, name: t.name, club: this.club(t.clubId).name, clubId: t.clubId, isTest: false, startDate: t.startDate, startTime: t.startTime, status: t.status,
        listing: t.listing ?? 'none', listingStatus: t.listingStatus ?? 'none', slug: t.publicSlug, results: t.isPublic,
        registrations: (this.s.registrations ?? []).filter((r) => r.tournamentId === t.id && ['pending', 'accepted', 'waitlist'].includes(r.status)).length,
        matches: ms.length, matchesDone: ms.filter((m) => m.status === 'done').length, eventPin: this.s.eventPins?.[t.id], deskPin: this.s.desks?.[t.id]?.pin, deskToken: this.s.desks?.[t.id]?.token,
      };
    });
  }

  async adminSetTournamentStatus(id: string, status: 'live' | 'done') {
    this.me();
    if (status !== 'live' && status !== 'done') throw new ClubError('Choose live or finished');
    this.tournament(id).status = status;
    this.save();
  }

  async removePlatformAdmin(email: string) {
    const u = this.me();
    if (email.trim().toLowerCase() !== u.email.toLowerCase()) throw new ClubError('That email isn’t an admin');
    throw new ClubError('You can’t remove the last admin');
  }
}
