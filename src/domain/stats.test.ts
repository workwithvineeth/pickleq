import { describe, expect, it } from 'vitest';
import { byEnergy, filterMatches, form, headToHead, opponentStrength, partners, rollingWinPct, splits, summarize } from './stats';
import { DEFAULT_FORMAT, type Game, type Match, type Participant, type RatingEntry } from './types';

let seq = 0;
const g = (you: number, them: number, extra: Partial<Game> = {}): Game => ({ you, them, momentum: 'neither', ...extra });
function m(over: Partial<Match> & Pick<Match, 'date' | 'games' | 'won'>): Match {
  seq++;
  return {
    id: `m${seq}`, type: 'singles', category: 'casual', format: DEFAULT_FORMAT, participants: [], outcome: 'played',
    status: 'complete', backfilled: false, tags: {}, createdAt: seq, updatedAt: seq, history: [], ...over,
  };
}
const opp = (name: string, rating?: number, strength?: Participant['strength']): Participant => ({ name, role: 'opponent', rating, strength });
const r = (kind: 'singles' | 'doubles', value: number, date: string): RatingEntry => ({ id: `${kind}${date}`, kind, value, date, source: 'dupr-manual', createdAt: 0 });

// A small hand-checked season.
const season: Match[] = [
  m({ date: '2026-10-01', games: [g(11, 9, { momentum: 'came-back', fromYou: 4, fromThem: 8 })], won: true, participants: [opp('Arjun', 4.0)], energy: 4 }),
  m({ date: '2026-10-03', games: [g(8, 11, { momentum: 'lost-lead', fromYou: 7, fromThem: 3 })], won: false, participants: [opp('Arjun', 4.0)], energy: 2 }),
  m({ date: '2026-10-05', type: 'doubles', category: 'tournament', games: [g(11, 2, { momentum: 'dominated' }), g(11, 6)], won: true,
      format: { pointsTo: 11, bestOf: 3, scoring: 'sideout' }, participants: [{ name: 'Priya', role: 'partner' }, opp('Om', undefined, 'weaker'), opp('Ravi', undefined, 'weaker')], energy: 4 }),
  m({ date: '2026-10-07', type: 'mixed', games: [g(13, 11)], won: true, participants: [{ name: 'Priya', role: 'partner' }, opp('Kiran', 3.8), opp('Meera', 3.8)] }),
  m({ date: '2026-10-09', games: [g(5, 11)], won: false, participants: [opp('Sameer')], backfilled: true }),
];
const singles = [r('singles', 3.7, '2026-09-30')];
const doubles = [r('doubles', 3.8, '2026-09-30')];

describe('summarize', () => {
  const s = summarize(season);
  it('counts the record, games and points per game', () => {
    expect(s.record).toEqual({ wins: 3, losses: 2 });
    expect(s.games).toEqual({ wins: 4, losses: 2 });
    // points: 11+8+11+11+13+5 = 59 for, 9+11+2+6+11+11 = 50 against, over 6 games
    expect(s.pointsFor).toBe(9.8);
    expect(s.pointsAgainst).toBe(8.3);
  });
  it('counts close games (decided by 3 or fewer)', () => {
    // 11–9, 8–11, 13–11 are close; 11–2, 11–6, 5–11 are not
    expect(s.closeGames).toEqual({ wins: 2, losses: 1 });
  });
  it('counts momentum only where it was recorded', () => {
    expect(s.trackedGames).toBe(5); // the backfilled game is excluded
    expect(s.comebacks).toBe(1);
    expect(s.lostLeads).toBe(1);
    expect(s.dominated).toBe(1);
    expect(s.biggestComeback).toEqual({ from: '4–8', deficit: 4 });
    expect(s.biggestLostLead).toEqual({ from: '7–3', lead: 4 });
  });
  it('handles no matches', () => {
    expect(summarize([])).toMatchObject({ matches: 0, pointsFor: null, record: { wins: 0, losses: 0 } });
  });
});

describe('opponent strength', () => {
  it('uses the DUPR gap when both ratings are known', () => {
    expect(opponentStrength(season[0], 3.7)).toBe('stronger'); // 4.0 vs 3.7: gap 0.3
    expect(opponentStrength(season[3], 3.8)).toBe('equal'); // 3.8 vs 3.8
    expect(opponentStrength(m({ date: '2026-10-10', games: [], won: true, participants: [opp('X', 3.5)] }), 3.8)).toBe('weaker');
  });
  it('falls back to the tag you chose, and is unknown with neither', () => {
    expect(opponentStrength(season[2], 3.8)).toBe('weaker');
    expect(opponentStrength(season[4], 3.7)).toBeUndefined();
    expect(opponentStrength(season[0], undefined)).toBeUndefined();
  });
});

describe('splits', () => {
  const sp = splits(season, singles, doubles);
  it('splits by type and category, keeping singles and doubles separate', () => {
    expect(sp.byType).toEqual({ singles: { wins: 1, losses: 2 }, doubles: { wins: 1, losses: 0 }, mixed: { wins: 1, losses: 0 } });
    expect(sp.byCategory.tournament).toEqual({ wins: 1, losses: 0 });
    expect(sp.byCategory.casual).toEqual({ wins: 2, losses: 2 });
  });
  it('splits by opponent strength and counts unknowns', () => {
    expect(sp.byStrength).toEqual({ stronger: { wins: 1, losses: 1 }, equal: { wins: 1, losses: 0 }, weaker: { wins: 1, losses: 0 } });
    expect(sp.strengthUnknown).toBe(1);
  });
});

describe('energy, people and form', () => {
  it('groups by energy level, skipping matches without one', () => {
    const e = byEnergy(season);
    expect(e[1].record).toEqual({ wins: 0, losses: 1 }); // level 2
    expect(e[3].record).toEqual({ wins: 2, losses: 0 }); // level 4
    expect(e.reduce((n, x) => n + x.record.wins + x.record.losses, 0)).toBe(3);
  });
  it('builds head-to-head and partner records', () => {
    expect(headToHead(season)[0]).toEqual({ name: 'Arjun', record: { wins: 1, losses: 1 } });
    expect(partners(season)).toEqual([{ name: 'Priya', record: { wins: 2, losses: 0 } }]);
  });
  it('lists form newest first and filters by type and range', () => {
    const newest = filterMatches(season, { range: 'all', type: 'all' });
    expect(form(newest)).toEqual(['L', 'W', 'W', 'L', 'W']);
    expect(filterMatches(season, { range: 'all', type: 'singles' })).toHaveLength(3);
    expect(filterMatches(season, { range: 'all', type: 'doubles' })).toHaveLength(2);
    expect(filterMatches(season, { range: '30d', type: 'all' }, new Date('2026-11-04'))).toHaveLength(3);
    expect(filterMatches(season, { range: 'last10', type: 'all' })).toHaveLength(5);
  });
  it('computes rolling win % once enough matches exist', () => {
    const newest = filterMatches(season, { range: 'all', type: 'all' });
    expect(rollingWinPct(newest, 10, 3)).toEqual([
      { date: '2026-10-05', pct: 67, n: 3 },
      { date: '2026-10-07', pct: 75, n: 4 },
      { date: '2026-10-09', pct: 60, n: 5 },
    ]);
  });
});
