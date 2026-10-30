import { bracketSize, KNOCKOUT_SIZES, MAX_BRACKET, roundRobinRounds, scheduleSlots, slotTime, snakePools, stageForSize } from './domain/engine';
import { checkShape } from './plan';
import type { KnockoutStage } from './types';

/** One event's shape, as far as timing goes. */
export interface ShapeChoice { shape: 'rr' | 'pools-ko' | 'ko'; pools: number; advance: number; extra: number }
export interface EventPlanInput extends ShapeChoice { name: string; entries: number }

export interface EventCount { pool: number; knockout: number; byes: number; koRounds: number[]; firstStage?: KnockoutStage }
export interface DayEstimate {
  matches: number;
  slots: number;
  /** Finish time, HH:MM (the end of the last slot). */
  end: string;
  /** Minutes after midnight of the start day; can be over 24 × 60. */
  endMinutes: number;
  perEvent: EventCount[];
}

/** How many pool and knockout matches an event has (byes aren't matches). */
export function eventMatches(x: EventPlanInput): EventCount {
  const n = Math.max(0, x.entries);
  if (x.shape === 'ko') {
    if (n < 2) return { pool: 0, knockout: 0, byes: 0, koRounds: [] };
    const size = bracketSize(Math.min(n, MAX_BRACKET));
    const rounds: number[] = [];
    for (let s = size; s >= 2; s /= 2) rounds.push(s / 2);
    rounds[0] = rounds[0] - (size - n);
    return { pool: 0, knockout: n - 1, byes: size - n, koRounds: rounds, firstStage: stageForSize(size) };
  }
  const pools = x.shape === 'rr' ? 1 : Math.max(1, x.pools);
  const sizes = Array.from({ length: pools }, (_, i) => Math.floor(n / pools) + (i < n % pools ? 1 : 0));
  const pool = sizes.reduce((s, k) => s + (k * (k - 1)) / 2, 0);
  const q = x.shape === 'rr' ? 0 : pools * x.advance + x.extra;
  if (!KNOCKOUT_SIZES.includes(q)) return { pool, knockout: 0, byes: 0, koRounds: [] };
  const rounds: number[] = [];
  for (let s = q; s >= 2; s /= 2) rounds.push(s / 2);
  return { pool, knockout: q - 1, byes: 0, koRounds: rounds, firstStage: stageForSize(q) };
}

/**
 * Roughly when the day finishes, using the app's own scheduler: pool matches of every event share the courts
 * (nobody on two courts at once), then each knockout round follows the one before. Assumes different people in each event;
 * when the same people play singles and doubles it can run a little longer.
 */
export function estimateDay(events: EventPlanInput[], courts: number, slotMinutes: number, startTime: string): DayEstimate {
  const items: { key: string; playerIds: string[] }[] = [];
  const perEvent = events.map((x) => eventMatches(x));
  events.forEach((x, ei) => {
    if (x.shape === 'ko' || x.entries < 2) return;
    const pools = x.shape === 'rr' ? 1 : Math.max(1, x.pools);
    const where = snakePools(x.entries, pools);
    for (let p = 1; p <= pools; p++) {
      const ids = where.map((w, i) => (w === p ? `e${ei}-${i}` : '')).filter(Boolean);
      roundRobinRounds(ids).forEach((round, r) => round.forEach(([a, b], k) => items.push({ key: `${ei}-${p}-${r}-${k}`, playerIds: [a, b] })));
    }
  });
  // The real draw interleaves pools round by round; sorting by round keeps the estimate close to it.
  items.sort((a, b) => Number(a.key.split('-')[2]) - Number(b.key.split('-')[2]));
  const plan = scheduleSlots(items, Math.max(1, courts));
  let slots = items.length ? Math.max(...[...plan.values()].map((v) => v.slot)) + 1 : 0;
  const depth = Math.max(0, ...perEvent.map((e) => e.koRounds.length));
  for (let r = 0; r < depth; r++) {
    const m = perEvent.reduce((s, e) => s + (e.koRounds[r] ?? 0), 0);
    if (m > 0) slots += Math.ceil(m / Math.max(1, courts));
  }
  const [h, mi] = startTime.split(':').map(Number);
  const endMinutes = (h || 0) * 60 + (mi || 0) + slots * slotMinutes;
  return { matches: perEvent.reduce((s, e) => s + e.pool + e.knockout, 0), slots, end: slotTime(startTime, slots, slotMinutes), endMinutes, perEvent };
}

