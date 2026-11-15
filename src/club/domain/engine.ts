import type { Format } from '../../domain/types';
import type { ClubMatch, ClubPlayer, Division, DivisionKind, Entry, KnockoutStage, Stage } from '../types';
import { gameOver } from './momentum';

// ---------- Ratings and seeding ----------

export function playerRating(p: ClubPlayer | undefined, kind: DivisionKind): number | undefined {
  if (!p) return undefined;
  return kind === 'singles' ? p.duprSingles ?? p.duprDoubles : p.duprDoubles ?? p.duprSingles;
}

/** Average DUPR of an entry's players (undefined if nobody has a rating). */
export function entryRating(playerIds: string[], players: Map<string, ClubPlayer>, kind: DivisionKind): number | undefined {
  const rs = playerIds.map((id) => playerRating(players.get(id), kind)).filter((r): r is number => r !== undefined);
  return rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : undefined;
}

/** Seeds 1..n by rating, highest first; unrated entries go last in their original order. */
export function seedOrder<T>(items: T[], rating: (t: T) => number | undefined): T[] {
  return items.map((t, i) => ({ t, i, r: rating(t) }))
    .sort((x, y) => (y.r ?? -1) - (x.r ?? -1) || x.i - y.i)
    .map((x) => x.t);
}

/** Snake seeding: seeds 1..n spread across pools so the strongest players start in different pools. Returns 1-based pool numbers. */
export function snakePools(n: number, pools: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const round = Math.floor(i / pools);
    const pos = i % pools;
    return (round % 2 === 0 ? pos : pools - 1 - pos) + 1;
  });
}

/** Every pairing once, arranged in rounds so nobody plays twice in a round (circle method). */
export function roundRobinRounds<T>(ids: T[]): [T, T][][] {
  const list: (T | null)[] = [...ids];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) {
      const x = list[i], y = list[n - 1 - i];
      if (x !== null && y !== null) round.push(r % 2 === 0 ? [x, y] : [y, x]);
    }
    rounds.push(round);
    list.splice(1, 0, list.pop() as T | null);
  }
  return rounds;
}

// ---------- Results ----------

export function gamesNeededToWin(f: Format): number { return Math.ceil(f.bestOf / 2); }

export interface MatchResult { gamesA: number; gamesB: number; pointsA: number; pointsB: number; winner?: 'A' | 'B' }

export function matchResult(m: Pick<ClubMatch, 'games' | 'format'>): MatchResult {
  let gamesA = 0, gamesB = 0, pointsA = 0, pointsB = 0;
  for (const g of m.games) {
    pointsA += g.a; pointsB += g.b;
    if (gameOver(g.a, g.b, m.format.pointsTo, !!m.format.golden)) { if (g.a > g.b) gamesA++; else gamesB++; }
  }
  const need = gamesNeededToWin(m.format);
  const winner = gamesA >= need ? 'A' : gamesB >= need ? 'B' : undefined;
  return { gamesA, gamesB, pointsA, pointsB, winner };
}

// ---------- Pool standings ----------

/** The tie-break order, in the words shown under every pool table. */
export const TIE_BREAK_TEXT = 'Ties are split by: 1. most wins; 2. head-to-head (wins in matches between the tied players); 3. points difference (+/−); 4. points scored (PF); 5. seed.';
/** Events whose organiser asked for points difference before head-to-head (FPL Season 2, 15 Nov 2026: Men's and Mixed Doubles).
 * Keyed by event (division) id so finished tournaments keep the order their knockouts were built from.
 * TODO: make this a per-tournament setting (needs a migration) and remove the list. */
export const DIFF_FIRST_DIVISIONS = new Set(['2148d66b-f037-4026-8c88-578ba391ef75', '3d5f2301-2523-477a-8385-994781085a36']);
export const TIE_BREAK_TEXT_DIFF = 'Ties are split by: 1. most wins; 2. points difference (+/−); 3. points scored (PF); 4. head-to-head (wins in matches between the tied players); 5. seed.';
export const diffFirst = (divisionId?: string) => !!divisionId && DIFF_FIRST_DIVISIONS.has(divisionId);
/** The tie-break words for an event. */
export const tieBreakText = (divisionId?: string) => (diffFirst(divisionId) ? TIE_BREAK_TEXT_DIFF : TIE_BREAK_TEXT);
export const RUNNERS_UP_TEXT = 'Best runners-up are compared across pools per match played: share of matches won, then points difference per match, then points scored per match, then seed.';

