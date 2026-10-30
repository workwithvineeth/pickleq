import type { Format } from '../domain/types';
import { bracketSize, crossPoolOrder, emptySlotState, entryRating, firstKnockoutPairs, formatFor, KNOCKOUT_SIZES, knockoutOnlyPairs, MAX_BRACKET, nextRoundPairs, nextStage, planPoolMatches, scheduleSlots, seedOrder, snakePools, stageForSize, standings, type Qualifier, type StandingRow } from './domain/engine';
import type { ClubMatch, ClubPlayer, ClubTournament, Division, DivisionKind, DivisionRules, Entry, EntryMode, KnockoutStage } from './types';

export interface NewDivisionInput {
  name: string;
  kind: DivisionKind;
  format: Format;
  koFormat: Format;
  pools: number;
  advance: number;
  /** Each entry is one player (singles) or two (doubles team). Empty when players will register. */
  entries: string[][];
  rules?: DivisionRules;
  shape?: 'ko';
  extra?: number;
  stageFormats?: Partial<Record<KnockoutStage, Format>>;
}

export interface NewTournamentInput {
  clubId: string;
  name: string;
  startDate: string;
  startTime: string;
  courts: number;
  slotMinutes: number;
  divisions: NewDivisionInput[];
  /** roster (default): entries are picked now. registration: players sign up later, then the organiser draws. */
  entryMode?: EntryMode;
  /** A listing only: the events are just categories on the board, with no entries. */
  listingOnly?: boolean;
  details?: Pick<ClubTournament, 'city' | 'venue' | 'about' | 'contact' | 'link' | 'entriesClose' | 'upiId'>;
}

/** Checks an event's entry rules (cap, age, gender). Returns a message, or null. */
export function checkRules(kind: DivisionKind, r: DivisionRules | undefined): string | null {
  if (!r) return null;
  if (r.maxDupr !== undefined && (!Number.isFinite(r.maxDupr) || r.maxDupr < 1 || r.maxDupr > 8)) return 'A DUPR cap is a rating between 1 and 8';
  if (r.minAge !== undefined && (!Number.isInteger(r.minAge) || r.minAge < 18 || r.minAge > 99)) return 'An age group starts at 18 or more';
  if (r.cap !== undefined && (!Number.isInteger(r.cap) || r.cap < 2 || r.cap > 256)) return 'The most entries is a number from 2 to 256';
  if (r.fee !== undefined && (!Number.isInteger(r.fee) || r.fee < 0 || r.fee > 100000)) return 'The entry fee is in whole rupees, up to 1,00,000';
  if (r.gender === 'mixed' && kind !== 'doubles') return 'Mixed is for doubles only';
  return null;
}

/** Checks an event before it's created: its rules, and its entries unless players will register. */
export function checkDivisionSetup(d: NewDivisionInput, mode: EntryMode): string | null {
  if (!d.name.trim()) return 'Give each event a name';
  const r = checkRules(d.kind, d.rules);
  if (r) return r;
  return mode === 'registration' ? null : checkDivision(d);
}

export type NewMatchRow = Omit<ClubMatch, 'updatedAt'>;

export interface TournamentRows { tournament: ClubTournament; divisions: Division[]; entries: Entry[]; matches: NewMatchRow[] }

/** Checks a division before it's created. Returns a message for the person, or null if it's fine. */
export function checkDivision(d: NewDivisionInput): string | null {
  if (!d.name.trim()) return 'Give each event a name';
  const need = d.kind === 'doubles' ? 2 : 1;
  if (d.entries.some((e) => e.length !== need)) return d.kind === 'doubles' ? 'Every doubles team needs two players' : 'Each singles entry is one player';
  const ids = d.entries.flat();
  if (new Set(ids).size !== ids.length) return 'A player is entered twice in the same event';
  if (d.entries.length < 2) return 'An event needs at least 2 entries';
  return checkShape(d, d.entries.length);
}

