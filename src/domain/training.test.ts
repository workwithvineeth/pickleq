import { describe, expect, it } from 'vitest';
import { drillStats, goalProgress, goalTitle, streak, weekDates, weekTraining } from './training';
import type { Goal, RatingEntry, TrainingSession } from './types';

let seq = 0;
function s(date: string, over: Partial<TrainingSession> = {}): TrainingSession {
  seq++;
  return { id: `s${seq}`, date, type: 'solo', minutes: 60, drills: [], createdAt: seq, updatedAt: seq, ...over };
}
const today = new Date('2026-10-28T10:00:00'); // a Wednesday

describe('week and streak', () => {
  it('weeks run Monday to Sunday', () => {
    expect(weekDates(today)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
  it('adds up minutes per day this week and marks rest days', () => {
    const w = weekTraining([s('2026-10-26', { minutes: 45 }), s('2026-10-26', { minutes: 30 }), s('2026-10-27', { type: 'rest', minutes: 0 }), s('2026-10-20')], today);
    expect(w.map((d) => d.minutes)).toEqual([75, 0, 0, 0, 0, 0, 0]);
    expect(w[1].rest).toBe(true);
  });
  it('counts a streak including rest days, even before today is logged', () => {
    const list = [s('2026-10-25'), s('2026-10-26', { type: 'rest', minutes: 0 }), s('2026-10-27')];
    expect(streak(list, today)).toBe(3); // today not logged yet: counts to yesterday
    expect(streak([...list, s('2026-10-28')], today)).toBe(4);
    expect(streak([s('2026-10-25')], today)).toBe(0); // gap yesterday breaks it
  });
  it('ignores deleted sessions', () => {
    expect(streak([s('2026-10-27', { deletedAt: 1 })], today)).toBe(0);
  });
});

describe('drill stats', () => {
  const list = [
    s('2026-10-01', { drills: [{ category: 'Third-shot drops', made: 15, attempts: 25 }, { category: 'Serves', made: 27, attempts: 30 }] }),
    s('2026-10-10', { drills: [{ category: 'Third-shot drops', made: 18, attempts: 25 }] }),
  ];
  it('totals made and attempts per drill and keeps the latest session rate', () => {
    expect(drillStats(list)).toEqual([
      { category: 'Third-shot drops', made: 33, attempts: 50, pct: 66, sessions: 2, last: 72 },
      { category: 'Serves', made: 27, attempts: 30, pct: 90, sessions: 1, last: 90 },
    ]);
  });
  it('can start from a date', () => {
    expect(drillStats(list, '2026-10-05')).toEqual([{ category: 'Third-shot drops', made: 18, attempts: 25, pct: 72, sessions: 1, last: 72 }]);
  });
});

describe('goal progress', () => {
  const r = (kind: 'singles' | 'doubles', value: number, date: string): RatingEntry => ({ id: date + kind, kind, value, date, source: 'dupr-manual', createdAt: 0 });
  const ctx = {
    today,
    sessions: [s('2026-10-26', { minutes: 120 }), s('2026-10-27', { minutes: 150, drills: [{ category: 'Third-shot drops', made: 18, attempts: 25 }] })],
    singles: [], doubles: [r('doubles', 3.6, '2026-09-01'), r('doubles', 3.8, '2026-10-20')],
  };
  const goal = (g: Partial<Goal>): Goal => ({ id: 'g', kind: 'rating', target: 4, createdAt: 0, ...g });
  it('rating: progress from the first reading to the target', () => {
    expect(goalProgress(goal({ ratingKind: 'doubles', target: 4.0 }), ctx)).toMatchObject({ fraction: 0.5, current: '3.800', done: false });
    expect(goalTitle(goal({ ratingKind: 'doubles', target: 4.0 }))).toBe('Reach 4.000 doubles DUPR');
  });
  it('weekly hours, drill rate, streak and tournament goals', () => {
    expect(goalProgress(goal({ kind: 'weekly-hours', target: 6 }), ctx)).toMatchObject({ fraction: 0.75, current: '4.5 h this week' });
    expect(goalProgress(goal({ kind: 'drill-rate', target: 80, drillCategory: 'Third-shot drops' }), ctx)).toMatchObject({ fraction: 0.9, done: false });
    expect(goalProgress(goal({ kind: 'streak', target: 4 }), ctx)).toMatchObject({ fraction: 0.5, current: '2-day streak' });
    expect(goalProgress(goal({ kind: 'tournament', target: 0, text: 'Medal', achieved: true }), ctx)).toMatchObject({ fraction: 1, done: true });
  });
  it('handles a goal with no data yet', () => {
    expect(goalProgress(goal({ ratingKind: 'singles' }), ctx)).toMatchObject({ fraction: 0, current: 'No rating yet' });
  });
});

import { fmtRating } from './record';
describe('rating display', () => {
  it('shows DUPR to three decimals, rounded correctly', () => {
    expect(fmtRating(3.905)).toBe('3.905');
    expect(fmtRating(3.8)).toBe('3.800');
    expect(fmtRating(0.255)).toBe('0.255');
  });
});
