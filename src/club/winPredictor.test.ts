import { describe, expect, it } from 'vitest';
import { freshGameChance, gameChance, matchChance, MIN_RALLIES_UNRATED, rallyChance, winEstimate, type WinInput } from './winPredictor';

const base: WinInput = { ratingsA: [4.3, 4.22], ratingsB: [4.1, 4.0], ralliesA: 0, ralliesB: 0, gamesA: 0, gamesB: 0, pointsA: 0, pointsB: 0, pointsTo: 11, bestOf: 3 };

describe('win predictor', () => {
  it('turns a DUPR gap into a rally chance and lets the rallies move it', () => {
    expect(rallyChance(4.5, 4.0, 0, 0)).toBeCloseTo(0.5437, 3);
    expect(rallyChance(undefined, 4.0, 0, 0)).toBe(0.5);
    // 40 prior rallies: winning 30 of 40 moves an even match to 0.625.
    expect(rallyChance(4, 4, 30, 40)).toBeCloseTo(0.625, 6);
  });
  it('is fair at even strength and exact for side-out games', () => {
    expect(freshGameChance(0.5)).toBeCloseTo(0.5, 6);
    expect(gameChance(0.5, 10, 0, 'A1')).toBeGreaterThan(0.95);
    expect(gameChance(0.5, 11, 9, 'B1')).toBe(1);
    expect(gameChance(0.5, 10, 12, 'A1')).toBe(0);
    // Win by 2: 12–12 behaves like 10–10.
    expect(gameChance(0.55, 12, 12, 'A1')).toBeCloseTo(gameChance(0.55, 10, 10, 'A1'), 6);
    // A small rally edge becomes a bigger game edge.
    expect(freshGameChance(0.5437)).toBeGreaterThan(0.65);
  });
  it('plays out best of 3', () => {
    expect(matchChance(0.5, 0.5, 0, 0, 3)).toBeCloseTo(0.5, 6);
    expect(matchChance(0.5, 0.5, 1, 0, 3)).toBeCloseTo(0.75, 6);
    expect(matchChance(0.9, 0.5, 2, 0, 3)).toBe(1);
  });
  it('says "from DUPR" before the match and never shows 0 or 100 while it is on', () => {
    const pre = winEstimate(base)!;
    expect(pre.basis).toBe('dupr');
    expect(pre.a).toBeGreaterThan(55);
    expect(pre.a + pre.b).toBe(100);
    const late = winEstimate({ ...base, ralliesA: 30, ralliesB: 5, gamesA: 1, pointsA: 10, pointsB: 1 })!;
    expect(late.basis).toBe('dupr+rallies');
    expect(late.a).toBe(99);
  });
  it('waits for 10 rallies when a team is unrated', () => {
    const unrated = { ...base, ratingsB: [4.0, undefined] };
    expect(winEstimate({ ...unrated, ralliesA: 5, ralliesB: 4 })).toBeNull();
    const e = winEstimate({ ...unrated, ralliesA: 6, ralliesB: MIN_RALLIES_UNRATED - 6, pointsA: 6, pointsB: 4 })!;
    expect(e.basis).toBe('rallies');
  });
});

import { NO_WIN_BAR, winBarFrom } from './winBar';
describe('win bar words', () => {
  it('names the leader first-name style, says estimate, and hides when there is nothing to show', () => {
    const w = winBarFrom({ a: 72, b: 28, basis: 'dupr' }, 'Asha Rao / Lata Iyer', 'Gita Khan / Rekha Patel');
    expect(w).toMatchObject({ show: true, label: 'Win chance · estimate', a: 'Asha & Lata 72%', b: 'Gita & Rekha 28%', note: 'Before the match: from DUPR', clsA: 'wp-lead', clsB: 'wp-other' });
    expect(winBarFrom(null, 'A', 'B')).toBe(NO_WIN_BAR);
    expect(winBarFrom({ a: 30, b: 70, basis: 'rallies' }, 'A', 'B').clsB).toBe('wp-lead');
  });
});
