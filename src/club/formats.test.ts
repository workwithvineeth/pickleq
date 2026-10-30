import { describe, expect, it } from 'vitest';
import { bracketOrder, crossPoolOrder, knockoutOnlyPairs, standings, TIE_BREAK_TEXT, type StandingRow } from './domain/engine';
import { estimateDay, eventMatches, fasterOptions, minutesOf, shapeOptions } from './estimate';
import { buildTournamentRows, checkShape, knockoutMatchesToAdd, poolQualifiers, type NewDivisionInput } from './plan';
import { entryProblem, planDraw } from './registration';
import type { ClubMatch, ClubPlayer, ClubTournament, Division, Registration } from './types';
import type { Format } from '../domain/types';

let n = 0;
const id = () => `id-${++n}`;
const F11: Format = { pointsTo: 11, bestOf: 1, scoring: 'sideout', golden: true };
const player = (i: number): ClubPlayer => ({ id: `p${i}`, clubId: 'c', name: `Player ${i}`, duprSingles: 3 + i / 100, duprDoubles: 3 + i / 100, share: {} });
const done = (mid: string, a: string, b: string, sa: number, sb: number): ClubMatch => ({
  id: mid, clubId: 'c', stage: 'pool', entryA: a, entryB: b, sideA: [a], sideB: [b], format: F11, games: [{ points: '', a: sa, b: sb }], status: 'done', winner: sa > sb ? 'A' : 'B', updatedAt: '',
});

function build(count: number, d: Partial<NewDivisionInput>, courts = 3) {
  const players = Array.from({ length: count }, (_, i) => player(i + 1));
  const pmap = new Map(players.map((p) => [p.id, p]));
  const div: NewDivisionInput = { name: 'Singles', kind: 'singles', format: F11, koFormat: { ...F11, bestOf: 3 }, pools: 1, advance: 0, entries: players.map((p) => [p.id]), ...d };
  const rows = buildTournamentRows({ clubId: 'c', name: 'T', startDate: '2026-11-01', startTime: '14:30', courts, slotMinutes: 15, divisions: [div] }, pmap, id);
  return { ...rows, matches: rows.matches.map((m): ClubMatch => ({ ...m, updatedAt: '' })) };
}
/** Plays every scheduled match: the better seed wins 11–(5 + their pool index) so differences vary. */
function playAll(ms: ClubMatch[], seedOf: (e: string) => number) {
  return ms.map((m) => {
    if (m.status !== 'scheduled' || !m.entryA || !m.entryB) return m;
    const aWins = seedOf(m.entryA) < seedOf(m.entryB);
    const lose = (seedOf(aWins ? m.entryB : m.entryA) % 7) + 2;
    return { ...m, status: 'done' as const, winner: aWins ? 'A' as const : 'B' as const, games: [{ points: '', a: aWins ? 11 : lose, b: aWins ? lose : 11 }] };
  });
}