/** Checks pools, places going through and best runners-up (or a knockout-only event) for n entries. */
export function checkShape(d0: { pools: number; advance: number; shape?: string; extra?: number }, n: number): string | null {
  const d = d0.shape === 'rr' ? { pools: 1, advance: 0, extra: 0 } : d0;
  if (d0.shape === 'ko') return n < 2 || n > MAX_BRACKET ? `A knockout-only event needs 2 to ${MAX_BRACKET} entries` : null;
  if (d.pools < 1 || n < d.pools * 2) return 'Each pool needs at least 2 entries';
  const extra = d.extra ?? 0;
  if (extra < 0 || !Number.isInteger(extra)) return 'Best runners-up is a whole number';
  if (extra > 0 && d.advance === 0) return 'Best runners-up need knockouts';
  if (extra >= d.pools && extra > 0) return 'Best runners-up must be fewer than the number of pools';
  const q = d.pools * d.advance + extra;
  if (d.advance > 0 && !KNOCKOUT_SIZES.includes(q)) return extra ? `Going through makes ${q}: knockouts need 2, 4, 8 or 16` : 'Pools × players going through must make 2, 4, 8 or 16 for the knockouts';
  const smallest = Math.min(...poolSizes(n, d.pools));
  if (d.advance > 0 && smallest < d.advance) return 'More players go through than some pools have';
  if (extra > 0 && smallest <= d.advance) return 'Every pool needs a runner-up for best runners-up';
  return null;
}

function poolSizes(n: number, pools: number): number[] {
  return Array.from({ length: pools }, (_, i) => Math.floor(n / pools) + (i < n % pools ? 1 : 0));
}

/** Seeds entries by DUPR, snake-seeds them into pools, builds every pool match and gives each one a court and time. */
export function buildTournamentRows(input: NewTournamentInput, players: Map<string, ClubPlayer>, newId: () => string): TournamentRows {
  const tournament: ClubTournament = {
    id: newId(), clubId: input.clubId, name: input.name.trim(), startDate: input.startDate, startTime: input.startTime,
    courts: input.courts, slotMinutes: input.slotMinutes, status: 'draft', isPublic: false, publicSlug: newId().replace(/-/g, '').slice(0, 10),
  };
  if (input.entryMode === 'registration') Object.assign(tournament, { entryMode: 'registration', registrationOpen: true }, input.details ?? {});
  else if (input.details) Object.assign(tournament, input.details);
  const divisions = input.divisions.map((d, sort): Division => ({ id: newId(), tournamentId: tournament.id, clubId: input.clubId, name: d.name.trim(), kind: d.kind, format: d.format, koFormat: d.koFormat, pools: d.shape === 'ko' ? 1 : d.pools, advance: d.shape === 'ko' ? 0 : d.advance, sort, rules: d.rules, ...shapeFields(d) }));
  const drawn = drawRows(tournament, divisions.map((division, i) => ({ division, entries: input.divisions[i].entries })), players, newId);
  return { tournament, divisions, entries: drawn.entries, matches: drawn.matches };
}

/**
 * The draw for divisions that already exist: seeds each division's entries by DUPR, snake-seeds them into pools,
 * builds every pool match, and books courts and times across all divisions so nobody is on two courts at once.
 */
