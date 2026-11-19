import { describe, expect, it } from 'vitest';
import { countStep, finishedHandOffs, flipOnChange, leadAccent, pointLabel, serveOf, settled, stepAll } from './motion';

describe('TV motion (team picks: count, pulse, wash)', () => {
  it('replays an animation each time the value changes, never on first sight', () => {
    const seen = new Map();
    const names: [string, string] = ['x0', 'x1'];
    expect(flipOnChange(seen, 'k', '3', names)).toBe('');
    expect(flipOnChange(seen, 'k', '3', names)).toBe('');
    const one = flipOnChange(seen, 'k', '4', names);
    expect(one).not.toBe('');
    expect(flipOnChange(seen, 'k', '4', names)).toBe(one); // unchanged: same class, no replay
    expect(flipOnChange(seen, 'k', '5', names)).not.toBe(one); // changed again: the other class restarts it
  });

  it('counts up one point at a time and jumps when the score goes down', () => {
    expect(countStep(3, 6)).toBe(4);
    expect(countStep(6, 6)).toBe(6);
    expect(countStep(9, 0)).toBe(0); // new game or undo
    let shown = stepAll({}, { m: { a: 2, b: 0 } }, false);
    expect(shown).toEqual({ m: { a: 2, b: 0 } }); // first sight: straight to the score
    const target = { m: { a: 5, b: 1 } };
    shown = stepAll(shown, target, false);
    expect(shown).toEqual({ m: { a: 3, b: 1 } });
    expect(settled(shown, target)).toBe(false);
    shown = stepAll(stepAll(shown, target, false), target, false);
    expect(settled(shown, target)).toBe(true);
    expect(stepAll({ m: { a: 0, b: 0 } }, target, true)).toEqual(target); // reduced motion: no counting
  });

  it('shows the serving side and the call for side-out scoring only', () => {
    expect(serveOf({ points: '', a: 0, b: 0, mode: 'sideout', serve: 'A', rallies: '' }, true, false)).toEqual({ side: 'A', call: '0-0-2' });
    expect(serveOf({ points: 'AB', a: 1, b: 1, mode: 'rally' }, true, false)).toBeNull();
    expect(serveOf({ points: '', a: 11, b: 3, mode: 'sideout', serve: 'A', rallies: '' }, true, true)).toBeNull();
  });

  it('labels game point and match point', () => {
    expect(pointLabel(10, 5, 11, false, 0, 0, 1)).toBe('Match point');
    expect(pointLabel(10, 5, 11, false, 0, 0, 2)).toBe('Game point');
    expect(pointLabel(9, 5, 11, false, 0, 0, 1)).toBe('');
    expect(pointLabel(10, 10, 11, false, 0, 0, 2)).toBe('');
    expect(pointLabel(11, 3, 11, false, 0, 0, 1)).toBe('');
    expect(pointLabel(10, 10, 11, true, 0, 0, 1)).toBe('Golden point');
    expect(pointLabel(10, 9, 11, true, 0, 0, 1)).toBe('Match point');
  });

  it('holds a finished match only when its court moves on to another match', () => {
    const done = (id: string) => id === 'old';
    expect(finishedHandOffs({}, [{ court: 1, id: 'new' }], done)).toEqual({}); // first sight
    expect(finishedHandOffs({ 1: 'old' }, [{ court: 1, id: 'new' }], done)).toEqual({ 1: 'old' });
    expect(finishedHandOffs({ 1: 'old' }, [{ court: 1, id: 'old' }], done)).toEqual({}); // same match
    expect(finishedHandOffs({ 1: 'moved' }, [{ court: 1, id: 'new' }], done)).toEqual({}); // not finished (moved court)
  });

  it('puts the ball accent on the leading score only', () => {
    expect(leadAccent(7, 5)).toEqual({ a: 'rqm-acc', b: '' });
    expect(leadAccent(3, 8)).toEqual({ a: '', b: 'rqm-acc' });
    expect(leadAccent(4, 4)).toEqual({ a: '', b: '' });
    expect(leadAccent('', '')).toEqual({ a: '', b: '' });
  });
});
