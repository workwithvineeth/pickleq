import { ratingOn } from '../db/ratings';
import type { WinLoss } from './record';
import type { Category, Match, MatchType, RatingEntry, Strength } from './types';

export type Range = 'last10' | '30d' | '90d' | 'all';
export type TypeFilter = 'all' | 'singles' | 'doubles';
export interface StatsFilter { range: Range; type: TypeFilter }

const DAY = 86_400_000;
const wl = (): WinLoss => ({ wins: 0, losses: 0 });
const add = (r: WinLoss, won: boolean) => (won ? r.wins++ : r.losses++);
export const pct = (r: WinLoss): number | null => {
  const n = r.wins + r.losses;
  return n ? Math.round((r.wins / n) * 100) : null;
};

function isoDaysAgo(today: Date, days: number): string {
  const d = new Date(today.getTime() - days * DAY);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Newest first. Applies the type filter, then the range. */
export function filterMatches(matches: Match[], f: StatsFilter, today = new Date()): Match[] {
  const active = matches
    .filter((m) => m.deletedAt === undefined)
    .filter((m) => f.type === 'all' || (f.type === 'singles' ? m.type === 'singles' : m.type !== 'singles'))
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
  if (f.range === 'last10') return active.slice(0, 10);
  if (f.range === 'all') return active;
  const from = isoDaysAgo(today, f.range === '30d' ? 30 : 90);
  return active.filter((m) => m.date >= from);
}

export interface Summary {
  matches: number;
  record: WinLoss;
  games: WinLoss;
  pointsFor: number | null;
  pointsAgainst: number | null;
  closeGames: WinLoss;
  /** Games from matches where momentum was recorded (not backfilled). */
  trackedGames: number;
  comebacks: number;
  lostLeads: number;
  dominated: number;
  biggestComeback: { from: string; deficit: number } | null;
  biggestLostLead: { from: string; lead: number } | null;
}

export const CLOSE_MARGIN = 3;

export function summarize(matches: Match[]): Summary {
  const s: Summary = {
    matches: matches.length, record: wl(), games: wl(), pointsFor: null, pointsAgainst: null, closeGames: wl(),
    trackedGames: 0, comebacks: 0, lostLeads: 0, dominated: 0, biggestComeback: null, biggestLostLead: null,
  };
  let pf = 0, pa = 0, n = 0;
  for (const m of matches) {
    add(s.record, m.won);
    for (const g of m.games) {
      if (g.you === null || g.them === null) continue;
      const won = g.you > g.them;
      add(s.games, won);
      pf += g.you; pa += g.them; n++;
      if (Math.abs(g.you - g.them) <= CLOSE_MARGIN) add(s.closeGames, won);
      if (m.backfilled) continue;
      s.trackedGames++;
      if (g.momentum === 'dominated') s.dominated++;
      if (g.momentum === 'came-back' && g.fromYou !== undefined && g.fromThem !== undefined) {
        s.comebacks++;
        const deficit = g.fromThem - g.fromYou;
        if (!s.biggestComeback || deficit > s.biggestComeback.deficit) s.biggestComeback = { from: `${g.fromYou}–${g.fromThem}`, deficit };
      }
      if (g.momentum === 'lost-lead' && g.fromYou !== undefined && g.fromThem !== undefined) {
        s.lostLeads++;
        const lead = g.fromYou - g.fromThem;
        if (!s.biggestLostLead || lead > s.biggestLostLead.lead) s.biggestLostLead = { from: `${g.fromYou}–${g.fromThem}`, lead };
      }
    }
  }
  if (n) {
    s.pointsFor = Math.round((pf / n) * 10) / 10;
    s.pointsAgainst = Math.round((pa / n) * 10) / 10;
  }
  return s;
}

/** A rating gap smaller than this counts as an even match. */
export const EVEN_GAP = 0.15;

/**
 * Opponent strength for one match. Uses DUPR ratings when both your rating (for that match type, on that date)
 * and the opponent's are known; otherwise the stronger/equal/weaker tag you chose. Unknown if neither exists.
 */
export function opponentStrength(m: Match, myRating: number | undefined): Strength | undefined {
  const scores: number[] = [];
  for (const p of m.participants) {
    if (p.role !== 'opponent') continue;
    if (p.rating !== undefined && myRating !== undefined) {
      const gap = p.rating - myRating;
      scores.push(gap > EVEN_GAP ? 1 : gap < -EVEN_GAP ? -1 : 0);
    } else if (p.strength) {
      scores.push(p.strength === 'stronger' ? 1 : p.strength === 'weaker' ? -1 : 0);
    }
  }
  if (!scores.length) return undefined;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return avg > 0.34 ? 'stronger' : avg < -0.34 ? 'weaker' : 'equal';
}

export interface Splits {
  byType: Record<MatchType, WinLoss>;
  byCategory: Record<Category, WinLoss>;
  byStrength: Record<Strength, WinLoss>;
  strengthUnknown: number;
}

export function splits(matches: Match[], singles: RatingEntry[], doubles: RatingEntry[]): Splits {
  const s: Splits = {
    byType: { singles: wl(), doubles: wl(), mixed: wl() },
    byCategory: { casual: wl(), practice: wl(), tournament: wl() },
    byStrength: { stronger: wl(), equal: wl(), weaker: wl() },
    strengthUnknown: 0,
  };
  for (const m of matches) {
    add(s.byType[m.type], m.won);
    add(s.byCategory[m.category], m.won);
    const hist = m.type === 'singles' ? singles : doubles;
    const mine = ratingOn(hist, m.date) ?? hist[0]?.value;
    const st = opponentStrength(m, mine);
    if (st) add(s.byStrength[st], m.won);
    else s.strengthUnknown++;
  }
  return s;
}

export function byEnergy(matches: Match[]): { level: number; record: WinLoss }[] {
  const levels = [1, 2, 3, 4, 5].map((level) => ({ level, record: wl() }));
  for (const m of matches) if (m.energy) add(levels[m.energy - 1].record, m.won);
  return levels;
}

export interface PersonRecord { name: string; record: WinLoss }

function people(matches: Match[], role: 'partner' | 'opponent'): PersonRecord[] {
  const map = new Map<string, PersonRecord>();
  for (const m of matches) {
    const names = new Set(m.participants.filter((p) => p.role === role && p.name).map((p) => p.name));
    for (const name of names) {
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { name, record: wl() });
      add(map.get(key)!.record, m.won);
    }
  }
  const n = (p: PersonRecord) => p.record.wins + p.record.losses;
  return [...map.values()].sort((a, b) => n(b) - n(a) || (pct(b.record) ?? 0) - (pct(a.record) ?? 0) || a.name.localeCompare(b.name));
}

export const headToHead = (matches: Match[]) => people(matches, 'opponent');
export const partners = (matches: Match[]) => people(matches.filter((m) => m.type !== 'singles'), 'partner');

/** Newest first: W or L. */
export const form = (matches: Match[], n = 10): ('W' | 'L')[] => matches.slice(0, n).map((m) => (m.won ? 'W' : 'L'));

/** Oldest first: win % over the previous `window` matches, once at least `min` matches exist. */
export function rollingWinPct(matches: Match[], window = 10, min = 5): { date: string; pct: number; n: number }[] {
  const chrono = [...matches].reverse();
  const out: { date: string; pct: number; n: number }[] = [];
  chrono.forEach((m, i) => {
    const slice = chrono.slice(Math.max(0, i - window + 1), i + 1);
    if (slice.length < min) return;
    out.push({ date: m.date, pct: Math.round((slice.filter((x) => x.won).length / slice.length) * 100), n: slice.length });
  });
  return out;
}
