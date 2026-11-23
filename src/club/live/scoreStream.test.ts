import { describe, expect, it } from 'vitest';
import type { PublicTournament } from '../backend';
import { applyLiveMessage, readLiveScoreMessage, type LiveScoreMessage } from './scoreStream';

const match = { id: 'm', divisionId: 'd', stage: 'pool', pool: 1, court: 1, slot: 3, entryA: 'e1', entryB: 'e2', status: 'live', games: [] } as const;
const data: PublicTournament = {
  name: 'Sample Open', club: 'Cedar', startDate: '2026-11-24', startTime: '08:00', slotMinutes: 20, status: 'live',
  divisions: [], entries: [], matches: [{ ...match, games: [] }, { ...match, id: 'other', games: [] }],
};
const message: LiveScoreMessage = {
  id: 'm', status: 'done', winner: 'A', court: 2, slot: 0, entryA: 'e3', games: [{ a: 11, b: 8, points: 'AB', rallies: 'AB', serve: 'A', mode: 'sideout' }], at: 1,
};

describe('live score messages', () => {
  it('updates the public match fields and keeps the rest of the draw', () => {
    const next = applyLiveMessage(data, message);
    expect(next.matches[0]).toEqual({ ...match, court: 2, slot: 0, entryA: 'e3', entryB: undefined, status: 'done', winner: 'A',
      games: [{ ...message.games[0], points: '' }] });
    expect(next.matches[1]).toBe(data.matches[1]);
    expect(next.entries).toBe(data.entries);
    expect(next.divisions).toBe(data.divisions);
    expect(data.matches[0].games).toEqual([]);
  });

  it('keeps the same tree for a match missing from the draw', () => {
    expect(applyLiveMessage(data, { ...message, id: 'missing' })).toBe(data);
  });

  it('normalises the public payload and ignores malformed messages', () => {
    const wire = { ...message, court: null, winner: null, games: [{ a: 3, b: 2, rallies: '', mode: 'rally' }] };
    expect(readLiveScoreMessage(wire)).toEqual({ ...message, court: undefined, winner: undefined, entryB: undefined,
      games: [{ a: 3, b: 2, points: '', mode: 'rally' }] });
    for (const bad of [null, {}, { ...wire, status: 'final' }, { ...wire, at: '1' }, { ...wire, court: '2' },
      { ...wire, winner: 'C' }, { ...wire, entryA: 1 }, { ...wire, games: [{ a: '3', b: 2 }] },
      { ...wire, games: [{ a: 3, b: 2, rallies: 'AX' }] }]) expect(readLiveScoreMessage(bad)).toBeNull();
  });
});
