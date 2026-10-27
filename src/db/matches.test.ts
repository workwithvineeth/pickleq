import { beforeEach, describe, expect, it } from 'vitest';
import { recordSummary } from '../domain/record';
import { DEFAULT_FORMAT, type Game } from '../domain/types';
import { PickleqDB } from './db';
import { activeMatches, addMatch, moveToTrash, purgeOldTrash, restoreFromTrash, trashedMatches, updateMatch, type NewMatch } from './matches';

const DAY = 86_400_000;
let d: PickleqDB;
let n = 0;
beforeEach(async () => {
  d = new PickleqDB(`test-${++n}`);
  await d.open();
});

const g = (you: number, them: number): Game => ({ you, them, momentum: 'neither' });
function base(over: Partial<NewMatch> = {}): NewMatch {
  return {
    date: '2026-10-26', type: 'doubles', category: 'casual', format: DEFAULT_FORMAT,
    participants: [{ name: 'Priya', role: 'partner' }, { name: 'Rohan', role: 'opponent', rating: 3.9 }, { name: 'Kiran', role: 'opponent', strength: 'equal' }],
    outcome: 'played', games: [g(11, 8)], won: true, status: 'incomplete', backfilled: false, tags: {},
    ...over,
  };
}

describe('saving matches', () => {
  it('records a win and a loss and counts them separately for singles and doubles', async () => {
    await addMatch(base(), d);
    await addMatch(base({ type: 'singles', participants: [{ name: 'Arjun', role: 'opponent' }], games: [g(7, 11)], won: false }), d);
    await addMatch(base({ type: 'mixed', games: [g(11, 3)] }), d);
    const r = recordSummary(await activeMatches(d));
    expect(r.overall).toEqual({ wins: 2, losses: 1 });
    expect(r.singles).toEqual({ wins: 0, losses: 1 });
    expect(r.doubles).toEqual({ wins: 2, losses: 0 });
    expect(r.incomplete).toBe(3);
  });

  it('records a walkover in the win–loss record', async () => {
    await addMatch(base({ outcome: 'walkover', games: [], won: true }), d);
    expect(recordSummary(await activeMatches(d)).overall).toEqual({ wins: 1, losses: 0 });
  });

  it('remembers players by name, case-insensitively, with their latest rating', async () => {
    await addMatch(base(), d);
    await addMatch(base({ participants: [{ name: 'rohan', role: 'opponent', rating: 4.0 }] }), d);
    const players = await d.players.toArray();
    const rohan = players.filter((p) => p.nameKey === 'rohan');
    expect(rohan).toHaveLength(1);
    expect(rohan[0].lastRating).toBe(4.0);
  });
});

describe('editing', () => {
  it('corrects a score, flips the result and keeps a full edit history', async () => {
    const m = await addMatch(base(), d, 1000);
    const edited = await updateMatch(m.id, { games: [g(9, 11)], won: false }, d, 2000);
    expect(edited.won).toBe(false);
    expect(edited.history).toHaveLength(1);
    const fields = edited.history[0].changes.map((c) => c.field);
    expect(fields).toEqual(expect.arrayContaining(['Score', 'Result']));
    const score = edited.history[0].changes.find((c) => c.field === 'Score')!;
    expect(score).toMatchObject({ from: '11–8', to: '9–11' });
    expect(recordSummary(await activeMatches(d)).overall).toEqual({ wins: 0, losses: 1 });
  });

  it('adds no history entry when nothing changed', async () => {
    const m = await addMatch(base(), d);
    const same = await updateMatch(m.id, { notes: undefined }, d);
    expect(same.history).toHaveLength(0);
  });

  it('marks a match complete when details are added', async () => {
    const m = await addMatch(base(), d);
    const done = await updateMatch(m.id, { status: 'complete', energy: 4, tags: { Serve: 'went-well' } }, d);
    expect(done.status).toBe('complete');
    expect(recordSummary(await activeMatches(d)).incomplete).toBe(0);
  });
});

describe('Trash', () => {
  it('removes a deleted match from stats and brings it back on restore', async () => {
    const m = await addMatch(base(), d);
    await moveToTrash(m.id, d);
    expect(await activeMatches(d)).toHaveLength(0);
    expect(await trashedMatches(d)).toHaveLength(1);
    expect(recordSummary(await activeMatches(d)).overall.wins).toBe(0);
    await restoreFromTrash(m.id, d);
    expect(await activeMatches(d)).toHaveLength(1);
  });

  it('permanently removes only items older than 30 days', async () => {
    const now = 100 * DAY;
    const a = await addMatch(base(), d);
    const b = await addMatch(base(), d);
    await moveToTrash(a.id, d, now - 31 * DAY);
    await moveToTrash(b.id, d, now - 5 * DAY);
    expect(await purgeOldTrash(d, now)).toBe(1);
    expect((await trashedMatches(d)).map((m) => m.id)).toEqual([b.id]);
  });
});
