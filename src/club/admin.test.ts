import { describe, expect, it } from 'vitest';
import { trend, weekStart, weeklyCounts } from './adminStats';
import { DemoBackend } from './demo';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, v); },
  };
}

describe('Admin dashboard numbers', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // Sunday → the Monday before
    expect(weekStart('2026-10-26')).toBe('2026-10-26'); // Monday stays
    expect(weekStart('2026-10-31T23:00:00.000Z')).toBe('2026-10-26');
  });

  it('counts matches in each of the last 8 weeks, oldest first, ignoring older ones', () => {
    const w = weeklyCounts(['2026-10-27', '2026-10-30', '2026-10-20', '2026-08-01'], '2026-10-31');
    expect(w).toHaveLength(8);
    expect(w[7]).toEqual({ week: '2026-10-26', matches: 2 });
    expect(w[6]).toEqual({ week: '2026-10-19', matches: 1 });
    expect(w[0].week).toBe('2026-09-07');
    expect(w.reduce((a, x) => a + x.matches, 0)).toBe(3);
  });

  it('says how this week compares with last week', () => {
    expect(trend([{ matches: 3 }, { matches: 5 }])).toBe('up 2 on last week');
    expect(trend([{ matches: 5 }, { matches: 1 }])).toBe('down 4 on last week');
    expect(trend([{ matches: 2 }, { matches: 2 }])).toBe('same as last week');
  });
});

describe('Admin dashboard in the demo (same rules as the server)', () => {
  it('needs you signed in', async () => {
    const b = new DemoBackend(memoryStorage());
    await expect(b.adminOverview()).rejects.toThrow('Sign in first');
    await expect(b.adminTournaments()).rejects.toThrow('Sign in first');
  });

  it('shows the overview, clubs and one club read-only', async () => {
    const b = new DemoBackend(memoryStorage());
    const id = await b.start('Robot');
    const o = await b.adminOverview();
    expect(o.weeks).toHaveLength(8);
    expect(o.finished).toBeGreaterThanOrEqual(1);
    expect(o.toReview).toBeGreaterThanOrEqual(1);
    expect(o.clubs).toBeGreaterThanOrEqual(2);
    const clubs = await b.adminClubs();
    const mine = clubs.find((c) => c.id === id)!;
    expect(mine.owners).toEqual(['demo (on this phone)']);
    expect(mine.tournaments).toBeGreaterThanOrEqual(1);
    const one = await b.adminClub(id);
    expect(one.people[0].role).toBe('owner');
    expect(one.tournaments.map((t) => t.name)).toContain('PQ Demo Open');
  });

  it('verifies a club and reopens a finished tournament', async () => {
    const b = new DemoBackend(memoryStorage());
    await b.start('Robot');
    const newClub = (await b.adminClubs()).find((c) => !c.verified)!;
    await b.setClubVerified(newClub.id, true);
    expect((await b.adminClubs()).find((c) => c.id === newClub.id)?.verified).toBe(true);
    const done = (await b.adminTournaments()).find((t) => t.name === 'PQ Demo Diwali Doubles')!;
    expect(done.status).toBe('done');
    expect(done.matchesDone).toBeGreaterThan(0);
    await b.adminSetTournamentStatus(done.id, 'live');
    expect((await b.adminTournaments()).find((t) => t.id === done.id)?.status).toBe('live');
    await b.adminSetTournamentStatus(done.id, 'done');
    expect((await b.adminTournaments()).find((t) => t.id === done.id)?.status).toBe('done');
  });

  it('a new club must be approved before it hosts; rejection needs a reason', async () => {
    const b = new DemoBackend(memoryStorage());
    await b.start('Robot');
    const id = await b.createClub('Smash Yard', 'Pune', 'Robot');
    let c = (await b.adminClubs()).find((x) => x.id === id)!;
    expect(c.hosting).toBe('pending');
    await expect(b.requestHosting(id, '12345', '')).rejects.toThrow('Add a phone number PaddleQ can call');
    await b.requestHosting(id, '+91 98765 43210', 'Two courts in Baner');
    c = (await b.adminClubs()).find((x) => x.id === id)!;
    expect(c).toMatchObject({ hosting: 'pending', hostingPhone: '+91 98765 43210', hostingNote: 'Two courts in Baner' });
    await expect(b.setClubHosting(id, false, '')).rejects.toThrow('Give the organiser a reason');
    await b.setClubHosting(id, false, 'Add your venue');
    expect((await b.clubBundle(id)).club).toMatchObject({ hosting: 'rejected', hostingReason: 'Add your venue' });
    await b.requestHosting(id, '9876543210', 'Venue: Baner Courts');
    expect((await b.clubBundle(id)).club.hosting).toBe('pending');
    await b.setClubHosting(id, true);
    expect((await b.clubBundle(id)).club.hosting).toBe('approved');
    await expect(b.requestHosting(id, '9876543210', '')).rejects.toThrow('already host');
  });

  it('the demo shows the approval workflow: a club waiting with phone and note, and every club has a logo', async () => {
    const b = new DemoBackend(memoryStorage());
    await b.start('Robot');
    const clubs = await b.adminClubs();
    const yard = clubs.find((c) => c.name === 'PQ Demo Courtyard Club')!;
    expect(yard).toMatchObject({ hosting: 'pending', hostingPhone: '+91 9000044444' });
    expect(clubs.every((c) => (c.logoUrl ?? '').startsWith('data:image/svg'))).toBe(true);
  });

  it('never removes the last admin', async () => {
    const b = new DemoBackend(memoryStorage());
    await b.start('Robot');
    await expect(b.removePlatformAdmin('someone@example.com')).rejects.toThrow('That email isn’t an admin');
    await expect(b.removePlatformAdmin('demo (on this phone)')).rejects.toThrow('You can’t remove the last admin');
  });
});