/** "9:40 pm" from minutes after midnight (adds "next day" past midnight). */
export function clockText(minutes: number): string {
  const day = Math.floor(minutes / 1440);
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  const t = `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  return day > 0 ? `${t} the next day` : t;
}

export function minutesOf(hhmm: string): number { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0); }

/** A short description, e.g. "4 pools of 5 · top 2 through · quarter-finals". */
export function shapeText(x: EventPlanInput): string {
  if (x.shape === 'rr') return `Round robin: everyone plays everyone (${x.entries} ${x.entries === 1 ? 'entry' : 'entries'})`;
  const c = eventMatches(x);
  const first = c.firstStage ? STAGE_NAME[c.firstStage] : '';
  if (x.shape === 'ko') return `Knockout only${c.byes ? ` · ${c.byes} ${c.byes === 1 ? 'bye' : 'byes'}` : ''}${first ? ` · starts at the ${first}` : ''}`;
  const sizes = [...new Set(Array.from({ length: x.pools }, (_, i) => Math.floor(x.entries / x.pools) + (i < x.entries % x.pools ? 1 : 0)))].sort((a, b) => b - a);
  const through = x.advance === 1 ? 'winners' : `top ${x.advance}`;
  return `${x.pools} pools of ${sizes.join('–')} · ${through}${x.extra ? ` + ${x.extra} best ${x.advance === 1 ? 'runners-up' : `${ordinal(x.advance + 1)}-placed`}` : ''} through${first ? ` · ${first}` : ''}`;
}
const STAGE_NAME: Record<KnockoutStage, string> = { r32: 'round of 32', r16: 'round of 16', qf: 'quarter-finals', sf: 'semi-finals', final: 'final' };
const ordinal = (n: number) => `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** Every sensible shape for n entries (pools of 3 or more, knockouts of 2–16, knockout only, round robin up to 10). */
export function shapeOptions(n: number): ShapeChoice[] {
  const out: ShapeChoice[] = [];
  if (n >= 2) out.push({ shape: 'ko', pools: 1, advance: 0, extra: 0 });
  if (n >= 2 && n <= 10) out.push({ shape: 'rr', pools: 1, advance: 0, extra: 0 });
  for (let p = 2; p <= 8; p++) {
    if (Math.floor(n / p) < 3) break;
    for (const a of [1, 2]) for (let e = 0; e < p; e++) {
      const c: ShapeChoice = { shape: 'pools-ko', pools: p, advance: a, extra: e };
      if (!checkShape(c, n)) out.push(c);
    }
  }
  return out;
}

export interface Suggestion { eventIndex: number; choice: ShapeChoice; estimate: DayEstimate; text: string }

/**
 * Faster shapes that finish by the target time: for each event, other shapes are tried with the rest unchanged.
 * Ordered by the most matches played (more play for the same money), then the earliest finish. Up to `limit`.
 */
export function fasterOptions(events: EventPlanInput[], courts: number, slotMinutes: number, startTime: string, targetMinutes: number, limit = 3): Suggestion[] {
  const out: Suggestion[] = [];
  events.forEach((x, i) => {
    for (const c of shapeOptions(x.entries)) {
      if (c.shape === x.shape && c.pools === x.pools && c.advance === x.advance && c.extra === x.extra) continue;
      const next = events.map((y, j) => (j === i ? { ...y, ...c } : y));
      const est = estimateDay(next, courts, slotMinutes, startTime);
      if (est.endMinutes <= targetMinutes) out.push({ eventIndex: i, choice: c, estimate: est, text: `${x.name}: ${shapeText({ ...x, ...c })}` });
    }
  });
  return out.sort((a, b) => b.estimate.matches - a.estimate.matches || a.estimate.endMinutes - b.estimate.endMinutes).slice(0, limit);
}