export function drawRows(t: ClubTournament, divs: { division: Division; entries: string[][] }[], players: Map<string, ClubPlayer>, newId: () => string): { entries: Entry[]; matches: NewMatchRow[] } {
  const entries: Entry[] = [];
  const matches: NewMatchRow[] = [];
  for (const { division: div, entries: groups } of divs) {
    const ordered = seedOrder(groups, (e) => entryRating(e, players, div.kind));
    if (div.shape === 'ko') {
      const divEntries = ordered.map((ids, i): Entry => ({ id: newId(), divisionId: div.id, clubId: div.clubId, playerIds: ids, seed: i + 1 }));
      entries.push(...divEntries);
      const stage = stageForSize(bracketSize(divEntries.length));
      knockoutOnlyPairs(divEntries).forEach(([a, b], pos) => matches.push({
        id: newId(), clubId: div.clubId, tournamentId: t.id, divisionId: div.id, stage, round: 1, bracketPos: pos,
        entryA: a.id, entryB: b?.id, sideA: a.playerIds, sideB: b?.playerIds ?? [], format: formatFor(div, stage), games: [],
        // A bye: no opponent, so the entry goes straight through.
        status: b ? 'scheduled' : 'done', winner: b ? undefined : 'A', playedOn: t.startDate,
      }));
      continue;
    }
    const pools = snakePools(ordered.length, div.pools);
    const divEntries = ordered.map((ids, i): Entry => ({ id: newId(), divisionId: div.id, clubId: div.clubId, playerIds: ids, seed: i + 1, pool: pools[i] }));
    entries.push(...divEntries);
    const emap = new Map(divEntries.map((e) => [e.id, e]));
    for (const p of planPoolMatches(divEntries)) {
      matches.push({
        id: newId(), clubId: div.clubId, tournamentId: t.id, divisionId: div.id, stage: 'pool', pool: p.pool, round: p.round,
        entryA: p.entryA, entryB: p.entryB, sideA: (emap.get(p.entryA) as Entry).playerIds, sideB: (emap.get(p.entryB) as Entry).playerIds,
        format: div.format, games: [], status: 'scheduled', playedOn: t.startDate,
      });
    }
  }
  // Round-two matches between two byes can be made straight away (with their courts and times).
  const rows = matches as ClubMatch[];
  for (let guard = 0; guard < 6; guard++) {
    const more = laterRounds(t, divs.map((x) => x.division).filter((x) => x.shape === 'ko'), entries, rows, newId);
    if (!more.length) break;
    matches.push(...more);
  }
  // Byes aren't played, so they get no court or time.
  const toPlay = matches.filter((m) => m.status === 'scheduled');
  const plan = scheduleSlots(toPlay.map((m) => ({ key: m.id, playerIds: [...m.sideA, ...m.sideB] })), t.courts);
  for (const m of toPlay) { const sl = plan.get(m.id); if (sl) { m.slot = sl.slot; m.court = sl.court; } }
  return { entries, matches };
}

/**
 * Knockout matches that can be created now: the first round once every pool match is finished,
 * then each later round once both feeder matches are finished. Courts and times follow on after the last slot used.
 */
export function knockoutMatchesToAdd(t: ClubTournament, divisions: Division[], entries: Entry[], matches: ClubMatch[], newId: () => string): NewMatchRow[] {
  const out: NewMatchRow[] = [];
  const emap = new Map(entries.map((e) => [e.id, e]));
  const lastSlot = Math.max(-1, ...matches.filter((m) => m.status !== 'void').map((m) => m.slot ?? -1));
  for (const div of divisions) {
    if (div.advance === 0 || div.shape === 'ko') continue;
    const dm = matches.filter((m) => m.divisionId === div.id);
    if (dm.some((m) => m.stage !== 'pool' && m.status !== 'void')) continue;
    if (!poolsComplete(div.id, matches)) continue;
    const q = poolQualifiers(div, entries, dm.filter((m) => m.stage === 'pool'));
    if (!KNOCKOUT_SIZES.includes(q.qualifiers.length)) continue;
    const stage = stageForSize(q.qualifiers.length);
    firstKnockoutPairs(q.qualifiers, (x) => q.order.get(x.entryId) ?? 0).forEach(([a, b], pos) => out.push(koRow(t, div, emap, stage, pos, 1, a.entryId, b.entryId, newId)));
  }
  out.push(...laterRounds(t, divisions, entries, matches, newId));
  if (out.length) {
    const state = emptySlotState();
    for (const m of matches) {
      if (m.slot === undefined) continue;
      const s = state.busy.get(m.slot) ?? new Set<string>();
      [...m.sideA, ...m.sideB].forEach((p) => s.add(p));
      state.busy.set(m.slot, s);
      state.used.set(m.slot, Math.max(state.used.get(m.slot) ?? 0, m.court ?? 0));
    }
    const plan = scheduleSlots(out.map((m) => ({ key: m.id, playerIds: [...m.sideA, ...m.sideB] })), t.courts, lastSlot + 1, state);
    for (const m of out) { const s = plan.get(m.id); if (s) { m.slot = s.slot; m.court = s.court; } }
  }
  return out;
}

