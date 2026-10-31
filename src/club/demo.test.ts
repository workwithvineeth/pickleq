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
    expect((await b.clubBundle(id)).tournaments.map((t) => t.name)).toContain('PQ Demo Open');
  });

  it('adds the sample events to a demo started before the events board existed', async () => {
    const first = memoryStorage();
    await new DemoBackend(first).start('Robot');
    const old = JSON.parse(first.getItem('pq-club-demo-v1') ?? '{}');
    const sampleIds = new Set<string>(old.tournaments.filter((t: { name: string }) => t.name.startsWith('PQ Demo ') && t.name !== 'PQ Demo Open').map((t: { id: string }) => t.id));
    old.tournaments = old.tournaments.filter((t: { id: string }) => !sampleIds.has(t.id));
    old.clubs = old.clubs.filter((c: { name: string }) => c.name !== 'PQ Demo Friends Club');
    delete old.eventsSeeded; delete old.registrations;
    const b = new DemoBackend(memoryStorage({ 'pq-club-demo-v1': JSON.stringify(old) }));
    expect((await b.publicEvents()).map((e) => e.name)).toContain('PQ Demo Night');
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
    expect((await b.clubBundle(clubs[0].club.id)).tournaments.map((t) => t.name).filter((n) => n.includes('Open'))).toEqual(['PQ Demo Open']);
  });
});

describe('Event PIN and club logo (same rules as the server)', () => {
  it('gives every scorer link the event PIN, and a new PIN reaches them all', async () => {
    const b = new DemoBackend(memoryStorage());
    const id = await b.start('Robot');
    const t = (await b.clubBundle(id)).tournaments.find((x) => x.name === 'PQ Demo Open')!;
    const pin = await b.eventPin(t.id);
    const links = await b.createScorerLinks(t.id, id, [1, 2, null]);
    expect(links.every((l) => l.pin === pin)).toBe(true);
    await b.updateScorerLink(links[0].id, { pin: '4826' });
    expect((await b.scorerLinks(t.id)).map((l) => l.pin)).toEqual(['4826', '4826', '4826']);
    expect(await b.eventPin(t.id)).toBe('4826');
    const fresh = await b.setEventPin(t.id);
    expect((await b.scorerLinks(t.id)).every((l) => l.pin === fresh)).toBe(true);
    await expect(b.setEventPin(t.id, '12')).rejects.toThrow('4 to 6 digits');
  });

  it('saves a club logo and shows it on the public link', async () => {
    const b = new DemoBackend(memoryStorage());
    const id = await b.start('Robot');
    const t = (await b.clubBundle(id)).tournaments.find((x) => x.name === 'PQ Demo Open')!;
    expect((await b.publicClubLogo(t.publicSlug))?.logoUrl).toMatch(/^data:image\/svg/); // the demo club's made-up logo
    const url = await b.setClubLogo(id, new Blob(['logo'], { type: 'image/jpeg' }));
    expect(url).toMatch(/^data:image\/jpeg/);
    expect((await b.clubBundle(id)).club.logoUrl).toBe(url);
    expect(await b.publicClubLogo(t.publicSlug)).toEqual({ club: 'PQ Demo Club', logoUrl: url });
  });
});