export interface StandingRow { entryId: string; played: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number; diff: number; rank: number }

/**
 * Pool table (events in DIFF_FIRST_DIVISIONS use wins, points difference, points scored, head-to-head, seed instead). Tie-breaks, in order: wins; then head-to-head among the tied entries (wins in matches between them,
 * checked again if that leaves a smaller tie); then points difference; then points scored; then seed.
 */
export function standings(entryIds: string[], matches: ClubMatch[], seedOf: (id: string) => number = () => 0): StandingRow[] {
  const rows = new Map<string, StandingRow>(entryIds.map((id) => [id, { entryId: id, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0, rank: 0 }]));
  const done = matches.filter((m) => m.status === 'done' && m.entryA && m.entryB && rows.has(m.entryA) && rows.has(m.entryB));
  for (const m of done) {
    const r = matchResult(m);
    if (!r.winner) continue;
    const a = rows.get(m.entryA as string) as StandingRow, b = rows.get(m.entryB as string) as StandingRow;
    a.played++; b.played++;
    a.pointsFor += r.pointsA; a.pointsAgainst += r.pointsB; b.pointsFor += r.pointsB; b.pointsAgainst += r.pointsA;
    if (r.winner === 'A') { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
  }
  for (const r of rows.values()) r.diff = r.pointsFor - r.pointsAgainst;
  const h2hWins = (id: string, group: Set<string>) => done.filter((m) => {
    const r = matchResult(m);
    const other = m.entryA === id ? m.entryB : m.entryB === id ? m.entryA : undefined;
    if (!other || !group.has(other)) return false;
    return (m.entryA === id && r.winner === 'A') || (m.entryB === id && r.winner === 'B');
  }).length;
  const rest = (x: StandingRow, y: StandingRow) => y.diff - x.diff || y.pointsFor - x.pointsFor || seedOf(x.entryId) - seedOf(y.entryId);
  // Head-to-head among the tied; if that splits them into smaller ties, head-to-head is checked again within each.
  const rankTied = (tied: StandingRow[]): StandingRow[] => {
    if (tied.length < 2) return tied;
    const group = new Set(tied.map((t) => t.entryId));
    const h = new Map(tied.map((t) => [t.entryId, h2hWins(t.entryId, group)]));
    const levels = [...new Set(h.values())].sort((a, b) => b - a);
    if (levels.length === 1) return [...tied].sort(rest);
    return levels.flatMap((lv) => rankTied(tied.filter((t) => h.get(t.entryId) === lv)));
  };
  if (matches.some((m) => diffFirst(m.divisionId))) {
    // Most wins, then points difference, then points scored, then head-to-head among those still level, then seed.
    const key = (r: StandingRow) => `${r.wins}|${r.diff}|${r.pointsFor}`;
    const sorted = [...rows.values()].sort((x, y) => y.wins - x.wins || y.diff - x.diff || y.pointsFor - x.pointsFor);
    const h2hThenSeed = (tied: StandingRow[]): StandingRow[] => {
      if (tied.length < 2) return tied;
      const group = new Set(tied.map((t) => t.entryId));
      const h = new Map(tied.map((t) => [t.entryId, h2hWins(t.entryId, group)]));
      const levels = [...new Set(h.values())].sort((a, b) => b - a);
      if (levels.length === 1) return [...tied].sort((x, y) => seedOf(x.entryId) - seedOf(y.entryId));
      return levels.flatMap((lv) => h2hThenSeed(tied.filter((t) => h.get(t.entryId) === lv)));
    };
    const res: StandingRow[] = [];
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j < sorted.length && key(sorted[j]) === key(sorted[i])) j++;
      res.push(...h2hThenSeed(sorted.slice(i, j)));
      i = j;
    }
    res.forEach((r, i) => { r.rank = i + 1; });
    return res;
  }
  const byWins = [...rows.values()].sort((x, y) => y.wins - x.wins);
  const out: StandingRow[] = [];
  for (let i = 0; i < byWins.length;) {
    let j = i;
    while (j < byWins.length && byWins[j].wins === byWins[i].wins) j++;
    out.push(...rankTied(byWins.slice(i, j)));
    i = j;
  }
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}

