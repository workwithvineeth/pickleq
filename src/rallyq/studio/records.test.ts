import { describe, expect, it } from 'vitest';
import type { OfficialMatch } from '../../club/playerStudio';
import { replaySideOut } from '../../club/domain/sideout';
import { matchEvidence, studioMatchesOf, studioRecord } from './records';

function match(overrides: Partial<OfficialMatch> = {}): OfficialMatch {
  return {
    id: 'test', tournamentId: 'sample', tournament: 'Sample Cup', club: 'Sample Club',
    kind: 'doubles', stage: 'final', playedOn: '2026-11-21', winner: 'A', mySide: 'A', me: 'a',
    sideA: [{ id: 'a', name: 'Aster Sample' }], sideB: [{ id: 'b', name: 'Cedar Sample' }],
    format: { pointsTo: 11, scoring: 'rally' }, games: [{ a: 11, b: 8, points: 'AAABBBBBBBAAAAABAAA' }],
    ...overrides,
  };
}

describe('referee-scored studio records', () => {
  it('calculates rally streak, comeback score and the closing game point', () => {
    expect(studioRecord([match()])).toMatchObject({
      bestRun: 5, comeback: { deficit: 4, from: '3–7', to: '11–8' },
      gamePoints: 1, closed: 1, finish: 'Champion',
    });
  });

  it('counts side-outs as won rallies and does not count a return as a closing opportunity', () => {
    const history = 'AAAAAAAAAABAABAA';
    const game = replaySideOut(history, 'A', true);
    const result = matchEvidence(match({ games: [{ ...game, rallies: history, serve: 'A', mode: 'sideout' }] }));
    expect(result.bestRun).toBe(10);
    expect(result.gamePoints).toBeGreaterThan(0);
    expect(result.closed).toBe(1);
  });

  it('counts a lost game-point rally and a converted one in a golden game', () => {
    const result = matchEvidence(match({
      format: { pointsTo: 11, golden: true, scoring: 'rally' },
      games: [{ a: 11, b: 10, points: 'AB'.repeat(10) + 'A' }],
    }));
    expect(result.gamePoints).toBe(2);
    expect(result.closed).toBe(1);
  });

  it('leaves score-only games out of rally metrics', () => {
    expect(matchEvidence(match({ games: [{ a: 11, b: 8 }] }))).toMatchObject({
      bestRun: 0, gamePoints: 0, closed: 0, trailed: false,
    });
  });

  it('calculates separate records and newest-first form for singles and doubles', () => {
    const doubles = match();
    const singles = match({ id: 'singles', kind: 'singles', winner: 'B' });
    const legacy = match({ id: 'legacy-singles', kind: undefined, playedOn: '2026-11-22' });
    expect(studioMatchesOf([doubles, singles, legacy], 'singles').map(m => m.id)).toEqual(['legacy-singles', 'singles']);
    expect(studioRecord(studioMatchesOf([doubles, singles, legacy], 'singles')).rate).toBe(50);
    expect(studioRecord(studioMatchesOf([doubles, singles, legacy], 'doubles'))).toMatchObject({ played: 1, rate: 100 });
  });
});
