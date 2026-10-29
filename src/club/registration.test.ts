import { describe, expect, it } from 'vitest';
import { DemoBackend } from './demo';
import { checkDivisionSetup } from './plan';
import { drawProblem, entryProblem, inboxCounts, planDraw, rulesLine, upiLink } from './registration';
import type { EntryPerson } from './types';

const P = (name: string, phone: string, gender: EntryPerson['gender'], age: number, dupr?: number): EntryPerson => ({ name, phone, gender, age, dupr });

function memory(): Storage {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null, removeItem: (k) => { m.delete(k); }, setItem: (k, v) => { m.set(k, v); } };
}

describe('Entry rules (same as the club server)', () => {
  const men35 = { gender: 'men' as const, maxDupr: 3.5 };
  it('accepts a valid team', () => {
    expect(entryProblem('doubles', men35, [P('A', '9800000001', 'm', 30, 3.4), P('B', '9800000002', 'm', 40, 3.5)], true)).toBeNull();
  });
  it('refuses the wrong number of players', () => {
    expect(entryProblem('doubles', {}, [P('A', '9800000001', 'm', 30)], true)).toBe('A doubles entry needs two players');
    expect(entryProblem('singles', {}, [], true)).toBe('A singles entry is one player');
  });
  it('is adults only, and applies age groups', () => {
    expect(entryProblem('singles', {}, [P('Kid', '9800000001', 'm', 16)], true)).toMatch(/18 or over/);
    expect(entryProblem('singles', { minAge: 35 }, [P('Asha', '9800000001', 'f', 34)], true)).toBe('Asha: this event is for players aged 35 and over');
    expect(entryProblem('singles', { minAge: 35 }, [P('Asha', '9800000001', 'f', 35)], true)).toBeNull();
    expect(entryProblem('singles', {}, [{ ...P('Asha', '9800000001', 'f', 30), age: undefined }], true)).toBe('Asha: enter their age');
  });
  it('applies a DUPR cap to every player, and needs a rating for capped events', () => {
    expect(entryProblem('doubles', men35, [P('A', '9800000001', 'm', 30, 3.6), P('B', '9800000002', 'm', 30, 3.0)], true)).toBe('A: rating 3.6 is above this event’s cap of 3.5');
    expect(entryProblem('doubles', men35, [P('A', '9800000001', 'm', 30, 3.0), P('B', '9800000002', 'm', 30)], true)).toBe('B: this event needs a DUPR rating (3.5 and under)');
    expect(entryProblem('singles', {}, [P('A', '9800000001', 'm', 30, 9)], true)).toMatch(/between 1 and 8/);
  });
  it('applies gender rules', () => {
    expect(entryProblem('doubles', men35, [P('A', '9800000001', 'f', 30, 3), P('B', '9800000002', 'm', 30, 3)], true)).toBe('This event is for men');
    expect(entryProblem('doubles', { gender: 'women' }, [P('A', '9800000001', 'f', 30), P('B', '9800000002', 'x', 30)], true)).toBe('This event is for women');
    expect(entryProblem('doubles', { gender: 'mixed' }, [P('A', '9800000001', 'm', 30), P('B', '9800000002', 'm', 30)], true)).toBe('A mixed doubles team is one man and one woman');
    expect(entryProblem('doubles', { gender: 'mixed' }, [P('A', '9800000001', 'm', 30), P('B', '9800000002', 'f', 30)], true)).toBeNull();
    expect(entryProblem('singles', { gender: 'open' }, [{ ...P('A', '9800000001', 'm', 30), gender: '' }], true)).toBe('A: choose a gender');
  });
  it('needs a phone online, not offline; two players can’t share one', () => {
    expect(entryProblem('singles', {}, [P('A', '', 'm', 30)], true)).toBe('A: enter a phone number');
    expect(entryProblem('singles', {}, [P('A', '', 'm', 30)], false)).toBeNull();
    expect(entryProblem('singles', {}, [P('A', '12', 'm', 30)], false)).toBe('A: enter a phone number');
    expect(entryProblem('doubles', {}, [P('A', '98000 00001', 'm', 30), P('B', '9800000001', 'm', 30)], true)).toBe('The two players need different phone numbers');
  });
  it('checks DUPR IDs', () => {
    expect(entryProblem('singles', {}, [{ ...P('A', '9800000001', 'm', 30), duprId: 'x' }], true)).toMatch(/DUPR ID/);
  });
});

