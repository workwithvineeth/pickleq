import { describe, expect, it } from 'vitest';
import type { ClubMatch, ClubPlayer } from '../types';
import { biggest, playerClubStats, playerFlags, squadTable } from './analytics';
import { firstKnockoutPairs, matchResult, nextRoundPairs, planPoolMatches, roundRobinRounds, scheduleSlots, seedOrder, slotTime, snakePools, standings } from './engine';
import { analyseGame, leadThreshold } from './momentum';
import { buildSampleClub } from './sample';
import { rng, simulateGame } from './simulate';
import { clubMatchToPersonal } from './toPersonal';

const seq = (s: string) => s.replace(/\s/g, '');

describe('automatic momentum from live scoring', () => {
  it('uses 4 / 5 / 7 point leads by game length', () => {
    expect([leadThreshold(11), leadThreshold(15), leadThreshold(21)]).toEqual([4, 5, 7]);
  });

  it('marks a comeback from 3–8 down, and the same game as a lost lead for the other side', () => {
    // B goes 8–3 up, then A wins 8 straight: 11–8.
    const pts = seq('A B B A B B B A B B B  AAAAAAAA');
    const g = analyseGame(pts, 11);
    expect([g.a, g.b, g.complete]).toEqual([11, 8, true]);
    expect(g.momentumA).toBe('came-back');
    expect(g.momentumB).toBe('lost-lead');
    expect([g.fromA, g.fromB]).toEqual([3, 8]);
  });

  it('counts saving a game point as a comeback even without a big deficit', () => {
    // 9–10 down (B on game point), A wins the next three: 12–10.
    const pts = seq('ABABABABABABABABAB B A A A');
    const g = analyseGame(pts, 11);
    expect([g.a, g.b]).toEqual([12, 10]);
    expect(g.gamePointB).toBe(true);
    expect(g.momentumA).toBe('came-back');
    expect([g.fromA, g.fromB]).toEqual([9, 10]);
  });

  it('a 3-point deficit with no game point is not a comeback', () => {
    const pts = seq('BBB AAAAA BB AAAAAA');
    const g = analyseGame(pts, 11);
    expect(g.a).toBe(11);
    expect(g.momentumA).toBe('neither');
  });

  it('marks dominated wins: never behind by 2, opponent on 4 or fewer', () => {
    const g = analyseGame(seq('AAB AAB AAA AB AAA'), 11);
    expect([g.a, g.b]).toEqual([11, 3]);
    expect(g.momentumA).toBe('dominated');
    expect(g.momentumB).toBe('neither');
  });

  it('uses the bigger threshold for games to 21', () => {
    // A trails by 5 at most (2–7, 10–15) and wins 21–15: not a comeback in a game to 21.
    const pts = 'AA' + 'BBBBBBB' + 'AB'.repeat(8) + 'A'.repeat(11);
    const g = analyseGame(pts, 21);
    expect([g.a, g.b]).toEqual([21, 15]);
    expect(g.momentumA).toBe('neither');
  });

  it('leaves unfinished games as neither', () => {
    expect(analyseGame('AAAA', 11).complete).toBe(false);
  });
});