function koRow(t: ClubTournament, div: Division, emap: Map<string, Entry>, stage: KnockoutStage, bracketPos: number, round: number, a: string, b: string, newId: () => string): NewMatchRow {
  return {
    id: newId(), clubId: div.clubId, tournamentId: t.id, divisionId: div.id, stage, bracketPos, round, entryA: a, entryB: b,
    sideA: (emap.get(a) as Entry).playerIds, sideB: (emap.get(b) as Entry).playerIds, format: formatFor(div, stage), games: [], status: 'scheduled', playedOn: t.startDate,
  };
}

/** Any later-round knockout match whose two feeder matches are finished and that doesn't exist yet (not yet given a court). */
function laterRounds(t: ClubTournament, divisions: Division[], entries: Entry[], matches: ClubMatch[], newId: () => string): NewMatchRow[] {
  const out: NewMatchRow[] = [];
  const emap = new Map(entries.map((e) => [e.id, e]));
  for (const div of divisions) {
    const ko = matches.filter((m) => m.divisionId === div.id && m.stage !== 'pool' && m.status !== 'void');
    if (!ko.length) continue;
    const latest = ko.reduce((r, m) => Math.max(r, m.round ?? 1), 1);
    for (let r = 1; r <= latest; r++) {
      const round = ko.filter((m) => (m.round ?? 1) === r);
      const stage = round.length >= 2 ? nextStage(round[0].stage) : null;
      if (!stage) continue;
      const have = new Set(ko.filter((m) => (m.round ?? 1) === r + 1).map((m) => m.bracketPos));
      for (const p of nextRoundPairs(round)) if (!have.has(p.bracketPos)) out.push(koRow(t, div, emap, stage, p.bracketPos, r + 1, p.entryA, p.entryB, newId));
    }
  }
  return out;
}

export interface PoolQualifiers {
  /** Everyone going through, with their pool and place. */
  qualifiers: Qualifier[];
  /** Seeding order across pools (lower is better), used to seed the knockout. */
  order: Map<string, number>;
  /** The runners-up compared for the best-runner-up places, best first, and how many of them go through. */
  runnersUp: StandingRow[];
  extra: number;
}

/**
 * Who goes through from the pools: the top `advance` of each pool, plus (with best runners-up) the best next-placed
 * entries across pools. Places and the cross-pool order use the same tie-breaks as the pool tables.
 */
export function poolQualifiers(div: Division, entries: Entry[], poolMatches: ClubMatch[]): PoolQualifiers {
  const emap = new Map(entries.map((e) => [e.id, e]));
  const seedOf = (id: string) => emap.get(id)?.seed ?? 99;
  const active = entries.filter((e) => e.divisionId === div.id && e.status !== 'withdrawn');
  const extra = div.extra ?? 0;
  const byPlace: { row: StandingRow; pool: number; place: number }[] = [];
  const runnersUp: { row: StandingRow; pool: number }[] = [];
  for (let p = 1; p <= div.pools; p++) {
    const table = standings(active.filter((e) => (e.pool ?? 1) === p).map((e) => e.id), poolMatches, seedOf);
    table.slice(0, div.advance).forEach((row, i) => byPlace.push({ row, pool: p, place: i + 1 }));
    if (extra > 0 && table[div.advance]) runnersUp.push({ row: table[div.advance], pool: p });
  }
  const ranked = crossPoolOrder(runnersUp.map((r) => r.row), seedOf);
  const best = ranked.slice(0, extra).map((row) => ({ row, pool: (runnersUp.find((r) => r.row === row) as { pool: number }).pool, place: div.advance + 1 }));
  const all = [...byPlace, ...best];
  const order = new Map<string, number>();
  // Seed within each place across pools by the same per-match comparison.
  for (const place of [...new Set(all.map((x) => x.place))]) {
    crossPoolOrder(all.filter((x) => x.place === place).map((x) => x.row), seedOf).forEach((row, i) => order.set(row.entryId, i));
  }
  return { qualifiers: all.map((x) => ({ entryId: x.row.entryId, pool: x.pool, place: x.place })), order, runnersUp: ranked, extra };
}

