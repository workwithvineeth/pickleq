import { describe, expect, it } from 'vitest';
import { DemoBackend } from './demo';
import { buildSampleEvents, SAMPLE_EVENTS_VERSION } from './domain/sampleEvents';
import { samplePoster, shrinkImage } from './poster';

function memory(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return { get length() { return m.size; }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => { m.delete(k); }, setItem: (k, v) => { m.set(k, v); } };
}

describe('Posters', () => {
  it('sample posters are pictures with the event’s details, escaped, marked as made up', () => {
    const url = samplePoster({ title: 'Night <Cup> & More', date: 'Sat 1 Nov · 18:30', place: 'Demo Courts', tag: 'Test', bg: '#000', ink: '#fff', accent: '#f00', motif: 'ball' });
    expect(url.startsWith('data:image/svg+xml')).toBe(true);
    const svg = decodeURIComponent(url.split(',')[1]);
    expect(svg).toContain('Night &lt;Cup&gt; &amp;');
    expect(svg).toContain('Sample poster · made-up event');
    expect(svg).not.toContain('<Cup>');
  });

  it('only pictures can be posters', async () => {
    await expect(shrinkImage(new Blob(['x'], { type: 'application/pdf' }))).rejects.toThrow('Choose a photo or picture');
  });

  it('every sample event has its own poster; finished events have played results', () => {
    let n = 0;
    const id = () => `id-${++n}`;
    const players = Array.from({ length: 24 }, (_, i) => ({ id: `p${i}`, clubId: 'c', name: `Player ${String(i).padStart(2, '0')}`, duprSingles: 3 + i / 20, duprDoubles: 3 + i / 25, share: {}, sample: true }));
    const ev = buildSampleEvents('c', id, players, new Date('2026-10-29T10:00:00'));
    const posters = ev.tournaments.map((t) => t.posterUrl);
    expect(posters.every((p) => p?.startsWith('data:image/svg+xml'))).toBe(true);
    expect(new Set(posters).size).toBe(ev.tournaments.length);
    const done = ev.tournaments.filter((t) => t.status === 'done');
    expect(done.map((t) => t.name)).toEqual(['PQ Demo Diwali Doubles', 'PQ Demo Monsoon Singles']);
    const doneIds = new Set(done.map((t) => t.id));
    const finished = ev.matches.filter((m) => doneIds.has(m.tournamentId ?? ''));
    expect(finished.length).toBe(30); // 6 teams and 6 players, round robin: 15 matches each
    expect(finished.every((m) => m.status === 'done' && m.winner && m.games.length && m.court)).toBe(true);
    // Season 8 is live: singles part-way through the pools, doubles not started and about two hours away.
    const s8 = ev.tournaments.find((t) => t.name === 'Pickleball Central Season 8')!;
    expect(s8.status).toBe('live');
    const [sing, dbl] = ev.divisions.filter((d) => d.tournamentId === s8.id);
    const sm = ev.matches.filter((m) => m.divisionId === sing.id), dm = ev.matches.filter((m) => m.divisionId === dbl.id);
    expect(sm.length).toBe(24);
    expect(sm.some((m) => m.status === 'done') && sm.some((m) => m.status === 'live') && sm.some((m) => m.status === 'scheduled')).toBe(true);
    expect(dm.length).toBe(12);
    expect(dm.every((m) => m.status === 'scheduled')).toBe(true);
    const firstDoubles = Math.min(...dm.map((m) => m.slot ?? 99));
    expect((firstDoubles - 4) * s8.slotMinutes).toBe(120); // 10:00 demo time: singles started 80 min ago (slot 4 now)
    expect(ev.entries.filter((e) => e.divisionId === dbl.id).every((e) => new Set(e.playerIds).size === 2)).toBe(true);
    expect(ev.tournaments.filter((t) => t.listingStatus === 'pending').map((t) => t.name)).toEqual(['PQ Demo Ladder Cup', 'PQ Demo Corporate Cup']);
  });

  it('the demo organiser can change a poster; it shows on the board after approval', async () => {
    const b = new DemoBackend(memory());
    const clubId = await b.start('Robot');
    const t = (await b.clubBundle(clubId)).tournaments.find((x) => x.name === 'PQ Demo Night')!;
    const url = await b.setPoster(t, new Blob([new Uint8Array([255, 216, 255, 224])], { type: 'image/jpeg' }));
    expect(url.startsWith('data:image/jpeg')).toBe(true);
    expect((await b.publicEvent('pq-demo-night'))?.posterUrl).toBe(url);
    const corp = (await b.listingQueue()).find((q) => q.name === 'PQ Demo Corporate Cup')!;
    expect(corp.posterUrl).toMatch(/^data:image\/svg/);
    expect((await b.publicEvents()).some((e) => e.name === 'PQ Demo Corporate Cup')).toBe(false);
    await b.reviewListing(corp.id, true);
    expect((await b.publicEvents()).find((e) => e.name === 'PQ Demo Corporate Cup')?.posterUrl).toBe(corp.posterUrl);
  });

  it('a demo made with the first sample set gets the new one, without duplicates, keeping what you made', async () => {
    const first = memory();
    const b1 = new DemoBackend(first);
    const clubId = await b1.start('Robot');
    await b1.createTournament({ clubId, name: 'My Own Cup', startDate: '2099-01-01', startTime: '08:00', courts: 2, slotMinutes: 20, entryMode: 'registration', divisions: [{ name: 'Open', kind: 'singles', format: { pointsTo: 11, bestOf: 1, scoring: 'sideout' }, koFormat: { pointsTo: 11, bestOf: 1, scoring: 'sideout' }, pools: 1, advance: 0, entries: [] }] });
    const raw = JSON.parse(first.getItem('pq-club-demo-v1') ?? '{}');
    raw.eventsSeeded = true; // as saved by the first version
    const b2 = new DemoBackend(memory({ 'pq-club-demo-v1': JSON.stringify(raw) }));
    const names = (await b2.clubBundle(clubId)).tournaments.map((t) => t.name);
    expect(names.filter((x) => x === 'PQ Demo Night')).toHaveLength(1);
    expect(names).toContain('My Own Cup');
    expect(names).toContain('PQ Demo Diwali Doubles');
    expect(JSON.parse(memory().getItem('x') ?? 'null')).toBeNull();
    expect(SAMPLE_EVENTS_VERSION).toBe(3);
  });
});