describe('Setting up events', () => {
  const base = { name: 'Men 3.5', kind: 'doubles' as const, format: { pointsTo: 11 as const, bestOf: 1 as const, scoring: 'sideout' as const }, koFormat: { pointsTo: 11 as const, bestOf: 1 as const, scoring: 'sideout' as const }, pools: 1, advance: 0, entries: [] };
  it('lets a registration event start with no entries, but checks its rules', () => {
    expect(checkDivisionSetup(base, 'registration')).toBeNull();
    expect(checkDivisionSetup(base, 'roster')).toBe('An event needs at least 2 entries');
    expect(checkDivisionSetup({ ...base, rules: { minAge: 12 } }, 'registration')).toMatch(/18/);
    expect(checkDivisionSetup({ ...base, kind: 'singles', rules: { gender: 'mixed' } }, 'registration')).toBe('Mixed is for doubles only');
    expect(checkDivisionSetup({ ...base, rules: { maxDupr: 9 } }, 'registration')).toMatch(/between 1 and 8/);
  });
  it('describes an event in one line', () => {
    expect(rulesLine('doubles', { gender: 'men', maxDupr: 3.5, minAge: 35, fee: 800 })).toBe('Men · Doubles · DUPR 3.5 and under · 35+ · ₹800');
    expect(rulesLine('singles', {})).toBe('Singles · Free entry');
  });
  it('makes a UPI link that pays the organiser directly', () => {
    const u = upiLink('club@okbank', 'Pickle Club', 800, 'Entry: Men 3.5');
    expect(u.startsWith('upi://pay?')).toBe(true);
    const q = new URLSearchParams(u.split('?')[1]);
    expect([q.get('pa'), q.get('am'), q.get('cu'), q.get('tn')]).toEqual(['club@okbank', '800', 'INR', 'Entry: Men 3.5']);
  });
});

