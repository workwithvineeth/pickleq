import { describe, expect, it } from 'vitest';
import { DemoBackend } from './demo';
import type { Format } from '../domain/types';
import type { NewTournamentInput } from './plan';
import { isApproved, PICK_NEEDS_TRUST } from './types';

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

const fmt: Format = { pointsTo: 11, bestOf: 1, scoring: 'sideout' };
const reg = (clubId: string, name: string): NewTournamentInput => ({
  clubId, name, startDate: '2099-01-01', startTime: '08:00', courts: 2, slotMinutes: 20, entryMode: 'registration',
  divisions: [{ name: 'Open', kind: 'singles', format: fmt, koFormat: fmt, pools: 1, advance: 0, entries: [], rules: { gender: 'open', fee: 500 } }],
  details: { city: 'Pune', venue: 'Yard Courts', upiId: 'yard@bank' },
});

async function newClub() {
  const b = new DemoBackend(memoryStorage());
  const demoClub = await b.start('Robot');
  const clubId = await b.createClub('Robot Yard', 'Pune', 'Robot');
  const id = await b.createTournament(reg(clubId, 'Yard Open'));
  const t = (await b.tournamentBundle(id)).tournament;
  return { b, demoClub, clubId, id, t };
}

describe('Create freely, go live with approval (demo backend, same rules as the server)', () => {
  it('a new club’s tournament starts as a draft; entries can be added and imported, but nothing goes live', async () => {
    const { b, id, t } = await newClub();
    expect(t.approval).toBe('draft');
    expect(isApproved(t)).toBe(false);
    const div = (await b.tournamentBundle(id)).divisions[0];
    // Free: entries by hand and by import.
    await b.addOfflineEntry({ tournamentId: id, divisionId: div.id, clubId: t.clubId, players: [{ name: 'Hand Added', phone: '', gender: 'm', age: 30 }], status: 'accepted', payment: 'venue' });
    const imp = await b.importEntries(id, [{ divisionId: div.id, players: [{ name: 'Imported', phone: '9811100001', gender: 'f', age: 28 }], status: 'accepted', payment: 'unpaid' }]);
    expect(imp.added).toBe(1);
    // Blocked: matches, public results, registration page, online entries, referee and desk links.
    await expect(b.addMatches([{ id: crypto.randomUUID(), clubId: t.clubId, tournamentId: id, divisionId: div.id, stage: 'pool', sideA: [], sideB: [], format: fmt, games: [], status: 'scheduled' }])).rejects.toThrow('hasn’t approved');
    await b.updateTournament(id, { isPublic: true });
    expect(await b.publicTournament(t.publicSlug)).toBeNull();
    expect(await b.publicEvent(t.publicSlug)).toBeNull();
    await expect(b.registerEntry(div.id, [{ name: 'Early', phone: '9822200002', gender: 'm', age: 30 }], 'venue')).rejects.toThrow('isn’t taking entries yet');
    const access = await b.tournamentAccess(id);
    await expect(b.deskOpen(access.deskToken!, access.deskPin!)).rejects.toThrow('hasn’t approved');
    const [link] = await b.createScorerLinks(id, t.clubId, [1]);
    await expect(b.scorerOpen(link.token, (await b.eventPin(id))!)).rejects.toThrow('hasn’t approved');
  });

  it('submit, reject with a reason, submit again, approve: then everything opens', async () => {
    const { b, id, t } = await newClub();
    expect(await b.submitTournament(id, 24)).toBe('submitted');
    const q = (await b.approvalQueue()).find((x) => x.id === id)!;
    expect(q).toMatchObject({ name: 'Yard Open', venue: 'Yard Courts', city: 'Pune', upiId: 'yard@bank', expected: 24, approval: 'submitted' });
    expect(q.divisions[0]).toMatchObject({ name: 'Open', fee: 500 });
    await expect(b.decideTournament(id, false, ' ')).rejects.toThrow('Give the club a reason');
    await b.decideTournament(id, false, 'Add the start time');
    expect((await b.tournamentBundle(id)).tournament).toMatchObject({ approval: 'rejected', approvalReason: 'Add the start time' });
    expect(await b.submitTournament(id)).toBe('submitted');
    await b.decideTournament(id, true);
    await expect(b.decideTournament(id, true)).rejects.toThrow('already approved');
    await b.updateTournament(id, { isPublic: true });
    expect(await b.publicTournament(t.publicSlug)).not.toBeNull();
    expect(await b.publicEvent(t.publicSlug)).not.toBeNull();
    const access = await b.tournamentAccess(id);
    expect((await b.deskOpen(access.deskToken!, access.deskPin!)).tournament.id).toBe(id);
  });

  it('trusted clubs skip approval; picking players needs trust; switching trust off keeps approved tournaments approved', async () => {
    const { b, demoClub, clubId, id } = await newClub();
    // PQ Demo Club is trusted: new tournaments are approved, and picking players (the draw at once) works.
    const mine = await b.createTournament(reg(demoClub, 'Demo Cup'));
    expect((await b.tournamentBundle(mine)).tournament.approval).toBe('approved');
    // A club that isn't trusted can't pick players (that would make the draw before approval).
    const players = (await b.clubBundle(clubId)).players;
    const pick: NewTournamentInput = { ...reg(clubId, 'Pick Cup'), entryMode: 'roster', details: undefined, divisions: [{ name: 'Open', kind: 'singles', format: fmt, koFormat: fmt, pools: 1, advance: 0, entries: [[players[0].id], [(await b.addPlayer(clubId, { name: 'Two' })).id]] }] };
    await expect(b.createTournament(pick)).rejects.toThrow(PICK_NEEDS_TRUST);
    // Trust on: its unfinished tournaments are approved; new ones are approved at once.
    await b.setClubTrusted(clubId, true);
    expect((await b.tournamentBundle(id)).tournament.approval).toBe('approved');
    const picked = await b.createTournament(pick);
    expect((await b.tournamentBundle(picked)).matches.length).toBe(1);
    // Trust off: what's approved stays approved; new tournaments need approval again.
    await b.setClubTrusted(clubId, false);
    expect((await b.tournamentBundle(picked)).tournament.approval).toBe('approved');
    const later = await b.createTournament(reg(clubId, 'Later Cup'));
    expect((await b.tournamentBundle(later)).tournament.approval).toBe('draft');
    expect((await b.adminClubs()).find((c) => c.id === clubId)?.trusted).toBe(false);
  });
});