/** The knockout/shape fields to copy onto a division. */
export function shapeFields(d: Pick<NewDivisionInput, 'shape' | 'extra' | 'stageFormats'>): Pick<Division, 'shape' | 'extra' | 'stageFormats'> {
  const out: Pick<Division, 'shape' | 'extra' | 'stageFormats'> = {};
  if (d.shape === 'ko') out.shape = 'ko';
  if (d.extra) out.extra = d.extra;
  if (d.stageFormats && Object.keys(d.stageFormats).length) out.stageFormats = d.stageFormats;
  return out;
}

// ---------- Editing entries after the draw ----------

const unplayed = (m: ClubMatch) => m.status === 'scheduled' || m.status === 'live';
const involves = (m: ClubMatch, entryId: string) => m.entryA === entryId || m.entryB === entryId;

export interface WithdrawPlan {
  /** Pool matches not yet played: cancelled, not counted. */
  voidIds: string[];
  /** Knockout matches not yet played: the opponent goes through. */
  walkovers: { id: string; winner: 'A' | 'B' }[];
}

/** What happens to the matches when an entry withdraws. Played results stay as they are. */
export function planWithdraw(entryId: string, matches: ClubMatch[]): WithdrawPlan {
  const plan: WithdrawPlan = { voidIds: [], walkovers: [] };
  for (const m of matches) {
    if (!unplayed(m) || !involves(m, entryId)) continue;
    if (m.stage === 'pool' || m.stage === 'friendly') plan.voidIds.push(m.id);
    else plan.walkovers.push({ id: m.id, winner: m.entryA === entryId ? 'B' : 'A' });
  }
  return plan;
}

export interface ReplacePlan { playerIds: string[]; matchSides: { id: string; sideA: string[]; sideB: string[] }[] }

/**
 * Swaps one player in an entry for another (a partner change or a substitute). Only matches not yet played change,
 * so past results keep the names of the people who actually played.
 */
export function planReplacePlayer(entry: Entry, oldId: string, newId: string, matches: ClubMatch[]): ReplacePlan | string {
  if (!entry.playerIds.includes(oldId)) return 'That player isn’t in this entry';
  if (oldId === newId) return 'Choose a different player';
  if (entry.playerIds.includes(newId)) return 'That player is already in this entry';
  const playerIds = entry.playerIds.map((p) => (p === oldId ? newId : p));
  const swap = (side: string[]) => side.map((p) => (p === oldId ? newId : p));
  const matchSides = matches.filter((m) => unplayed(m) && involves(m, entry.id)).map((m) => ({
    id: m.id, sideA: m.entryA === entry.id ? swap(m.sideA) : m.sideA, sideB: m.entryB === entry.id ? swap(m.sideB) : m.sideB,
  }));
  return { playerIds, matchSides };
}

/** Players already entered in a division (active entries), so the same person can't be entered twice. */
export function enteredPlayers(entries: Entry[], divisionId: string): Set<string> {
  return new Set(entries.filter((e) => e.divisionId === divisionId && e.status !== 'withdrawn').flatMap((e) => e.playerIds));
}

/**
 * A late entry joins the pool with the fewest active entries and gets a match against each of them,
 * scheduled after the last time slot already used. Not possible once knockouts have been drawn.
 */