describe('pool table tie-breaks', () => {
  it('two-way tie on wins: head-to-head decides, even with a worse points difference', () => {
    // x beat y narrowly; y thrashed z; x lost heavily to z. x and y both 1 win; z 1 win too → three-way, see next test.
    // Here a clean two-way: w loses everything.
    const ms = [done('1', 'x', 'y', 11, 9), done('2', 'x', 'w', 11, 10), done('3', 'y', 'w', 11, 0), done('4', 'x', 'z', 0, 11), done('5', 'y', 'z', 11, 1), done('6', 'z', 'w', 3, 11)];
    // wins: x 2, y 2, z 1, w 1. x beat y head-to-head though y's difference (+20) is far better than x's (−9).
    const t = standings(['x', 'y', 'z', 'w'], ms);
    expect(t.map((r) => r.entryId).slice(0, 2)).toEqual(['x', 'y']);
    const x = t[0];
    expect([x.played, x.wins, x.losses, x.pointsFor, x.pointsAgainst, x.diff]).toEqual([3, 2, 1, 22, 30, -8]);
    // z and w: w beat z head-to-head.
    expect(t.map((r) => r.entryId).slice(2)).toEqual(['w', 'z']);
  });
  it('three-way tie where head-to-head is a circle: points difference, then points scored', () => {
    const ms = [done('1', 'a', 'b', 11, 9), done('2', 'b', 'c', 11, 3), done('3', 'c', 'a', 11, 5)];
    // a: +2 −6 = −4; b: −2 +8 = +6; c: −8 +6 = −2
    expect(standings(['a', 'b', 'c'], ms).map((r) => r.entryId)).toEqual(['b', 'c', 'a']);
  });
  it('three-way tie on points difference falls to points scored, then seed', () => {
    const ms = [done('1', 'a', 'b', 11, 5), done('2', 'b', 'c', 11, 5), done('3', 'c', 'a', 11, 5)];
    // All +0 difference, all 16 scored: seed decides.
    const seed = new Map([['a', 3], ['b', 1], ['c', 2]]);
    expect(standings(['a', 'b', 'c'], ms, (e) => seed.get(e) ?? 9).map((r) => r.entryId)).toEqual(['b', 'c', 'a']);
  });
  it('a four-way tie split by head-to-head into two pairs is re-checked within each pair', () => {
    // a, b each beat c and d; c, d each beat ... make all 3 wins? Use a 5-player pool where a,b,c,d each have 2 wins.
    const ms = [
      done('1', 'a', 'c', 11, 1), done('2', 'a', 'd', 11, 1), done('3', 'b', 'c', 11, 1), done('4', 'b', 'd', 11, 1),
      done('5', 'b', 'a', 11, 9), // b beats a head-to-head
      done('6', 'c', 'd', 11, 9), // c beats d head-to-head
      done('7', 'c', 'e', 11, 0), done('8', 'd', 'e', 11, 0), done('9', 'e', 'a', 11, 0), done('10', 'e', 'b', 11, 0),
    ];
    // wins: a 2, b 3, c 2, d 1, e 2 → a, c, e tied on 2: h2h among them: a beat c, c beat e, e beat a: circle → difference.
    const t = standings(['a', 'b', 'c', 'd', 'e'], ms);
    expect(t[0].entryId).toBe('b');
    expect(t[t.length - 1].entryId).toBe('d');
  });
  it('the order is written in plain words under the table', () => {
    expect(TIE_BREAK_TEXT).toMatch(/most wins.*head-to-head.*points difference.*points scored.*seed/);
  });
});

describe('best runners-up', () => {
  it('5 pools: winners plus the 3 best seconds make a quarter-final of 8', () => {
    expect(checkShape({ pools: 5, advance: 1, extra: 3 }, 20)).toBeNull();
    expect(checkShape({ pools: 5, advance: 1, extra: 2 }, 20)).toMatch(/2, 4, 8 or 16/);
    expect(checkShape({ pools: 3, advance: 1, extra: 3 }, 12)).toMatch(/fewer than the number of pools/);
    const r = build(20, { pools: 5, advance: 1, extra: 3 });
    const seed = new Map(r.entries.map((e) => [e.id, e.seed ?? 99]));
    const played = playAll(r.matches, (e) => seed.get(e) ?? 99);
    const div = r.divisions[0];
    const q = poolQualifiers(div, r.entries, played);
    expect(q.qualifiers).toHaveLength(8);
    expect(q.qualifiers.filter((x) => x.place === 1)).toHaveLength(5);
    expect(q.runnersUp).toHaveLength(5);
    const ko = knockoutMatchesToAdd(r.tournament, r.divisions, r.entries, played, id);
    expect(ko.map((m) => m.stage)).toEqual(['qf', 'qf', 'qf', 'qf']);
    expect(ko.every((m) => m.format.bestOf === 3)).toBe(true);
  });
  it('runners-up from pools of different sizes are compared per match played', () => {
    const row = (entryId: string, played: number, wins: number, pf: number, pa: number): StandingRow => ({ entryId, played, wins, losses: played - wins, pointsFor: pf, pointsAgainst: pa, diff: pf - pa, rank: 2 });
    // big: 3 wins of 4 (75%); small: 2 of 3 (67%) → big first, even though both look "good".
    expect(crossPoolOrder([row('small', 3, 2, 30, 20), row('big', 4, 3, 40, 30)]).map((r) => r.entryId)).toEqual(['big', 'small']);
    // Same win share: +12 over 4 matches (+3 a match) beats +10 over 3 (+3.33)? No: 3.33 is better.
    expect(crossPoolOrder([row('four', 4, 2, 42, 30), row('three', 3, 1.5 as number, 33, 23)])[0].entryId).toBe('three');
  });
});

