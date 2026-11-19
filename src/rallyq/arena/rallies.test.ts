import { describe, expect, it } from 'vitest';
import { currentRun, level, ralliesOf, servingNow } from './rallies';

describe('rally records', () => {
  it('records every rally-scoring point without inventing a server', () => {
    const game = { rallies: 'ABBA', mode: 'rally', serve: 'B' as const, a: 2, b: 2 };
    expect(ralliesOf(game, true)).toEqual([
      { n: 1, winner: 'A', outcome: 'point', serverTeam: null, serverNo: null, before: '0-0', after: '1-0' },
      { n: 2, winner: 'B', outcome: 'point', serverTeam: null, serverNo: null, before: '1-0', after: '1-1' },
      { n: 3, winner: 'B', outcome: 'point', serverTeam: null, serverNo: null, before: '1-1', after: '1-2' },
      { n: 4, winner: 'A', outcome: 'point', serverTeam: null, serverNo: null, before: '1-2', after: '2-2' },
    ]);
    expect(servingNow(game, true)).toBeNull();
    expect(ralliesOf({ points: 'ABBA', a: 2, b: 2 }, true)).toEqual(ralliesOf(game, true));
    expect(ralliesOf({ points: 'ABBA', mode: 'sideout', a: 2, b: 2 }, false)).toEqual(ralliesOf(game, true));
  });

  it('replays doubles side-outs and second servers, retaining the server before each rally', () => {
    const game = { rallies: 'AABBAAA', points: 'AABA', mode: 'sideout', serve: 'A' as const, a: 3, b: 1 };
    expect(ralliesOf(game, true)).toEqual([
      { n: 1, winner: 'A', outcome: 'point', serverTeam: 'A', serverNo: 2, before: '0-0-2', after: '1-0-2' },
      { n: 2, winner: 'A', outcome: 'point', serverTeam: 'A', serverNo: 2, before: '1-0-2', after: '2-0-2' },
      { n: 3, winner: 'B', outcome: 'side_out', serverTeam: 'A', serverNo: 2, before: '2-0-2', after: '0-2-1' },
      { n: 4, winner: 'B', outcome: 'point', serverTeam: 'B', serverNo: 1, before: '0-2-1', after: '1-2-1' },
      { n: 5, winner: 'A', outcome: 'second_server', serverTeam: 'B', serverNo: 1, before: '1-2-1', after: '1-2-2' },
      { n: 6, winner: 'A', outcome: 'side_out', serverTeam: 'B', serverNo: 2, before: '1-2-2', after: '2-1-1' },
      { n: 7, winner: 'A', outcome: 'point', serverTeam: 'A', serverNo: 1, before: '2-1-1', after: '3-1-1' },
    ]);
    expect(servingNow(game, true)).toEqual({ team: 'A', no: 1, call: '3-1-1' });
    expect(currentRun(ralliesOf(game, true))).toEqual({ team: 'A', count: 1 });
    expect(servingNow({ rallies: 'A', a: 0, b: 0, serve: 'B' }, true)).toEqual({ team: 'A', no: 1, call: '0-0-1' });
  });

  it('replays singles without a second-server event and honours the first serving team', () => {
    const game = { rallies: 'BBAAB', mode: 'sideout', serve: 'B' as const, a: 1, b: 2 };
    expect(ralliesOf(game, false)).toEqual([
      { n: 1, winner: 'B', outcome: 'point', serverTeam: 'B', serverNo: 1, before: '0-0', after: '1-0' },
      { n: 2, winner: 'B', outcome: 'point', serverTeam: 'B', serverNo: 1, before: '1-0', after: '2-0' },
      { n: 3, winner: 'A', outcome: 'side_out', serverTeam: 'B', serverNo: 1, before: '2-0', after: '0-2' },
      { n: 4, winner: 'A', outcome: 'point', serverTeam: 'A', serverNo: 1, before: '0-2', after: '1-2' },
      { n: 5, winner: 'B', outcome: 'side_out', serverTeam: 'A', serverNo: 1, before: '1-2', after: '2-1' },
    ]);
    expect(servingNow(game, false)).toEqual({ team: 'B', no: 1, call: '2-1' });
    expect(currentRun(ralliesOf(game, false))).toBeNull();
  });

  it('handles empty and absent games, including an opening side-out with no scored points', () => {
    expect(ralliesOf(undefined, true)).toEqual([]);
    expect(ralliesOf({ points: '', a: 0, b: 0 }, true)).toEqual([]);
    expect(servingNow(undefined, true)).toBeNull();
    expect(servingNow({ points: '', a: 0, b: 0 }, true)).toBeNull();
    expect(currentRun([])).toBeNull();
    expect(level([])).toBe(false);
    const game = { rallies: '', mode: 'sideout', serve: 'B' as const, a: 0, b: 0 };
    expect(ralliesOf(game, true)).toEqual([]);
    expect(servingNow(game, true)).toEqual({ team: 'B', no: 2, call: '0-0-2' });
    expect(servingNow(game, false)).toEqual({ team: 'B', no: 1, call: '0-0' });
    expect(ralliesOf({ ...game, rallies: 'A' }, true)).toEqual([
      { n: 1, winner: 'A', outcome: 'side_out', serverTeam: 'B', serverNo: 2, before: '0-0-2', after: '0-0-1' },
    ]);
  });

  it('rebuilds a shorter history after undo, including undoing server changes', () => {
    const game = { rallies: 'BBAAA', mode: 'sideout', a: 1, b: 1 };
    const original = ralliesOf(game, true);
    const undone = { ...game, rallies: 'BBAA', a: 0 };
    expect(ralliesOf(undone, true)).toEqual(original.slice(0, -1));
    expect(servingNow(undone, true)).toEqual({ team: 'A', no: 1, call: '0-1-1' });
    const beforeSideOut = { ...undone, rallies: 'BBA' };
    expect(ralliesOf(beforeSideOut, true)).toEqual(original.slice(0, -2));
    expect(servingNow(beforeSideOut, true)).toEqual({ team: 'B', no: 2, call: '1-0-2' });
    expect(servingNow({ ...beforeSideOut, rallies: 'BB' }, true)).toEqual({ team: 'B', no: 1, call: '1-0-1' });
    expect(ralliesOf(game, true)).toEqual(original);
    const rallyGame = { points: 'BBBAAA', a: 3, b: 3 };
    const rallyUndo = { points: 'BBBAA', a: 2, b: 3 };
    expect(ralliesOf(rallyUndo, true)).toEqual(ralliesOf(rallyGame, true).slice(0, -1));
    expect(currentRun(ralliesOf(rallyUndo, true))).toEqual({ team: 'A', count: 2 });
    expect(level(ralliesOf(rallyUndo, true))).toBe(false);
  });

  it('does not invent rallies or serve data from missing, invalid or inconsistent history', () => {
    for (const game of [
      { a: 8, b: 5 },
      { points: 'AB', a: 8, b: 5 },
      { points: 'AX', a: 1, b: 0 },
      { rallies: 'AAAA', mode: 'rally', a: 1, b: 0 },
      { rallies: 'BBA', mode: 'sideout', a: 1, b: 1 },
      { rallies: 'BBX', mode: 'sideout', a: 0, b: 1 },
      { rallies: 'BBAAA', points: 'AB', mode: 'sideout', a: 1, b: 1 },
    ]) {
      expect(ralliesOf(game, true)).toEqual([]);
      expect(servingNow(game, true)).toBeNull();
    }
  });
});

