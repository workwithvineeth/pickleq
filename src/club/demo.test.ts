import { describe, expect, it } from 'vitest';
import { DemoBackend } from './demo';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, v); },
  };
}

describe('Demo club name', () => {
  it('uses a made-up name', async () => {
    const b = new DemoBackend(memoryStorage());
    const id = await b.start('Robot');
    const clubs = await b.myClubs();
    expect(clubs.map((c) => c.club.name)).toEqual(['PQ Demo Club']);
    expect((await b.clubBundle(id)).tournaments[0].name).toBe('PQ Demo Open');
  });

  it('renames a demo saved under the old name, without making a second club', async () => {
    const first = memoryStorage();
    const old = new DemoBackend(first);
    await old.start('Robot');
    const raw = (first.getItem('pq-club-demo-v1') ?? '').replaceAll('PQ Demo Open', 'Pickleball Central Open').replaceAll('PQ Demo Club', 'Pickleball Central');
    const b = new DemoBackend(memoryStorage({ 'pq-club-demo-v1': raw }));
    await b.start('Robot');
    const clubs = await b.myClubs();
    expect(clubs.map((c) => c.club.name)).toEqual(['PQ Demo Club']);
    expect((await b.clubBundle(clubs[0].club.id)).tournaments.map((t) => t.name)).toEqual(['PQ Demo Open']);
  });
});