describe('tournament engine', () => {
  it('snake-seeds 20 players into 4 pools of 5', () => {
    const pools = snakePools(20, 4);
    expect(pools.slice(0, 8)).toEqual([1, 2, 3, 4, 4, 3, 2, 1]);
    for (let p = 1; p <= 4; p++) expect(pools.filter((x) => x === p)).toHaveLength(5);
  });

  it('round robin: everyone meets once, never twice in a round', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const rounds = roundRobinRounds(ids);
    const pairs = rounds.flat().map(([x, y]) => [x, y].sort().join(''));
    expect(new Set(pairs).size).toBe(15);
    for (const r of rounds) expect(new Set(r.flat()).size).toBe(r.length * 2);
    expect(roundRobinRounds(['a', 'b', 'c', 'd', 'e']).flat()).toHaveLength(10);
  });

  it('seeds by rating with unrated last', () => {
    expect(seedOrder([{ r: 3 }, { r: undefined }, { r: 4.2 }], (x) => x.r).map((x) => x.r)).toEqual([4.2, 3, undefined]);
  });

  const done = (id: string, a: string, b: string, games: [number, number][]): ClubMatch => ({
    id, clubId: 'c', stage: 'pool', entryA: a, entryB: b, sideA: [a], sideB: [b], format: { pointsTo: 11, bestOf: 1, scoring: 'sideout' },
    games: games.map(([x, y]) => ({ points: '', a: x, b: y })), status: 'done', winner: games[0][0] > games[0][1] ? 'A' : 'B', updatedAt: '2026-10-28',
  });

  it('pool table: wins, then head-to-head, then points difference', () => {
    // x, y, z all 2-1? Make x and y tied on wins with y beating x head-to-head.
    const ms = [done('1', 'x', 'y', [[5, 11]]), done('2', 'x', 'z', [[11, 0]]), done('3', 'y', 'z', [[9, 11]]), done('4', 'x', 'w', [[11, 2]]), done('5', 'y', 'w', [[11, 9]]), done('6', 'z', 'w', [[11, 9]])];
    const t = standings(['x', 'y', 'z', 'w'], ms);
    // x: 2 wins (z, w), y: 2 wins (x, w), z: 2 wins (y, w), w: 0. Three-way tie on wins and head-to-head 1 each → points difference.
    expect(t.map((r) => r.entryId)).toEqual(['x', 'y', 'z', 'w']);
    expect(t[0]).toMatchObject({ wins: 2, diff: (5 + 11 + 11) - (11 + 0 + 2) });
    const two = standings(['x', 'y'], [done('1', 'x', 'y', [[5, 11]])]);
    expect(two[0].entryId).toBe('y');
  });

  it('knockout pairs avoid same-pool first-round matches', () => {
    const q = [1, 2, 3, 4].flatMap((pool) => [1, 2].map((place) => ({ entryId: `${pool}-${place}`, pool, place })));
    const pairs = firstKnockoutPairs(q, () => 0);
    expect(pairs).toHaveLength(4);
    for (const [a, b] of pairs) expect(a.pool).not.toBe(b.pool);
    expect(pairs.every(([a, b]) => a.place === 1 && b.place === 2)).toBe(true);
    expect(() => firstKnockoutPairs(q.slice(0, 6), () => 0)).toThrow();
  });

  it('next knockout round from finished matches', () => {
    const qf = [0, 1, 2, 3].map((pos) => ({ ...done(`q${pos}`, `a${pos}`, `b${pos}`, [[11, 5]]), stage: 'qf' as const, bracketPos: pos }));
    expect(nextRoundPairs(qf)).toEqual([{ bracketPos: 0, entryA: 'a0', entryB: 'a1' }, { bracketPos: 1, entryA: 'a2', entryB: 'a3' }]);
    expect(nextRoundPairs([qf[0], { ...qf[1], status: 'live' }])).toEqual([]);
  });

  it('best of 3 result needs two games', () => {
    const m = { format: { pointsTo: 11 as const, bestOf: 3 as const, scoring: 'sideout' as const }, games: [{ points: '', a: 11, b: 8 }, { points: '', a: 6, b: 11 }] };
    expect(matchResult(m).winner).toBeUndefined();
    expect(matchResult({ ...m, games: [...m.games, { points: '', a: 13, b: 11 }] }).winner).toBe('A');
  });

  it('schedules on the given courts with nobody playing twice in a slot', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ key: String(i), playerIds: [`p${i % 4}`, `q${i}`] }));
    const plan = scheduleSlots(items, 3);
    const bySlot = new Map<number, string[]>();
    for (const [k, v] of plan) bySlot.set(v.slot, [...(bySlot.get(v.slot) ?? []), k]);
    for (const keys of bySlot.values()) {
      expect(keys.length).toBeLessThanOrEqual(3);
      const players = keys.flatMap((k) => items[Number(k)].playerIds);
      expect(new Set(players).size).toBe(players.length);
    }
    expect(plan.size).toBe(10);
    expect(slotTime('08:00', 4, 20)).toBe('09:20');
  });

  it('plans pool matches interleaved by round', () => {
    const entries = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, divisionId: 'd', clubId: 'c', playerIds: [id], pool: (i % 2) + 1 }));
    const plan = planPoolMatches(entries);
    expect(plan).toHaveLength(2);
    expect(plan.map((p) => p.pool)).toEqual([1, 2]);
  });
});