// ---------- Knockouts ----------

/** Knockouts after pools: 2, 4, 8 or 16 go through. Knockout-only events can have up to 32 (with byes). */
export const KNOCKOUT_SIZES = [2, 4, 8, 16];
export const MAX_BRACKET = 32;
export function stageForSize(size: number): KnockoutStage { return size >= 32 ? 'r32' : size >= 16 ? 'r16' : size >= 8 ? 'qf' : size >= 4 ? 'sf' : 'final'; }
/** Smallest bracket (2, 4, 8, 16 or 32) that holds n entries. */
export function bracketSize(n: number): number { let s = 2; while (s < n) s *= 2; return s; }

export interface Qualifier { entryId: string; pool: number; place: number }

/** Standard bracket order for a power-of-two number of seeds: seeds 1 and 2 can only meet in the final, 1–4 not before the semis. */
export function bracketOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) { const m = order.length * 2; order = order.flatMap((s) => [s, m + 1 - s]); }
  return order;
}

/** The game format for a stage of a division: pool games, or the knockout round's own format (else the knockout default). */
export function formatFor(div: Pick<Division, 'format' | 'koFormat' | 'stageFormats'>, stage: Stage): Format {
  if (stage === 'pool' || stage === 'friendly') return div.format;
  return div.stageFormats?.[stage] ?? div.koFormat;
}

/**
 * Orders entries from different pools (e.g. runners-up competing for the best-runner-up places). Pools can differ in size
 * (a withdrawal, an odd number of entries), so it compares per match played: share of matches won, then points difference
 * per match, then points scored per match, then seed. Head-to-head can't apply: they haven't played each other.
 */
export function crossPoolOrder(rows: StandingRow[], seedOf: (id: string) => number = () => 0): StandingRow[] {
  const per = (x: number, r: StandingRow) => (r.played ? x / r.played : 0);
  return [...rows].sort((x, y) => per(y.wins, y) - per(x.wins, x) || per(y.diff, y) - per(x.diff, x)
    || per(y.pointsFor, y) - per(x.pointsFor, x) || seedOf(x.entryId) - seedOf(y.entryId));
}

/**
 * Crossover first round (RallyQ rule, Vineeth 11 Nov 2026): with 2, 4 or 8 pools sending the same number of teams (1 or 2 each),
 * the first pool crosses with the last, the second with the second-last, and so on: A1 v D2 · B1 v C2 · C1 v B2 · D1 v A2.
 * Two teams from the same pool land in opposite halves, so they can only meet again in the final.
 * Returns null when the qualifiers don't fit that shape (e.g. best third-placed teams); the seeded bracket is used then.
 */
