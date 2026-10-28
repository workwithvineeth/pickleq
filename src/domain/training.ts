import { fmtRating } from './record';
import type { Goal, RatingEntry, TrainingSession } from './types';

const p2 = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday to Sunday of the week containing `today`. */
export function weekDates(today = new Date()): string[] {
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
}

export interface DayTraining { date: string; minutes: number; rest: boolean }

export function weekTraining(sessions: TrainingSession[], today = new Date()): DayTraining[] {
  return weekDates(today).map((date) => {
    const day = sessions.filter((s) => s.deletedAt === undefined && s.date === date);
    return { date, minutes: day.reduce((n, s) => n + s.minutes, 0), rest: day.some((s) => s.type === 'rest') };
  });
}

/**
 * Consecutive days with a logged session or rest day, ending today.
 * If nothing is logged today yet, the streak still counts up to yesterday.
 */
export function streak(sessions: TrainingSession[], today = new Date()): number {
  const days = new Set(sessions.filter((s) => s.deletedAt === undefined).map((s) => s.date));
  let d = days.has(iso(today)) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(iso(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export interface DrillStat { category: string; made: number; attempts: number; pct: number; sessions: number; last: number | null }

/** Measured drill success, optionally from a date onwards. Most-practised first. */
export function drillStats(sessions: TrainingSession[], from?: string): DrillStat[] {
  const map = new Map<string, DrillStat & { latestDate: string }>();
  const chrono = [...sessions].filter((s) => s.deletedAt === undefined && (!from || s.date >= from))
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
  for (const s of chrono) {
    for (const d of s.drills) {
      const key = d.category.toLowerCase();
      const cur = map.get(key) ?? { category: d.category, made: 0, attempts: 0, pct: 0, sessions: 0, last: null, latestDate: '' };
      cur.made += d.made;
      cur.attempts += d.attempts;
      cur.sessions++;
      cur.last = Math.round((d.made / d.attempts) * 100);
      cur.latestDate = s.date;
      map.set(key, cur);
    }
  }
  return [...map.values()]
    .map(({ latestDate: _, ...x }) => ({ ...x, pct: Math.round((x.made / x.attempts) * 100) }))
    .sort((a, b) => b.attempts - a.attempts || a.category.localeCompare(b.category));
}

export interface GoalContext {
  today: Date;
  sessions: TrainingSession[];
  singles: RatingEntry[];
  doubles: RatingEntry[];
}

export interface GoalProgress { fraction: number; current: string; target: string; done: boolean }

export function goalProgress(g: Goal, ctx: GoalContext): GoalProgress {
  const clamp = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100) / 100;
  switch (g.kind) {
    case 'rating': {
      const hist = g.ratingKind === 'singles' ? ctx.singles : ctx.doubles;
      const start = hist[0]?.value;
      const cur = hist.at(-1)?.value;
      if (cur === undefined || start === undefined) return { fraction: 0, current: 'No rating yet', target: fmtRating(g.target), done: false };
      const done = cur >= g.target;
      const fraction = done ? 1 : g.target > start ? clamp((cur - start) / (g.target - start)) : 0;
      return { fraction, current: fmtRating(cur), target: fmtRating(g.target), done };
    }
    case 'weekly-hours': {
      const hours = weekTraining(ctx.sessions, ctx.today).reduce((n, d) => n + d.minutes, 0) / 60;
      return { fraction: clamp(hours / g.target), current: `${Math.round(hours * 10) / 10} h this week`, target: `${g.target} h`, done: hours >= g.target };
    }
    case 'drill-rate': {
      const from = iso(addDays(ctx.today, -30));
      const stat = drillStats(ctx.sessions, from).find((d) => d.category.toLowerCase() === (g.drillCategory ?? '').toLowerCase());
      if (!stat) return { fraction: 0, current: 'No attempts in 30 days', target: `${g.target}%`, done: false };
      return { fraction: clamp(stat.pct / g.target), current: `${stat.pct}% (${stat.made}/${stat.attempts}, 30 days)`, target: `${g.target}%`, done: stat.pct >= g.target };
    }
    case 'streak': {
      const n = streak(ctx.sessions, ctx.today);
      return { fraction: clamp(n / g.target), current: `${n}-day streak`, target: `${g.target} days`, done: n >= g.target };
    }
    case 'tournament':
      return { fraction: g.achieved ? 1 : 0, current: g.achieved ? 'Achieved' : 'Not yet', target: g.text ?? '', done: !!g.achieved };
  }
}

export function goalTitle(g: Goal): string {
  switch (g.kind) {
    case 'rating': return `Reach ${fmtRating(g.target)} ${g.ratingKind ?? 'doubles'} DUPR`;
    case 'weekly-hours': return `Train ${g.target} hours a week`;
    case 'drill-rate': return `${g.drillCategory} at ${g.target}%`;
    case 'streak': return `${g.target}-day training streak`;
    case 'tournament': return g.text || 'Tournament goal';
  }
}