describe('simulation', () => {
  it('always finishes a game with a 2-point margin', () => {
    const r = rng(1);
    for (let i = 0; i < 50; i++) {
      const g = simulateGame(3.5, 3.6, 11, r);
      expect(Math.max(g.a, g.b)).toBeGreaterThanOrEqual(11);
      expect(Math.abs(g.a - g.b)).toBeGreaterThanOrEqual(2);
      expect(g.points.length).toBe(g.a + g.b);
    }
  });
});

describe('PQ Demo Club sample club', () => {
  const s = buildSampleClub('owner-1', 'Vineeth', new Date('2026-10-28T09:00:00'));
  const pmap = new Map(s.players.map((p) => [p.id, p]));

  it('has 56 players, 20 singles entries and 24 doubles teams in 4 pools each', () => {
    expect(s.players).toHaveLength(56);
    const [singles, doubles] = s.divisions;
    const se = s.entries.filter((e) => e.divisionId === singles.id), de = s.entries.filter((e) => e.divisionId === doubles.id);
    expect(se).toHaveLength(20);
    expect(de).toHaveLength(24);
    expect(de.every((e) => e.playerIds.length === 2)).toBe(true);
    for (let p = 1; p <= 4; p++) {
      expect(se.filter((e) => e.pool === p)).toHaveLength(5);
      expect(de.filter((e) => e.pool === p)).toHaveLength(6);
    }
  });

  it('plays every pool match and the singles knockouts; doubles semi-finals are still to play', () => {
    const [singles, doubles] = s.divisions;
    const pool = s.matches.filter((m) => m.stage === 'pool');
    expect(pool.filter((m) => m.divisionId === singles.id)).toHaveLength(40);
    expect(pool.filter((m) => m.divisionId === doubles.id)).toHaveLength(60);
    expect(pool.every((m) => m.status === 'done')).toBe(true);
    const sKo = s.matches.filter((m) => m.divisionId === singles.id && m.stage !== 'pool');
    expect(sKo.map((m) => m.stage).sort()).toEqual(['final', 'qf', 'qf', 'qf', 'qf', 'sf', 'sf']);
    expect(sKo.every((m) => m.status === 'done')).toBe(true);
    const dKo = s.matches.filter((m) => m.divisionId === doubles.id && m.stage !== 'pool');
    expect(dKo.filter((m) => m.stage === 'qf' && m.status === 'done')).toHaveLength(4);
    expect(dKo.filter((m) => m.stage === 'sf' && m.status === 'scheduled')).toHaveLength(2);
    expect(s.matches.filter((m) => m.stage === 'friendly')).toHaveLength(40);
  });

  it('never double-books a player or a court in a time slot', () => {
    const t = s.matches.filter((m) => m.tournamentId && m.slot !== undefined);
    const bySlot = new Map<number, ClubMatch[]>();
    for (const m of t) bySlot.set(m.slot as number, [...(bySlot.get(m.slot as number) ?? []), m]);
    for (const ms of bySlot.values()) {
      expect(ms.length).toBeLessThanOrEqual(6);
      expect(new Set(ms.map((m) => m.court)).size).toBe(ms.length);
      const ps = ms.flatMap((m) => [...m.sideA, ...m.sideB]);
      expect(new Set(ps).size).toBe(ps.length);
    }
  });

  it('is the same every time it is built', () => {
    expect(buildSampleClub('owner-1', 'Vineeth', new Date('2026-10-28T09:00:00')).matches.map((m) => m.games)).toEqual(s.matches.map((m) => m.games));
  });

  it('gives coaches comebacks, lost leads and flags to look at', () => {
    const rows = squadTable(s.players, s.matches);
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.reduce((n, r) => n + r.comebacks, 0)).toBeGreaterThan(5);
    expect(rows.reduce((n, r) => n + r.lostLeads, 0)).toBeGreaterThan(5);
    const you = playerClubStats(s.youPlayerId, s.matches, pmap);
    expect(you.matches).toBeGreaterThanOrEqual(10);
    expect(you.trackedGames).toBeGreaterThan(0);
    const allFlags = s.players.flatMap((p) => playerFlags(playerClubStats(p.id, s.matches, pmap)));
    expect(allFlags.some((f) => f.kind === 'watch')).toBe(true);
    expect(allFlags.some((f) => f.kind === 'strength')).toBe(true);
  });
});