export function crossoverPairs(qualifiers: Qualifier[], chartFour = false): [Qualifier, Qualifier][] | null {
  const pools = [...new Set(qualifiers.map((q) => q.pool))].sort((x, y) => x - y);
  const n = pools.length, per = qualifiers.length / n;
  const at = (pool: number, place: number) => qualifiers.find((q) => q.pool === pool && q.place === place);
  if (n === 2 && per === 4) {
    // Two pools, top four each (FPL Season 2 chart): QF1 A1 v B4, QF2 A2 v B3, QF3 A3 v B2, QF4 A4 v B1, then SF1 = QF1 v QF4 and
    // SF2 = QF2 v QF3. Bracket positions 0-1 and 2-3 meet in the semifinals, so the order is QF1, QF4, QF2, QF3.
    const [a, b] = pools;
    const order: [number, number, number, number][] = [[a, 1, b, 4], [a, 4, b, 1], [a, 2, b, 3], [a, 3, b, 2]];
    const out: [Qualifier, Qualifier][] = [];
    for (const [pa, la, pb, lb] of order) { const x = at(pa, la), y = at(pb, lb); if (!x || !y) return null; out.push([x, y]); }
    return out;
  }
  if (chartFour && n === 4 && per === 2) {
    // Four pools, top two each (FPL Season 2 chart, only for the events in DIFF_FIRST_DIVISIONS): QF1 A1 v B2, QF2 A2 v B1, QF3 C1 v D2, QF4 C2 v D1, then SF1 = QF1 v QF3 and
    // SF2 = QF2 v QF4. Bracket positions 0-1 and 2-3 meet in the semifinals, so the order is QF1, QF3, QF2, QF4.
    const [a, b, c, d] = pools;
    const order: [number, number, number, number][] = [[a, 1, b, 2], [c, 1, d, 2], [a, 2, b, 1], [c, 2, d, 1]];
    const out: [Qualifier, Qualifier][] = [];
    for (const [pa, la, pb, lb] of order) { const x = at(pa, la), y = at(pb, lb); if (!x || !y) return null; out.push([x, y]); }
    return out;
  }
  if (![2, 4, 8].includes(n) || (per !== 1 && per !== 2)) return null;
  const pairs: [Qualifier, Qualifier][] = [];
  if (per === 2) {
    for (let i = 0; i < n; i++) { const a = at(pools[i], 1), b = at(pools[n - 1 - i], 2); if (!a || !b) return null; pairs.push([a, b]); }
  } else {
    for (let i = 0; i < n / 2; i++) { const a = at(pools[i], 1), b = at(pools[n - 1 - i], 1); if (!a || !b) return null; pairs.push([a, b]); }
  }
  return pairs;
}

/**
 * First knockout round from pool results. Pools cross over when they can (see crossoverPairs). Otherwise pool winners are
 * seeded first (better record first), then runners-up, and so on, and pairs are adjusted so two players from the same
 * pool don't meet in the first round when it can be avoided.
 */
export function firstKnockoutPairs(qualifiers: Qualifier[], rankKey: (q: Qualifier) => number, divisionId?: string): [Qualifier, Qualifier][] {
  const size = qualifiers.length;
  if (!KNOCKOUT_SIZES.includes(size)) throw new Error('Knockouts need 2, 4, 8 or 16 qualifiers');
  const crossed = crossoverPairs(qualifiers, diffFirst(divisionId));
  if (crossed) return crossed;
  const seeded = [...qualifiers].sort((x, y) => x.place - y.place || rankKey(x) - rankKey(y));
  const order = bracketOrder(size);
  const pairs: [Qualifier, Qualifier][] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([seeded[order[i] - 1], seeded[order[i + 1] - 1]]);
  // Avoid same-pool first-round matches by swapping the lower-placed opponents.
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0].pool !== pairs[i][1].pool) continue;
    for (let j = 0; j < pairs.length; j++) {
      if (j === i) continue;
      const a = pairs[i][1], b = pairs[j][1];
      if (a.place === b.place && pairs[i][0].pool !== b.pool && pairs[j][0].pool !== a.pool) {
        pairs[i][1] = b; pairs[j][1] = a; break;
      }
    }
  }
  return pairs;
}

/**
 * First round of a knockout-only event. Entries come in seed order (best first). The bracket is the next size up
 * (2–32); missing seeds are byes, so the top seeds go straight to round two. A pair with no second entry is a bye.
 */
export function knockoutOnlyPairs<T>(seeded: T[]): [T, T | undefined][] {
  if (seeded.length < 2 || seeded.length > MAX_BRACKET) throw new Error(`A knockout needs 2 to ${MAX_BRACKET} entries`);
  const order = bracketOrder(bracketSize(seeded.length));
  const out: [T, T | undefined][] = [];
  for (let i = 0; i < order.length; i += 2) out.push([seeded[order[i] - 1], seeded[order[i + 1] - 1]]);
  return out;
}