describe('rally signals', () => {
  it('counts the current run by either team and stops at an opposing point', () => {
    expect(currentRun(ralliesOf({ points: 'BAAA', a: 3, b: 1 }, true))).toEqual({ team: 'A', count: 3 });
    expect(currentRun(ralliesOf({ points: 'ABBB', a: 1, b: 3 }, true))).toEqual({ team: 'B', count: 3 });
    expect(currentRun(ralliesOf({ points: 'BAAAB', a: 3, b: 2 }, true))).toEqual({ team: 'B', count: 1 });
    const sideOut = ralliesOf({ rallies: 'AAABBA', a: 3, b: 1 }, true);
    expect(currentRun(sideOut.slice(0, 3))).toEqual({ team: 'A', count: 3 });
    expect(currentRun(sideOut.slice(0, 4))).toBeNull();
    expect(currentRun(sideOut)).toBeNull();
  });

  it('signals a current tie only after a deficit of at least three, using points alone', () => {
    expect(level(ralliesOf({ points: 'BBBAAA', a: 3, b: 3 }, true))).toBe(true);
    expect(level(ralliesOf({ points: 'AAABBB', a: 3, b: 3 }, true))).toBe(true);
    expect(level(ralliesOf({ points: 'AABB', a: 2, b: 2 }, true))).toBe(false);
    expect(level(ralliesOf({ points: 'BBBAAAA', a: 4, b: 3 }, true))).toBe(false);
    expect(level(ralliesOf({ rallies: 'AAABBBB', a: 3, b: 3 }, true))).toBe(true);
    expect(level(ralliesOf({ rallies: 'BBBBAA', a: 0, b: 3 }, true))).toBe(false);
  });
});