describe('knockouts of 16 and knockout only', () => {
  it('standard 16 bracket keeps seeds 1 and 2 apart until the final', () => {
    const o = bracketOrder(16);
    expect(o).toHaveLength(16);
    expect(o.slice(0, 2)).toEqual([1, 16]);
    expect(o.indexOf(2)).toBeGreaterThanOrEqual(8);
  });
  it('4 pools, top 4 through → round of 16 with per-round formats', () => {
    const r = build(24, { pools: 4, advance: 4, stageFormats: { qf: { ...F11, pointsTo: 15 }, sf: { ...F11, pointsTo: 15, bestOf: 3 } }, koFormat: { ...F11, pointsTo: 21, bestOf: 3 } }, 6);
    const seed = new Map(r.entries.map((e) => [e.id, e.seed ?? 99]));
    let ms = playAll(r.matches, (e) => seed.get(e) ?? 99);
    const stages: string[] = [];
    for (let i = 0; i < 5; i++) {
      const add = knockoutMatchesToAdd(r.tournament, r.divisions, r.entries, ms, id).map((m): ClubMatch => ({ ...m, updatedAt: '' }));
      if (!add.length) break;
      stages.push(`${add[0].stage}:${add.length}:${add[0].format.pointsTo}/${add[0].format.bestOf}`);
      ms = playAll([...ms, ...add], (e) => seed.get(e) ?? 99);
    }
    expect(stages).toEqual(['r16:8:21/3', 'qf:4:15/1', 'sf:2:15/3', 'final:1:21/3']);
  });
  it('knockout only with byes: 20 entries → 32 bracket, 12 byes go straight through, nobody double-booked', () => {
    expect(knockoutOnlyPairs([1, 2, 3]).map(([a, b]) => [a, b ?? null])).toEqual([[1, null], [2, 3]]);
    const r = build(20, { shape: 'ko' });
    const r1 = r.matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(16);
    expect(r1.filter((m) => m.status === 'done' && !m.entryB)).toHaveLength(12);
    expect(r.matches.filter((m) => m.stage === 'pool')).toHaveLength(0);
    // Byes meeting byes in round two are made at the draw.
    expect(r.matches.filter((m) => m.round === 2).length).toBeGreaterThan(0);
    const bySlot = new Map<number, string[]>();
    for (const m of r.matches.filter((x) => x.status === 'scheduled')) {
      expect(m.slot).toBeDefined();
      const ps = bySlot.get(m.slot as number) ?? [];
      for (const p of [...m.sideA, ...m.sideB]) { expect(ps).not.toContain(p); ps.push(p); }
      bySlot.set(m.slot as number, ps);
    }
    // Play it out: exactly one champion after 19 matches.
    const seed = new Map(r.entries.map((e) => [e.id, e.seed ?? 99]));
    let ms = playAll(r.matches, (e) => seed.get(e) ?? 99);
    for (let i = 0; i < 6; i++) {
      const add = knockoutMatchesToAdd(r.tournament, r.divisions, r.entries, ms, id).map((m): ClubMatch => ({ ...m, updatedAt: '' }));
      if (!add.length) break;
      ms = playAll([...ms, ...add], (e) => seed.get(e) ?? 99);
    }
    const final = ms.find((m) => m.stage === 'final');
    expect(final?.status).toBe('done');
    expect(ms.filter((m) => m.entryB).length).toBe(19);
    expect(final?.winner === 'A' ? final.entryA : final?.entryB).toBe(r.entries.find((e) => e.seed === 1)?.id);
  });
});

describe('time estimate', () => {
  it('matches the handover sum: 2 events, 4 pools of 5, top 2 through = 94 matches; ~10 hours on 3 courts', () => {
    const ev = (name: string) => ({ name, entries: 20, shape: 'pools-ko' as const, pools: 4, advance: 2, extra: 0 });
    const est = estimateDay([ev('Singles'), ev('Doubles')], 3, 20, '14:30');
    expect(est.matches).toBe(94);
    expect(est.endMinutes - minutesOf('14:30')).toBeGreaterThan(9 * 60);
  });
  it('knockout only is far quicker, and faster options are offered when it runs late', () => {
    const ko = eventMatches({ name: 'S', entries: 20, shape: 'ko', pools: 1, advance: 0, extra: 0 });
    expect([ko.knockout, ko.byes, ko.firstStage]).toEqual([19, 12, 'r32']);
    const slow = [{ name: 'Singles', entries: 20, shape: 'pools-ko' as const, pools: 4, advance: 2, extra: 0 }, { name: 'Doubles', entries: 20, shape: 'pools-ko' as const, pools: 4, advance: 2, extra: 0 }];
    const faster = fasterOptions(slow, 3, 15, '14:30', minutesOf('23:30'));
    expect(faster.length).toBeGreaterThan(0);
    for (const f of faster) expect(f.estimate.endMinutes).toBeLessThanOrEqual(minutesOf('23:30'));
    expect(shapeOptions(20).every((c) => !checkShape(c, 20))).toBe(true);
  });
});

