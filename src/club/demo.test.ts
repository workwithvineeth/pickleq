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

  it('refreshes saved v6 sample events without removing a user-made event', async () => {
    const storage = memoryStorage();
    await new DemoBackend(storage).start('Robot');
    const old = JSON.parse(storage.getItem('pq-club-demo-v1')!);
    old.eventsSeeded = 6;
    const event = old.tournaments.find((t: { publicSlug: string }) => t.publicSlug === 'pq-demo-central-s8');
    event.name = 'Pickleball Central Season 8';
    old.tournaments.push({ ...event, id: 'made-by-user', publicSlug: 'my-event', name: 'My practice night' });
    const restored = new DemoBackend(memoryStorage({ 'pq-club-demo-v1': JSON.stringify(old) }));
    const names = (await restored.publicEvents()).map(e => e.name);
    expect(names).toContain('Cedar Club Season 8');
    expect(names).not.toContain('Pickleball Central Season 8');
    expect(names).toContain('My practice night');
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

describe('Referee PIN and desk access (same rules as the server, club_mode_18)', () => {
  async function setup() {
    const b = new DemoBackend(memoryStorage());
    const clubId = await b.start('Robot');
    const t = (await b.clubBundle(clubId)).tournaments.find((x) => x.name === 'PQ Demo Open');
    if (!t) throw new Error('no demo tournament');
    return { b, clubId, t };
  }

  it('gives each tournament a 4-digit referee PIN and a different 6-digit desk PIN; typed PINs must not be easy or equal', async () => {
    const { b, t } = await setup();
    const a = await b.tournamentAccess(t.id);
    expect(a.refereePin).toMatch(/^\d{4}$/);
    expect(a.deskPin).toMatch(/^\d{6}$/);
    expect(a.deskToken.length).toBeGreaterThanOrEqual(30);
    await expect(b.setDeskPin(t.id, a.refereePin)).rejects.toThrow(/must be different/);
    await expect(b.setEventPin(t.id, a.deskPin)).rejects.toThrow(/must be different/);
    await expect(b.setDeskPin(t.id, '123456')).rejects.toThrow(/too easy/);
    await expect(b.setEventPin(t.id, '1111')).rejects.toThrow(/too easy/);
    expect(await b.setEventPin(t.id, '4371')).toBe('4371');
    expect(await b.setDeskPin(t.id, '583920')).toBe('583920');
  });

  it('the desk opens with the desk PIN only, shows names and ratings only, and locks after 5 wrong PINs', async () => {
    const { b, t } = await setup();
    await b.setEventPin(t.id, '4371');
    await b.setDeskPin(t.id, '583920');
    const { deskToken } = await b.tournamentAccess(t.id);
    await expect(b.deskOpen(deskToken, '4371')).rejects.toThrow('Wrong desk PIN');
    await expect(b.deskOpen('not-a-desk-link', '583920')).rejects.toThrow(/isn’t valid/);
    const d = await b.deskOpen(deskToken, '583920');
    expect(d.desk).toBe(true);
    expect(d.tournament.id).toBe(t.id);
    expect(d.club.inviteCode).toBe('');
    expect(d.players.every((p) => !('claimCode' in p) && p.userId === undefined && p.duprId === undefined)).toBe(true);
    for (let i = 0; i < 5; i++) await expect(b.deskOpen(deskToken, '000000')).rejects.toThrow('Wrong desk PIN');
    await expect(b.deskOpen(deskToken, '583920')).rejects.toThrow(/Too many wrong PINs/);
    await b.setDeskPin(t.id, '583920');
    await expect(b.deskOpen(deskToken, '583920')).resolves.toBeTruthy();
  });

  it('the desk scores, moves and gives walkovers in its tournament only, and stops when the tournament is finished', async () => {
    const { b, clubId, t } = await setup();
    await b.setDeskPin(t.id, '583920');
    const { deskToken } = await b.tournamentAccess(t.id);
    const d = await b.deskOpen(deskToken, '583920');
    const open = d.matches.filter((m) => m.status === 'scheduled');
    await b.deskPatchMatches(deskToken, '583920', [{ id: open[0].id, patch: { court: 1 } }]);
    await expect(b.deskPatchMatches(deskToken, '583920', [{ id: open[0].id, patch: { court: 99 } }])).rejects.toThrow(/Choose a court/);
    await b.deskPatchMatches(deskToken, '583920', [{ id: open[0].id, patch: { status: 'done', winner: 'A', games: [] } }]);
    const other = (await b.clubBundle(clubId)).matches.find((m) => m.tournamentId !== t.id);
    if (other) await expect(b.deskSaveScore(deskToken, '583920', other.id, { games: [], status: 'live' })).rejects.toThrow(/isn’t in your tournament/);
    await expect(b.deskAddPlayer(deskToken, '583920', { name: '  Walk   In ' })).resolves.toMatchObject({ name: 'Walk In' });
    await b.updateTournament(t.id, { status: 'done' });
    await expect(b.deskOpen(deskToken, '583920')).rejects.toThrow(/finished/);
  });

  it('a knockout match drawn twice (two screens at once) is kept once', async () => {
    const { b, t } = await setup();
    const d = await b.tournamentBundle(t.id);
    const ko = d.matches.find((m) => m.stage === 'sf');
    if (!ko) throw new Error('no semi-final in the demo');
    const before = (await b.tournamentBundle(t.id)).matches.length;
    const { updatedAt: _u, ...row } = ko;
    await b.addMatches([{ ...row, id: 'copy-of-sf' }]);
    expect((await b.tournamentBundle(t.id)).matches.length).toBe(before);
  });
});

describe('Owner’s phone (same rule as the server, club_mode_19)', () => {
  it('only the club’s owner and admins see it; a player who joined doesn’t', async () => {
    const store = memoryStorage();
    const b = new DemoBackend(store);
    const clubId = await b.start('Robot');
    await b.requestHosting(clubId, '+91 9876501234', 'Two courts').catch(() => undefined);
    const state = JSON.parse(store.getItem('pq-club-demo-v1') ?? '{}');
    const club = state.clubs.find((c: { id: string }) => c.id === clubId);
    club.hostingPhone = '+91 9876501234'; club.hostingNote = 'Two courts';
    const me = state.user.id;
    for (const m of state.members) if (m.clubId === clubId && m.userId === me) m.role = 'player';
    const asPlayer = new DemoBackend(memoryStorage({ 'pq-club-demo-v1': JSON.stringify(state) }));
    const d = await asPlayer.clubBundle(clubId);
    expect(d.club.hostingPhone).toBeUndefined();
    expect(d.club.hostingNote).toBeUndefined();
    for (const m of state.members) if (m.clubId === clubId && m.userId === me) m.role = 'admin';
    const asAdmin = new DemoBackend(memoryStorage({ 'pq-club-demo-v1': JSON.stringify(state) }));
    expect((await asAdmin.clubBundle(clubId)).club.hostingPhone).toBe('+91 9876501234');
  });
});

describe('Demo: accepting stays within the category limit (same rule as the server)', () => {
  it('refuses an accept past the cap and allows it after a withdrawal', async () => {
    const b = new DemoBackend(memoryStorage());
    const id = await b.start('Robot');
    const t = (await b.clubBundle(id)).tournaments.find((x) => x.name === 'PQ Demo Night')!;
    const regs = await b.registrations(t.id);
    const div = regs[0].divisionId;
    const inDiv = regs.filter((r) => r.divisionId === div && r.status !== 'accepted' && r.status !== 'withdrawn');
    const accepted = regs.filter((r) => r.divisionId === div && r.status === 'accepted');
    // Set the limit to what's already accepted, so the next accept is one too many.
    const store = (b as unknown as { s: { divisions: { id: string; name: string; rules?: { cap?: number } }[] }; save: () => void });
    const d = store.s.divisions.find((x) => x.id === div)!;
    d.rules = { ...d.rules, cap: accepted.length }; store.save();
    await expect(b.updateRegistration(inDiv[0].id, { status: 'accepted' })).rejects.toThrow(`${d.name} is full (${accepted.length} of ${accepted.length} accepted)`);
    if (accepted[0]) {
      await b.updateRegistration(accepted[0].id, { status: 'withdrawn' });
      await expect(b.updateRegistration(inDiv[0].id, { status: 'accepted' })).resolves.toBeUndefined();
    }
  });
});

describe('Late team with player details (same rules as the server, late_team_check.sql)', () => {
  async function setup() {
    const storage = memoryStorage();
    const first = new DemoBackend(storage);
    const clubId = await first.start('Robot');
    const { planLateEntry } = await import('./plan');
    // A demo event that can still take a late entry (drawn, knockouts not started).
    let pick: { tid: string; did: string } | null = null;
    for (const t0 of (await first.clubBundle(clubId)).tournaments) {
      const tb = await first.tournamentBundle(t0.id);
      for (const d0 of tb.divisions) {
        const need = d0.kind === 'doubles' ? 2 : 1;
        if (tb.entries.some((e) => e.divisionId === d0.id) && typeof planLateEntry(tb.tournament, d0, Array.from({ length: need }, (_, i) => `probe-${i}`), tb.entries, tb.matches, () => 'probe') !== 'string') { pick = { tid: t0.id, did: d0.id }; break; }
      }
      if (pick) break;
    }
    if (!pick) throw new Error('no demo event open for late entries');
    // Give that event an entry fee and a women-only rule: the old late entry refused these outright.
    const saved = JSON.parse(storage.getItem('pq-club-demo-v1')!);
    const div = saved.divisions.find((d: { id: string }) => d.id === pick!.did);
    div.rules = { ...(div.rules ?? {}), fee: 500, gender: 'women' };
    storage.setItem('pq-club-demo-v1', JSON.stringify(saved));
    const b = new DemoBackend(storage);
    const bundle = await b.tournamentBundle(pick.tid);
    const d = bundle.divisions.find((x) => x.id === pick!.did)!;
    return { b, t: bundle.tournament, d, bundle };
  }
  const person = (name: string, gender: 'm' | 'f', age: number, email = '') => ({ name, phone: '', email, duprId: '', dupr: 3.2, gender, age });

  it('refuses the roster late entry for a paid event, then adds a team with details, payment and email', async () => {
    const { b, t, d, bundle } = await setup();
    const { planLateEntry } = await import('./plan');
    const need = d.kind === 'doubles' ? 2 : 1;
    const ids = Array.from({ length: need }, (_, i) => `late-${i}`);
    const plan = planLateEntry(t, d, ids, bundle.entries, bundle.matches, (() => { let n = 0; return () => `x-${n++}`; })());
    if (typeof plan === 'string') throw new Error(plan);
    const men = ids.map((id, i) => ({ ...person(`Sample Man ${i}`, 'm', 30), id }));
    await expect(b.addLateTeam(men, 'paid', plan.entry, plan.matches)).rejects.toThrow(need === 2 ? /for women/ : /for women/);
    const women = ids.map((id, i) => ({ ...person(`Sample Woman ${i}`, 'f', 29, i === 0 ? 'sample.woman@example.test' : ''), id }));
    await b.addLateTeam(women, 'venue', plan.entry, plan.matches);
    const after = await b.tournamentBundle(t.id);
    expect(after.entries.some((e) => e.id === plan.entry.id)).toBe(true);
    expect(after.players.find((p) => p.id === 'late-0')?.name).toBe('Sample Woman 0');
    const regs = await b.registrations(t.id);
    expect(regs.find((r) => r.entryId === plan.entry.id)).toMatchObject({ source: 'offline', status: 'accepted', payment: 'venue' });
  });
});
