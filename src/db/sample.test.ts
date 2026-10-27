import { describe, expect, it } from 'vitest';
import { checkMatch, checkMomentum } from '../domain/scoring';
import { sampleMatches, sampleRatings } from './sample';

describe('Preview sample data', () => {
  const set = sampleMatches(new Date('2026-10-28T12:00:00'));
  it('has 24 matches across all types and categories', () => {
    expect(set).toHaveLength(24);
    for (const t of ['singles', 'doubles', 'mixed']) expect(set.some((m) => m.type === t)).toBe(true);
    for (const c of ['casual', 'practice', 'tournament']) expect(set.some((m) => m.category === c)).toBe(true);
  });
  it('only contains valid scores, results and momentum', () => {
    for (const m of set) {
      const c = checkMatch(m.format, 'played', m.games, null);
      expect(c.ok, JSON.stringify(m.games)).toBe(true);
      expect(c.won).toBe(m.won);
      for (const g of m.games) expect(checkMomentum(g).ok, JSON.stringify(g)).toBe(true);
    }
  });
  it('mixes wins and losses, comebacks and lost leads', () => {
    const wins = set.filter((m) => m.won).length;
    expect(wins).toBeGreaterThan(8);
    expect(wins).toBeLessThan(22);
    const games = set.flatMap((m) => m.games);
    expect(games.some((g) => g.momentum === 'came-back')).toBe(true);
    expect(games.some((g) => g.momentum === 'lost-lead')).toBe(true);
    expect(games.some((g) => g.momentum === 'dominated')).toBe(true);
  });
  it('includes rating history for singles and doubles', () => {
    const r = sampleRatings(new Date('2026-10-28T12:00:00'));
    expect(r.filter((x) => x.kind === 'singles')).toHaveLength(10);
    expect(r.filter((x) => x.kind === 'doubles').at(-1)?.value).toBe(3.82);
  });
});