describe('club matches into your personal PaddleQ', () => {
  const players = new Map<string, ClubPlayer>([
    ['me', { id: 'me', clubId: 'c', name: 'Vineeth', duprDoubles: 3.8, share: {} }],
    ['pa', { id: 'pa', clubId: 'c', name: 'Dev Rao', duprDoubles: 3.6, share: {} }],
    ['o1', { id: 'o1', clubId: 'c', name: 'Ira Sen', duprDoubles: 4.1, share: {} }],
    ['o2', { id: 'o2', clubId: 'c', name: 'Om Das', share: {} }],
  ]);
  const m: ClubMatch = {
    id: 'm1', clubId: 'c', stage: 'sf', sideA: ['o1', 'o2'], sideB: ['me', 'pa'], format: { pointsTo: 11, bestOf: 1, scoring: 'sideout' },
    games: [{ points: 'AAAAAAAA' + 'BBBBBBBBBBB', a: 8, b: 11 }], status: 'done', winner: 'B', playedOn: '2026-10-28', updatedAt: '2026-10-28T10:00:00Z',
  };

  it('flips to your side, keeps ratings, and carries the automatic comeback', () => {
    // A led 8–0, B won 11 straight → B (you) came back from 0–8.
    const p = clubMatchToPersonal(m, 'me', players, 'PQ Demo Club', 'PQ Demo Open')!;
    expect(p.won).toBe(true);
    expect(p.type).toBe('doubles');
    expect(p.category).toBe('tournament');
    expect(p.games[0]).toEqual({ you: 11, them: 8, momentum: 'came-back', fromYou: 0, fromThem: 8 });
    expect(p.participants).toEqual([
      { name: 'Dev Rao', role: 'partner', rating: 3.6 },
      { name: 'Ira Sen', role: 'opponent', rating: 4.1 },
      { name: 'Om Das', role: 'opponent' },
    ]);
    expect(p.club).toEqual({ matchId: 'm1', clubName: 'PQ Demo Club' });
    expect(p.notes).toBe('PQ Demo Open · Semi-final');
  });

  it('ignores matches you did not play or that are not finished', () => {
    expect(clubMatchToPersonal(m, 'nobody', players, 'X', undefined)).toBeNull();
    expect(clubMatchToPersonal({ ...m, status: 'live' }, 'me', players, 'X', undefined)).toBeNull();
  });

  it('finds the biggest swing', () => {
    expect(biggest([{ matchId: 'a', me: 3, them: 8, game: 1 }, { matchId: 'b', me: 1, them: 9, game: 1 }])?.matchId).toBe('b');
  });
});