describe('Registration flow (demo backend, same rules as the server)', () => {
  async function setup() {
    const b = new DemoBackend(memory());
    const clubId = await b.start('Robot');
    const night = (await b.publicEvents()).find((e) => e.name === 'PQ Demo Night');
    if (!night) throw new Error('no demo event');
    return { b, clubId, night };
  }

  it('shows approved events on the board; a pending listing waits for review', async () => {
    const { b } = await setup();
    const names = (await b.publicEvents()).map((e) => e.name);
    expect(names).toContain('PQ Demo Night');
    expect(names).toContain('PQ Demo Sunday Social');
    expect(names).not.toContain('PQ Demo Ladder Cup');
    const queue = await b.listingQueue();
    const ladder = queue.find((q) => q.name === 'PQ Demo Ladder Cup');
    expect(ladder?.listingStatus).toBe('pending');
    await expect(b.reviewListing(ladder!.id, false, '')).rejects.toThrow('Give the organiser a reason');
    await b.reviewListing(ladder!.id, true);
    expect((await b.publicEvents()).map((e) => e.name)).toContain('PQ Demo Ladder Cup');
  });

  it('a player registers; the rules, duplicates and the cap apply; they can withdraw', async () => {
    const { b, night } = await setup();
    const md = night.divisions.find((d) => d.name.startsWith('Men'))!;
    await expect(b.registerEntry(md.id, [P('Robot', '9811111111', 'm', 30, 3.6), P('Mate', '9811111112', 'm', 30, 3.0)], 'venue')).rejects.toThrow(/above this event/);
    const r = await b.registerEntry(md.id, [P('Robot', '9811111111', 'm', 30, 3.2), P('Mate', '9811111112', 'm', 30, 3.0)], 'venue');
    expect(r.status).toBe('pending');
    await expect(b.registerEntry(md.id, [P('Robot', '9811111113', 'm', 30, 3.2), P('Pal', '9811111114', 'm', 30, 3.0)], 'venue')).rejects.toThrow(/already have an entry/);
    const mine = await b.myEntries();
    expect(mine.map((m) => [m.tournament, m.status, m.payment])).toEqual([['PQ Demo Night', 'pending', 'venue']]);
    await b.withdrawMyEntry(r.id);
    expect((await b.myEntries())[0].status).toBe('withdrawn');
  });

  it('the organiser accepts, marks paid, adds an offline entry, then draws pools and a schedule', async () => {
    const { b, clubId, night } = await setup();
    const t = (await b.clubBundle(clubId)).tournaments.find((x) => x.name === 'PQ Demo Night')!;
    const regs = await b.registrations(t.id);
    const md = night.divisions.find((d) => d.name.startsWith('Men'))!;
    for (const r of regs.filter((x) => x.status === 'pending')) await b.updateRegistration(r.id, { status: 'accepted', payment: 'paid' });
    await expect(b.addOfflineEntry({ tournamentId: t.id, divisionId: md.id, clubId, players: [P('Walk', '', 'm', 15, 3), P('In', '', 'm', 40, 3)], status: 'accepted', payment: 'venue' })).rejects.toThrow(/18 or over/);
    await b.addOfflineEntry({ tournamentId: t.id, divisionId: md.id, clubId, players: [P('Walk', '', 'm', 25, 3), P('In', '', 'm', 40, 3)], status: 'accepted', payment: 'venue' });
    const now = await b.registrations(t.id);
    const counts = inboxCounts(now.filter((r) => r.divisionId === md.id), 8);
    expect(counts.accepted).toBe(6);
    expect(counts.spotsLeft).toBe(2);
    const tb = await b.tournamentBundle(t.id);
    expect(drawProblem(tb.divisions.find((d) => d.id === md.id)!, 6, { divisionId: md.id, pools: 4, advance: 0 })).toMatch(/at least 2 entries/);
    const plan = planDraw(tb.tournament, tb.divisions, now, [{ divisionId: md.id, pools: 2, advance: 1 }], () => crypto.randomUUID());
    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.players).toHaveLength(12);
    expect(plan.entries).toHaveLength(6);
    expect(plan.matches).toHaveLength(6); // two pools of 3: 3 matches each
    expect(plan.links).toHaveLength(6);
    await b.applyDraw(t.id, plan);
    const after = await b.tournamentBundle(t.id);
    expect(after.tournament.drawnAt).toBeTruthy();
    expect(after.tournament.registrationOpen).toBe(false);
    expect(after.matches.filter((m) => m.divisionId === md.id).every((m) => m.court && m.slot !== undefined)).toBe(true);
    expect((await b.registrations(t.id)).filter((r) => r.entryId)).toHaveLength(6);
    expect((await b.publicEvent('pq-demo-night'))?.registrationOpen).toBe(false);
    await expect(b.applyDraw(t.id, plan)).rejects.toThrow('already made');
    const again = planDraw(after.tournament, after.divisions, now, [], () => crypto.randomUUID());
    expect(again).toBe('The draw is already made');
  });

  it('posting to the board: unverified clubs wait for approval, verified ones go straight on', async () => {
    const { b, clubId } = await setup();
    const id = await b.createTournament({ clubId, name: 'Robot Cup', startDate: '2099-01-01', startTime: '08:00', courts: 2, slotMinutes: 20, entryMode: 'registration', divisions: [{ name: 'Open', kind: 'singles', format: { pointsTo: 11, bestOf: 1, scoring: 'sideout' }, koFormat: { pointsTo: 11, bestOf: 1, scoring: 'sideout' }, pools: 1, advance: 0, entries: [] }] });
    await expect(b.submitListing(id, 'run')).rejects.toThrow('Add the city and venue first');
    await b.updateTournamentDetails(id, { city: 'Hyderabad', venue: 'Robot Courts' });
    expect(await b.submitListing(id, 'run')).toBe('pending');
    const q = (await b.listingQueue()).find((x) => x.name === 'Robot Cup')!;
    await b.reviewListing(q.id, false, 'Add the entry fee');
    expect((await b.listingQueue()).find((x) => x.name === 'Robot Cup')?.rejectReason).toBe('Add the entry fee');
    expect(await b.submitListing(id, 'run')).toBe('pending');
    await b.reviewListing(q.id, true);
    expect(await b.submitListing(id, 'run')).toBe('approved'); // the club is verified now
    expect(await b.publicEvent((await b.tournamentBundle(id)).tournament.publicSlug)).not.toBeNull();
  });
});