/** Next knockout round once both feeder matches have a winner: winners of positions 2k and 2k+1 meet at position k. */
export function nextRoundPairs(round: ClubMatch[]): { bracketPos: number; entryA: string; entryB: string }[] {
  const byPos = new Map(round.map((m) => [m.bracketPos ?? 0, m]));
  const out: { bracketPos: number; entryA: string; entryB: string }[] = [];
  for (let k = 0; k < round.length / 2; k++) {
    const x = byPos.get(2 * k), y = byPos.get(2 * k + 1);
    if (!x || !y || x.status !== 'done' || y.status !== 'done') continue;
    const wx = x.winner === 'A' ? x.entryA : x.winner === 'B' ? x.entryB : undefined;
    const wy = y.winner === 'A' ? y.entryA : y.winner === 'B' ? y.entryB : undefined;
    if (wx && wy) out.push({ bracketPos: k, entryA: wx, entryB: wy });
  }
  return out;
}

export function nextStage(s: Stage): KnockoutStage | null { return s === 'r32' ? 'r16' : s === 'r16' ? 'qf' : s === 'qf' ? 'sf' : s === 'sf' ? 'final' : null; }

// ---------- Courts and times ----------

export interface Schedulable { key: string; playerIds: string[] }

/**
 * Gives each match a time slot and court, in the order given. Nobody plays twice in one slot, and where possible
 * nobody plays two slots in a row. Returns slot (from startSlot) and court (1-based) per key.
 */
export interface SlotState { busy: Map<number, Set<string>>; used: Map<number, number> }
export function emptySlotState(): SlotState { return { busy: new Map(), used: new Map() }; }

export function scheduleSlots(items: Schedulable[], courts: number, startSlot = 0, state: SlotState = emptySlotState()): Map<string, { slot: number; court: number }> {
  const out = new Map<string, { slot: number; court: number }>();
  const left = [...items];
  let slot = startSlot;
  let guard = 0;
  const { busy, used } = state;
  while (left.length && guard++ < 10000) {
    const inSlot = new Set(busy.get(slot) ?? []);
    const prev = busy.get(slot - 1) ?? new Set<string>();
    let court = used.get(slot) ?? 0;
    const pick = (avoidPrev: boolean) => {
      for (let i = 0; i < left.length && court < courts; i++) {
        const it = left[i];
        if (it.playerIds.some((p) => inSlot.has(p))) continue;
        if (avoidPrev && it.playerIds.some((p) => prev.has(p))) continue;
        court++;
        out.set(it.key, { slot, court });
        it.playerIds.forEach((p) => inSlot.add(p));
        left.splice(i, 1); i--;
      }
    };
    pick(true);
    pick(false);
    busy.set(slot, inSlot);
    used.set(slot, court);
    slot++;
  }
  return out;
}

/** "08:00" + slot × minutes → "09:20" */
export function slotTime(startTime: string, slot: number, slotMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + slot * slotMinutes;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 60) % 24)}:${p(total % 60)}`;
}

// ---------- Building a division ----------

export interface PlannedMatch { stage: Stage; pool?: number; round: number; bracketPos?: number; entryA: string; entryB: string }

/** Pool matches for a division, interleaved across pools round by round so pools progress together. */
export function planPoolMatches(entries: Entry[]): PlannedMatch[] {
  const pools = new Map<number, string[]>();
  for (const e of entries) { const k = e.pool ?? 1; pools.set(k, [...(pools.get(k) ?? []), e.id]); }
  const perPool = [...pools.entries()].sort((a, b) => a[0] - b[0]).map(([pool, ids]) => ({ pool, rounds: roundRobinRounds(ids) }));
  const maxRounds = Math.max(0, ...perPool.map((p) => p.rounds.length));
  const out: PlannedMatch[] = [];
  for (let r = 0; r < maxRounds; r++) {
    for (const p of perPool) for (const [a, b] of p.rounds[r] ?? []) out.push({ stage: 'pool', pool: p.pool, round: r + 1, entryA: a, entryB: b });
  }
  return out;
}

export function poolLetter(pool: number | undefined): string { return pool ? String.fromCharCode(64 + pool) : ''; }
