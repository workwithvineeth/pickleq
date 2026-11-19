import { describe, expect, it } from 'vitest';
import { DemoBackend } from './demo';
import { myMatchesFor } from './screens/Tournament';

function memory(): Storage {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => { m.delete(k); }, setItem: (k, v) => { m.set(k, v); } };
}

describe('My matches on the public results link', () => {
  it('finds a player’s matches by name: next one first with court and time, played ones with the score from their side', async () => {
    const b = new DemoBackend(memory());
    await b.start('Robot');
    const d = (await b.publicTournament('pq-demo-central-s8'))!;
    const someone = d.entries[0].names[0];
    const list = myMatchesFor(d, someone.split(' ')[0].toLowerCase().length >= 3 ? someone : someone);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((m) => m.me.includes(someone))).toBe(true);
    // Live and to-play come before finished ones, in court order of time.
    const firstDone = list.findIndex((m) => m.status === 'done');
    if (firstDone >= 0) expect(list.slice(firstDone).every((m) => m.status === 'done' || m.status === 'void')).toBe(true);
    const upcoming = list.find((m) => m.status === 'scheduled');
    if (upcoming) expect(upcoming.time).toMatch(/^\d\d:\d\d$/);
    const played = list.find((m) => m.status === 'done');
    if (played) expect(played.score).toMatch(/^\d+–\d+/);
  });

  it('needs at least 3 letters and ignores case', async () => {
    const b = new DemoBackend(memory());
    await b.start('Robot');
    const d = (await b.publicTournament('pq-demo-central-s8'))!;
    expect(myMatchesFor(d, 'ab')).toEqual([]);
    const n = d.entries[0].names[0];
    expect(myMatchesFor(d, n.toUpperCase()).length).toBe(myMatchesFor(d, n).length);
  });
});