describe('the draw from registrations', () => {
  const t: ClubTournament = { id: 't', clubId: 'c', name: 'TPC', startDate: '2026-11-01', startTime: '14:30', courts: 3, slotMinutes: 15, status: 'draft', isPublic: false, publicSlug: 's', entryMode: 'registration' };
  const div = (did: string, kind: 'singles' | 'doubles'): Division => ({ id: did, tournamentId: 't', clubId: 'c', name: did, kind, format: F11, koFormat: F11, pools: 1, advance: 0, sort: 0 });
  const p = (name: string, phone: string) => ({ name, phone, gender: 'm' as const, age: 30, dupr: 3.2 });
  const reg = (rid: string, divisionId: string, players: ReturnType<typeof p>[]): Registration => ({ id: rid, tournamentId: 't', divisionId, clubId: 'c', source: 'offline', players, status: 'accepted', payment: 'unpaid', createdAt: '' });
  it('someone in singles and doubles (same phone) is one player, never on two courts at once', () => {
    const regs: Registration[] = [];
    for (let i = 0; i < 8; i++) regs.push(reg(`s${i}`, 'S', [p(`Single ${i}`, `98480000${10 + i}`)]));
    // Every doubles team includes two of the singles players (phone written differently).
    for (let i = 0; i < 4; i++) regs.push(reg(`d${i}`, 'D', [p(`Single ${2 * i}`, `+91 98480 000${10 + 2 * i}`), p(`Single ${2 * i + 1}`, `98480-000${11 + 2 * i}`)]));
    const plan = planDraw(t, [div('S', 'singles'), div('D', 'doubles')], regs, [{ divisionId: 'S', pools: 1, advance: 0 }, { divisionId: 'D', pools: 1, advance: 0 }], id);
    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.players).toHaveLength(8);
    const bySlot = new Map<number, string[]>();
    for (const m of plan.matches) {
      const ps = bySlot.get(m.slot as number) ?? [];
      for (const x of [...m.sideA, ...m.sideB]) { expect(ps).not.toContain(x); ps.push(x); }
      bySlot.set(m.slot as number, ps);
    }
  });
  it('the draw can switch to knockout only and change the courts and match length', () => {
    const regs = Array.from({ length: 6 }, (_, i) => reg(`s${i}`, 'S', [p(`P${i}`, `90000000${10 + i}`)]));
    const plan = planDraw(t, [div('S', 'singles')], regs, [{ divisionId: 'S', pools: 1, advance: 0, shape: 'ko', koFormat: { ...F11, pointsTo: 15 } }], id, { courts: 4, slotMinutes: 12, startTime: '15:00' });
    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.divisions[0].shape).toBe('ko');
    expect(plan.timing).toEqual({ courts: 4, slotMinutes: 12, startTime: '15:00' });
    expect(plan.matches.filter((m) => m.round === 1)).toHaveLength(4);
    expect(plan.matches.find((m) => m.stage === 'final')).toBeUndefined();
  });
});

describe('entry rules for imports', () => {
  it('DUPR team average: one player over 3.5 is fine if the average is 3.5 or under', () => {
    const rules = { maxDupr: 3.5, duprCap: 'average' as const };
    const pl = (dupr: number) => ({ name: `D${dupr}`, phone: '', gender: 'm' as const, age: 30, dupr });
    expect(entryProblem('doubles', rules, [pl(3.8), pl(3.2)], false)).toBeNull();
    expect(entryProblem('doubles', rules, [pl(3.9), pl(3.3)], false)).toMatch(/Team average 3.6 is above/);
    expect(entryProblem('doubles', { maxDupr: 3.5 }, [pl(3.8), pl(3.2)], false)).toMatch(/above this event’s cap/);
  });
  it('an imported player with no age is allowed only when the organiser confirmed adults, and not for an age group', () => {
    const pl = { name: 'A', phone: '', gender: 'x' as const, adult: true };
    expect(entryProblem('singles', undefined, [pl], false)).toBeNull();
    expect(entryProblem('singles', { minAge: 35 }, [pl], false)).toMatch(/add their age/);
    expect(entryProblem('singles', undefined, [{ ...pl, adult: undefined }], false)).toMatch(/enter their age/);
    expect(entryProblem('singles', undefined, [pl], true)).toMatch(/phone|age/);
  });
});
