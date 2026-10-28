import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { PickleqDB } from './db';
import { activeMatches } from './matches';
import { ensureBuiltInClips } from './clips';

/** Live is on 0.6.0 (database version 3). Opening it with this version must keep every record. */
describe('upgrading a 0.6.0 database', () => {
  it('keeps matches, players, ratings, sessions and goals, and adds the new tables', async () => {
    const name = 'upgrade-from-v3';
    const old = new Dexie(name);
    old.version(1).stores({ matches: 'id, date, status, type, category, createdAt', players: 'id, &nameKey, lastUsedAt' });
    old.version(2).stores({ ratings: 'id, kind, date' });
    old.version(3).stores({ sessions: 'id, date, type', drillCategories: 'id, &nameKey', goals: 'id, kind' });
    await old.open();
    await old.table('matches').add({ id: 'm1', date: '2026-10-01', type: 'doubles', category: 'casual', format: { pointsTo: 11, bestOf: 1, scoring: 'sideout' }, participants: [{ name: 'Priya', role: 'partner' }], outcome: 'played', games: [{ you: 11, them: 8, momentum: 'neither' }], won: true, status: 'complete', backfilled: false, tags: { Serve: 'went-well' }, createdAt: 1, updatedAt: 1, history: [] });
    await old.table('players').add({ id: 'p1', name: 'Priya', nameKey: 'priya', lastUsedAt: 1 });
    await old.table('ratings').add({ id: 'r1', kind: 'doubles', value: 3.82, date: '2026-10-01', source: 'dupr-manual', createdAt: 1 });
    await old.table('sessions').add({ id: 's1', date: '2026-10-02', type: 'solo', minutes: 60, drills: [{ category: 'Dinks', made: 18, attempts: 25 }], createdAt: 1, updatedAt: 1 });
    await old.table('goals').add({ id: 'g1', kind: 'weekly-hours', target: 6, createdAt: 1 });
    old.close();

    const d = new PickleqDB(name);
    await d.open();
    expect(d.verno).toBe(6);
    expect((await activeMatches(d)).map((m) => m.id)).toEqual(['m1']);
    expect(await d.players.count()).toBe(1);
    expect((await d.ratings.get('r1'))?.value).toBe(3.82);
    expect((await d.sessions.get('s1'))?.drills[0]).toEqual({ category: 'Dinks', made: 18, attempts: 25 });
    expect(await d.goals.count()).toBe(1);
    expect(await d.tournaments.count()).toBe(0);
    expect(await d.conversations.count()).toBe(0);
    await ensureBuiltInClips(d);
    expect(await d.clips.count()).toBeGreaterThan(20);
    d.close();
  });
});
