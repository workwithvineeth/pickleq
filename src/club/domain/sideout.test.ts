import { describe, expect, it } from 'vitest';
import { replayRally, replaySideOut } from './sideout';

describe('side-out scoring', () => {
  it('starts at 0-0-2 and only the serving side scores', () => {
    expect(replaySideOut('', 'A', true)).toMatchObject({ a: 0, b: 0, serving: 'A', server: 2, call: '0-0-2' });
    // A serves and wins twice: 2-0-2.
    expect(replaySideOut('AA', 'A', true)).toMatchObject({ a: 2, b: 0, points: 'AA', call: '2-0-2' });
    // A loses the first rally at 0-0-2: side out straight away (only one server at the start).
    expect(replaySideOut('B', 'A', true)).toMatchObject({ a: 0, b: 0, points: '', serving: 'B', server: 1, call: '0-0-1' });
  });
  it('second server, then side out', () => {
    // B serves (after the opening side out), wins one, loses one (2nd server), loses again (side out to A, server 1).
    const s = replaySideOut('BBAA', 'A', true);
    expect(s).toMatchObject({ a: 0, b: 1, points: 'B', serving: 'A', server: 1, call: '0-1-1' });
    expect(replaySideOut('BBAAA', 'A', true)).toMatchObject({ a: 1, b: 1, call: '1-1-1' });
  });
  it('singles: a lost serve is a side out', () => {
    expect(replaySideOut('AAB', 'A', false)).toMatchObject({ a: 2, b: 0, serving: 'B', call: '0-2' });
    expect(replaySideOut('AABA', 'A', false)).toMatchObject({ a: 2, b: 0, serving: 'A', call: '2-0' });
  });
  it('rally scoring counts every rally', () => {
    expect(replayRally('ABBA')).toEqual({ a: 2, b: 2, points: 'ABBA' });
  });
});