export function planLateEntry(t: ClubTournament, div: Division, playerIds: string[], entries: Entry[], matches: ClubMatch[], newId: () => string): { entry: Entry; matches: NewMatchRow[] } | string {
  const need = div.kind === 'doubles' ? 2 : 1;
  if (playerIds.length !== need || new Set(playerIds).size !== need) return div.kind === 'doubles' ? 'Choose two different players' : 'Choose a player';
  const taken = enteredPlayers(entries, div.id);
  if (playerIds.some((p) => taken.has(p))) return 'A player is already entered in this event';
  if (div.shape === 'ko') return 'This is a knockout, so new entries can’t join after the draw';
  if (matches.some((m) => m.divisionId === div.id && m.stage !== 'pool')) return 'Knockouts have started, so new entries can’t join';
  const active = entries.filter((e) => e.divisionId === div.id && e.status !== 'withdrawn');
  const sizes = Array.from({ length: div.pools }, (_, i) => ({ pool: i + 1, n: active.filter((e) => (e.pool ?? 1) === i + 1).length }));
  const pool = sizes.sort((a, b) => a.n - b.n || a.pool - b.pool)[0].pool;
  const entry: Entry = { id: newId(), divisionId: div.id, clubId: div.clubId, playerIds, seed: Math.max(0, ...entries.filter((e) => e.divisionId === div.id).map((e) => e.seed ?? 0)) + 1, pool, status: 'active' };
  const opponents = active.filter((e) => (e.pool ?? 1) === pool);
  const lastRound = Math.max(0, ...matches.filter((m) => m.divisionId === div.id && m.pool === pool).map((m) => m.round ?? 0));
  const rows: NewMatchRow[] = opponents.map((o, i) => ({
    id: newId(), clubId: div.clubId, tournamentId: t.id, divisionId: div.id, stage: 'pool', pool, round: lastRound + 1 + i,
    entryA: o.id, entryB: entry.id, sideA: o.playerIds, sideB: playerIds, format: div.format, games: [], status: 'scheduled', playedOn: t.startDate,
  }));
  const state = emptySlotState();
  for (const m of matches) {
    if (m.slot === undefined || m.status === 'void') continue;
    const s = state.busy.get(m.slot) ?? new Set<string>();
    [...m.sideA, ...m.sideB].forEach((p) => s.add(p));
    state.busy.set(m.slot, s);
    state.used.set(m.slot, Math.max(state.used.get(m.slot) ?? 0, m.court ?? 0));
  }
  const after = Math.max(-1, ...matches.filter((m) => m.status !== 'void').map((m) => m.slot ?? -1)) + 1;
  const plan = scheduleSlots(rows.map((m) => ({ key: m.id, playerIds: [...m.sideA, ...m.sideB] })), t.courts, after, state);
  for (const m of rows) { const s = plan.get(m.id); if (s) { m.slot = s.slot; m.court = s.court; } }
  return { entry, matches: rows };
}

/** Whether every pool match in a division is finished (played or cancelled). */
export function poolsComplete(divisionId: string, matches: ClubMatch[]): boolean {
  const pool = matches.filter((m) => m.divisionId === divisionId && m.stage === 'pool');
  return pool.length > 0 && pool.every((m) => m.status === 'done' || m.status === 'void');
}

// ---------- Running the day (desk view) ----------

export interface CourtSlot { court: number; now?: ClubMatch; next?: ClubMatch }

const bySlot = (a: ClubMatch, b: ClubMatch) => (a.slot ?? 1e9) - (b.slot ?? 1e9) || (a.court ?? 0) - (b.court ?? 0);

/** What each court is doing: the match being played on it now, and the next one booked for it. */
export function courtBoard(matches: ClubMatch[], courts: number): CourtSlot[] {
  return Array.from({ length: courts }, (_, i) => {
    const court = i + 1;
    const here = matches.filter((m) => m.court === court);
    const now = here.filter((m) => m.status === 'live').sort(bySlot)[0];
    const next = here.filter((m) => m.status === 'scheduled').sort(bySlot)[0];
    return { court, now, next };
  });
}

/** Players on court right now (in a live match). */
export function playersOnCourt(matches: ClubMatch[]): Set<string> {
  return new Set(matches.filter((m) => m.status === 'live').flatMap((m) => [...m.sideA, ...m.sideB]));
}

/**
 * For a free court: the earliest waiting match that's stuck, because its own court is still busy (or it has none),
 * and whose players aren't on another court. Matches whose own court is free stay there.
 */
export function nextMatchToCall(matches: ClubMatch[], exceptCourt?: number): ClubMatch | undefined {
  const busy = playersOnCourt(matches);
  const courtsInUse = new Set(matches.filter((m) => m.status === 'live').map((m) => m.court));
  return matches
    .filter((m) => m.status === 'scheduled' && m.court !== exceptCourt && (m.court === undefined || courtsInUse.has(m.court)) && ![...m.sideA, ...m.sideB].some((p) => busy.has(p)))
    .sort(bySlot)[0];
}

/** Matches waiting to be played, in order. */
export function upNext(matches: ClubMatch[], limit = 8): ClubMatch[] {
  return matches.filter((m) => m.status === 'scheduled').sort(bySlot).slice(0, limit);
}
