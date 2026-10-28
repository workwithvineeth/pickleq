import type { Format } from '../../domain/types';
import type { ClubMatch, ClubPlayer, DivisionKind, Entry, Stage } from '../types';
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

export interface StandingRow { entryId: string; played: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number; diff: number; rank: number }

/**
 * Pool table. Tie-breaks, in order: wins; then head-to-head among the tied entries (wins in games between them);
 * then points difference; then points for; then seed.
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
  const byWins = [...rows.values()].sort((x, y) => y.wins - x.wins);
  const out: StandingRow[] = [];
  for (let i = 0; i < byWins.length;) {
    let j = i;
    while (j < byWins.length && byWins[j].wins === byWins[i].wins) j++;
    const tied = byWins.slice(i, j);
    const group = new Set(tied.map((t) => t.entryId));
    tied.sort((x, y) => (tied.length > 1 ? h2hWins(y.entryId, group) - h2hWins(x.entryId, group) : 0)
      || y.diff - x.diff || y.pointsFor - x.pointsFor || seedOf(x.entryId) - seedOf(y.entryId));
    out.push(...tied);
    i = j;
  }
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}

// ---------- Knockouts ----------

export const KNOCKOUT_SIZES = [2, 4, 8];
export function stageForSize(size: number): Stage { return size >= 8 ? 'qf' : size === 4 ? 'sf' : 'final'; }

export interface Qualifier { entryId: string; pool: number; place: number }

/** Standard bracket order for 2, 4 or 8 seeds: seed 1 and 2 can only meet in the final. */
function bracketOrder(size: number): number[] {
  if (size === 2) return [1, 2];
  if (size === 4) return [1, 4, 2, 3];
  return [1, 8, 4, 5, 2, 7, 3, 6];
}

/**
 * First knockout round from pool results. Pool winners are seeded first (better record first), then runners-up, and so on.
 * Pairs are then adjusted so two players from the same pool don't meet in the first round when it can be avoided.
 */
export function firstKnockoutPairs(qualifiers: Qualifier[], rankKey: (q: Qualifier) => number): [Qualifier, Qualifier][] {
  const size = qualifiers.length;
  if (!KNOCKOUT_SIZES.includes(size)) throw new Error('Knockouts need 2, 4 or 8 qualifiers');
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

/** Next knockout round once both feeder matches have a winner: winners of positions 2k and 2k+1 meet at position k. */
export function nextRoundPairs(round: ClubMatch[]): { bracketPos: number; entryA: string; entryB: string }[] {
  const byPos = new Map(round.map((m) => [m.bracketPos ?? 0, m]));
  const out: { bracketPos: number; entryA: string; entryB: string }[] = [];
  for (let k = 0; k < round.length / 2; k++) {
    const x = byPos.get(2 * k), y = byPos.get(2 * k + 1);
    if (!x || !y || x.status !== 'done' || y.status !== 'done') continue;
    const wx = x.winner === 'A' ? x.entryA : x.entryB;
    const wy = y.winner === 'A' ? y.entryA : y.entryB;
    if (wx && wy) out.push({ bracketPos: k, entryA: wx, entryB: wy });
  }
  return out;
}

export function nextStage(s: Stage): Stage | null { return s === 'qf' ? 'sf' : s === 'sf' ? 'final' : null; }

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
