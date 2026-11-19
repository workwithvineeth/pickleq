import { describe, expect, it } from 'vitest';
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
const demo = async () => { const b = new DemoBackend(memoryStorage()); await b.start('Robot'); return b; };

describe('Admin command centre (demo, same rules as the database)', () => {
  it('deletes a finished tournament only after its exact name is typed, and logs it', async () => {
    const b = await demo();
    const t = (await b.adminTournaments()).find((x) => x.name === 'PQ Demo Diwali Doubles')!;
    expect(t.matches).toBeGreaterThan(0);
    await expect(b.adminDeleteTournament(t.id, 'pq demo diwali')).rejects.toThrow('Type the tournament name exactly');
    await b.adminDeleteTournament(t.id, 'PQ Demo Diwali Doubles');
    expect((await b.adminTournaments()).some((x) => x.id === t.id)).toBe(false);
    await expect(b.tournamentBundle(t.id)).rejects.toThrow('Tournament not found');
    expect((await b.platformAudit()).some((a) => a.action === 'admin_tournament_delete' && a.tournamentId === t.id)).toBe(true);
  });

  it('refuses to delete a live tournament or a club that has one', async () => {
    const b = await demo();
    const live = (await b.adminTournaments()).find((x) => x.status === 'live');
    if (!live) throw new Error('the demo should have a live tournament');
    await expect(b.adminDeleteTournament(live.id, live.name)).rejects.toThrow('This tournament is live');
    const club = (await b.adminClubs()).find((c) => c.id === live.clubId)!;
    await expect(b.adminDeleteClub(club.id, club.name)).rejects.toThrow('live tournament');
    await b.adminSetTournamentStatus(live.id, 'done');
    await b.adminDeleteTournament(live.id, live.name);
    expect((await b.adminTournaments()).some((x) => x.id === live.id)).toBe(false);
  });

  it('deletes a club with everything in it (even after people entered), after the exact name is typed', async () => {
    const b = await demo();
    const id = await b.createClub('Smash Yard', 'Pune', 'Robot');
    await expect(b.adminDeleteClub(id, 'Smash')).rejects.toThrow('Type the club name exactly');
    await b.adminDeleteClub(id, 'Smash Yard');
    expect((await b.adminClubs()).some((c) => c.id === id)).toBe(false);
    expect((await b.platformAudit()).some((a) => a.action === 'admin_club_delete' && a.clubId === id)).toBe(true);
    const demoClub = (await b.adminClubs()).find((c) => c.name === 'PQ Demo Club')!;
    const done = (await b.adminTournaments()).filter((t) => t.clubId === demoClub.id && t.status !== 'live');
    expect(done.length).toBeGreaterThan(0);
  });

  it('a RallyQ admin fixes a finished pool result and the old score stays out of the way; a bad edit is refused', async () => {
    const b = await demo();
    const t = (await b.adminTournaments()).find((x) => x.name === 'PQ Demo Diwali Doubles')!;
    const bundle = await b.resultsBundle(t.id);
    const m = bundle.matches.find((x) => x.status === 'done' && x.stage === 'pool' && x.sideA.length > 0 && x.sideB.length > 0)!;
    const flipped = m.games.map((g) => ({ ...g, a: g.b, b: g.a }));
    await expect(b.adminEditMatchResult(m, flipped, 'x')).rejects.toThrow('reason');
    await expect(b.adminEditMatchResult({ ...m, updatedAt: '2000-01-01T00:00:00Z' }, flipped, 'Wrong side tapped')).rejects.toThrow('result changed');
    await b.adminEditMatchResult(m, flipped, 'Wrong side tapped');
    const after = (await b.resultsBundle(t.id)).matches.find((x) => x.id === m.id)!;
    expect(after.winner).toBe(m.winner === 'A' ? 'B' : 'A');
    expect((await b.platformAudit()).some((a) => a.action === 'admin_result_edit' && a.tournamentId === t.id)).toBe(true);
  });

  it('assigns roles, adds people by email and always keeps one owner', async () => {
    const b = await demo();
    const id = await b.createClub('Role Club', 'Pune', 'Robot');
    const first = await b.adminClubMembers(id);
    expect(first).toHaveLength(1);
    expect(first[0].role).toBe('owner');
    await expect(b.adminSetMemberRole(id, first[0].userId, 'coach')).rejects.toThrow('needs an owner');
    await expect(b.adminRemoveClubMember(id, first[0].userId)).rejects.toThrow('needs an owner');
    await expect(b.adminAddClubMember(id, 'not an email', 'coach')).rejects.toThrow('valid email');
    expect(await b.adminAddClubMember(id, 'Second.Person@example.com', 'coach')).toBe('added');
    let people = await b.adminClubMembers(id);
    const second = people.find((p) => p.email === 'second.person@example.com')!;
    expect(second.role).toBe('coach');
    await b.adminSetMemberRole(id, second.userId, 'owner');
    await b.adminSetMemberRole(id, first[0].userId, 'admin'); // two owners: one can step down
    people = await b.adminClubMembers(id);
    expect(people.map((p) => p.role).sort()).toEqual(['admin', 'owner']);
    await b.adminRemoveClubMember(id, first[0].userId);
    expect((await b.adminClubMembers(id)).map((p) => p.userId)).toEqual([second.userId]);
    expect((await b.platformAudit()).filter((a) => a.clubId === id && a.action.startsWith('admin_role_')).length).toBeGreaterThanOrEqual(4);
  });
});
