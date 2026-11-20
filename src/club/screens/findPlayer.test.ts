import { describe, expect, it } from 'vitest';
import { matchesForPlayer } from './findPlayer';

const matches = [{ id: 'one', entryA: 'a', entryB: 'b' }, { id: 'two', entryA: 'c', entryB: 'a' }, { id: 'bye', entryA: 'c' }];
const names: Record<string, string> = { a: 'Mira Vale / Theo Reed', b: 'Nila Moss', c: 'Finn Brook' };
const nameOf = (id: string) => names[id] ?? '';

describe('matchesForPlayer', () => {
  it('returns all matches for an empty or whitespace query', () => {
    expect(matchesForPlayer(matches, '', nameOf)).toBe(matches);
    expect(matchesForPlayer(matches, '  ', nameOf)).toBe(matches);
  });
  it('matches partial names on either side, ignoring case and surrounding spaces', () => {
    expect(matchesForPlayer(matches, '  vAL  ', nameOf)).toEqual(matches.slice(0, 2));
    expect(matchesForPlayer(matches, 'MOSS', nameOf)).toEqual([matches[0]]);
    expect(matchesForPlayer(matches, 'brook', nameOf)).toEqual(matches.slice(1));
  });
  it('returns an empty list when no player matches, including undecided sides', () => {
    expect(matchesForPlayer(matches, 'unknown', nameOf)).toEqual([]);
    expect(matchesForPlayer([{ entryA: undefined, entryB: undefined }], 'mira', nameOf)).toEqual([]);
  });
  it('preserves fixture data and order', () => {
    const before = JSON.stringify(matches);
    expect(matchesForPlayer(matches, 'theo', nameOf)[0]).toBe(matches[0]);
    expect(JSON.stringify(matches)).toBe(before);
  });
});
