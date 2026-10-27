import { describe, expect, it } from 'vitest';
import { checkGame, checkMatch, checkMomentum, gamesNeeded, scoreLine } from './scoring';
import { DEFAULT_FORMAT, type Format, type Game } from './types';

const to11 = DEFAULT_FORMAT;
const to15: Format = { pointsTo: 15, bestOf: 1, scoring: 'sideout' };
const rally21: Format = { pointsTo: 21, bestOf: 1, scoring: 'rally' };
const bo3: Format = { pointsTo: 11, bestOf: 3, scoring: 'sideout' };
const g = (you: number | null, them: number | null, extra: Partial<Game> = {}): Game => ({ you, them, momentum: 'neither', ...extra });

describe('checkGame', () => {
  it.each([
    [11, 8], [8, 11], [11, 0], [11, 9], [12, 10], [17, 15],
  ])('accepts a valid game to 11: %i–%i', (y, t) => expect(checkGame(to11, y, t).ok).toBe(true));

  it.each([
    [11, 10, 'win by 2'], [10, 8, 'at least 11'], [9, 9, 'level'], [13, 10, 'exactly 2'], [12, 9, 'exactly 2'],
  ])('rejects %i–%i (%s)', (y, t, why) => {
    const r = checkGame(to11, y, t);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(why);
  });

  it('applies the target for games to 15 and rally to 21', () => {
    expect(checkGame(to15, 15, 13).ok).toBe(true);
    expect(checkGame(to15, 11, 5).ok).toBe(false);
    expect(checkGame(rally21, 21, 19).ok).toBe(true);
    expect(checkGame(rally21, 23, 21).ok).toBe(true);
    expect(checkGame(rally21, 20, 10).ok).toBe(false);
  });

  it('needs both scores', () => {
    expect(checkGame(to11, 11, null).ok).toBe(false);
  });
});

describe('checkMomentum', () => {
  it('accepts a real comeback in a won game', () => {
    expect(checkMomentum(g(11, 9, { momentum: 'came-back', fromYou: 4, fromThem: 8 })).ok).toBe(true);
  });
  it('rejects a comeback in a lost game', () => {
    expect(checkMomentum(g(9, 11, { momentum: 'came-back', fromYou: 4, fromThem: 8 })).ok).toBe(false);
  });
  it('rejects a comeback when you were not behind', () => {
    expect(checkMomentum(g(11, 9, { momentum: 'came-back', fromYou: 6, fromThem: 4 })).ok).toBe(false);
  });
  it('accepts a lost lead in a lost game and rejects one in a won game', () => {
    expect(checkMomentum(g(9, 11, { momentum: 'lost-lead', fromYou: 8, fromThem: 3 })).ok).toBe(true);
    expect(checkMomentum(g(11, 9, { momentum: 'lost-lead', fromYou: 8, fromThem: 3 })).ok).toBe(false);
  });
  it('rejects a “from” score above the final score', () => {
    expect(checkMomentum(g(11, 9, { momentum: 'came-back', fromYou: 4, fromThem: 10 })).ok).toBe(false);
  });
  it('allows “dominated” only for wins', () => {
    expect(checkMomentum(g(11, 2, { momentum: 'dominated' })).ok).toBe(true);
    expect(checkMomentum(g(2, 11, { momentum: 'dominated' })).ok).toBe(false);
  });
});

describe('checkMatch', () => {
  it('records a win and a loss for a single game', () => {
    expect(checkMatch(to11, 'played', [g(11, 8)], null)).toMatchObject({ ok: true, won: true });
    expect(checkMatch(to11, 'played', [g(8, 11)], null)).toMatchObject({ ok: true, won: false });
  });
  it('handles best of 3: 2–0 needs two games, 1–1 needs a third', () => {
    expect(gamesNeeded(bo3, [g(11, 5), g(11, 7)])).toBe(2);
    expect(gamesNeeded(bo3, [g(11, 5), g(7, 11)])).toBe(3);
    expect(checkMatch(bo3, 'played', [g(11, 5), g(11, 7)], null)).toMatchObject({ ok: true, won: true });
    expect(checkMatch(bo3, 'played', [g(11, 5), g(7, 11)], null).ok).toBe(false);
    expect(checkMatch(bo3, 'played', [g(11, 5), g(7, 11), g(9, 11)], null)).toMatchObject({ ok: true, won: false });
  });
  it('names the game with the problem', () => {
    const r = checkMatch(bo3, 'played', [g(11, 5), g(11, 10)], null);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/^Game 2:/);
  });
  it('records a walkover with the winner chosen', () => {
    expect(checkMatch(to11, 'walkover', [], true)).toMatchObject({ ok: true, won: true });
    expect(checkMatch(to11, 'walkover', [], null).ok).toBe(false);
  });
  it('records a retirement with partial scores', () => {
    expect(checkMatch(to11, 'retired', [g(6, 4)], true)).toMatchObject({ ok: true, won: true });
  });
});

describe('scoreLine', () => {
  it('describes each kind of result', () => {
    expect(scoreLine({ outcome: 'played', games: [g(11, 5), g(7, 11), g(11, 9)] })).toBe('11–5 · 7–11 · 11–9');
    expect(scoreLine({ outcome: 'walkover', games: [] })).toBe('Walkover');
    expect(scoreLine({ outcome: 'retired', games: [g(6, 4)] })).toBe('6–4 (retired)');
  });
});
