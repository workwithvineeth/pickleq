import { describe, expect, it } from 'vitest';
import { checkFinalScore, gameOver } from './domain/momentum';
import { matchResult } from './domain/engine';
import { rng, simulateGame } from './domain/simulate';
import { DUPR_HEADER, duprCheck, duprCsv } from './dupr';
import { buildTournamentRows, courtBoard, nextMatchToCall, planLateEntry, planReplacePlayer, planWithdraw, upNext, type NewDivisionInput } from './plan';
import type { ClubMatch, ClubPlayer } from './types';

let n = 0;
const id = () => `id-${++n}`;
const player = (i: number, extra: Partial<ClubPlayer> = {}): ClubPlayer => ({ id: `p${i}`, clubId: 'c', name: `Player ${i}`, duprSingles: 3 + i / 10, duprDoubles: 3 + i / 10, share: {}, ...extra });

function event(count: number, pools: number, advance: number, golden = true) {
  const players = Array.from({ length: count }, (_, i) => player(i + 1));
  const pmap = new Map(players.map((p) => [p.id, p]));
  const fmt = { pointsTo: 11 as const, bestOf: 1 as const, scoring: 'sideout' as const, golden };
  const div: NewDivisionInput = { name: 'Open Singles', kind: 'singles', format: fmt, koFormat: { ...fmt, bestOf: 3 }, pools, advance, entries: players.map((p) => [p.id]) };
  const rows = buildTournamentRows({ clubId: 'c', name: 'Test Open', startDate: '2026-11-01', startTime: '08:00', courts: 2, slotMinutes: 20, divisions: [div] }, pmap, id);
  const matches: ClubMatch[] = rows.matches.map((m) => ({ ...m, updatedAt: '' }));
  return { ...rows, matches, players, pmap };
}
const finish = (m: ClubMatch, a = 11, b = 5): ClubMatch => ({ ...m, status: 'done', games: [{ points: '', a, b }], winner: a > b ? 'A' : 'B' });

describe('golden point or win by 2', () => {
  it('golden point ends a game at exactly the target, even from 10–10', () => {
    expect(gameOver(11, 10, 11, true)).toBe(true);
    expect(gameOver(11, 10, 11, false)).toBe(false);
    expect(gameOver(12, 10, 11, false)).toBe(true);
  });
  it('checks typed final scores against the event’s rule', () => {
    expect(checkFinalScore(11, 10, 11, true)).toBeNull();
    expect(checkFinalScore(12, 10, 11, true)).toMatch(/exactly 11/);
    expect(checkFinalScore(11, 10, 11, false)).toMatch(/won by 2/);
    expect(checkFinalScore(14, 12, 11, false)).toBeNull();
    expect(checkFinalScore(15, 12, 11, false)).toMatch(/exactly 2/);
    expect(checkFinalScore(9, 7, 11, false)).toMatch(/needs 11/);
  });
  it('simulated golden-point games never go past the target', () => {
    const r = rng(7);
    for (let i = 0; i < 300; i++) {
      const g = simulateGame(3.5, 3.5, 11, r, true);
      expect(Math.max(g.a, g.b)).toBe(11);
    }
  });
  it('a match result follows the golden rule', () => {
    const f = { pointsTo: 11 as const, bestOf: 1 as const, scoring: 'sideout' as const, golden: true };
    expect(matchResult({ games: [{ points: '', a: 10, b: 11 }], format: f }).winner).toBe('B');
    expect(matchResult({ games: [{ points: '', a: 10, b: 11 }], format: { ...f, golden: false } }).winner).toBeUndefined();
  });
});

describe('changing entries after the draw', () => {
  it('withdrawing cancels unplayed pool matches and keeps played ones', () => {
    const t = event(8, 2, 2);
    const e = t.entries[0];
    const mine = t.matches.filter((m) => m.entryA === e.id || m.entryB === e.id);
    const matches = t.matches.map((m) => (m.id === mine[0].id ? finish(m) : m));
    const plan = planWithdraw(e.id, matches);
    expect(plan.voidIds).toHaveLength(mine.length - 1);
    expect(plan.voidIds).not.toContain(mine[0].id);
    expect(plan.walkovers).toHaveLength(0);
  });

  it('withdrawing from the knockouts gives the opponent a walkover', () => {
    const ko: ClubMatch = { id: 'k', clubId: 'c', stage: 'sf', round: 1, bracketPos: 0, entryA: 'x', entryB: 'y', sideA: ['p1'], sideB: ['p2'], format: { pointsTo: 11, bestOf: 3, scoring: 'sideout' }, games: [], status: 'scheduled', updatedAt: '' };
    expect(planWithdraw('x', [ko]).walkovers).toEqual([{ id: 'k', winner: 'B' }]);
    expect(planWithdraw('y', [ko]).walkovers).toEqual([{ id: 'k', winner: 'A' }]);
  });

  it('replacing a player changes only matches not yet played', () => {
    const t = event(6, 1, 0);
    const e = t.entries[0];
    const mine = t.matches.filter((m) => m.entryA === e.id || m.entryB === e.id);
    const matches = t.matches.map((m) => (m.id === mine[0].id ? finish(m) : m));
    const plan = planReplacePlayer(e, e.playerIds[0], 'sub', matches);
    if (typeof plan === 'string') throw new Error(plan);
    expect(plan.playerIds).toEqual(['sub']);
    expect(plan.matchSides).toHaveLength(mine.length - 1);
    for (const s of plan.matchSides) expect([...s.sideA, ...s.sideB]).toContain('sub');
    expect(planReplacePlayer(e, 'nobody', 'sub', matches)).toMatch(/isn’t in this entry/);
    expect(planReplacePlayer(e, e.playerIds[0], e.playerIds[0], matches)).toMatch(/different player/);
  });

  it('a late entry joins the smallest pool, plays everyone in it, after the booked slots, never double-booked', () => {
    const t = event(7, 2, 2); // pools of 4 and 3
    const div = t.divisions[0];
    const res = planLateEntry(t.tournament, div, ['late'], t.entries, t.matches, id);
    if (typeof res === 'string') throw new Error(res);
    const smallest = t.entries.filter((e) => e.pool === 2).length < t.entries.filter((e) => e.pool === 1).length ? 2 : 1;
    expect(res.entry.pool).toBe(smallest);
    expect(res.matches).toHaveLength(3);
    const last = Math.max(...t.matches.map((m) => m.slot ?? 0));
    for (const m of res.matches) expect(m.slot).toBeGreaterThan(last);
    const slots = res.matches.map((m) => m.slot);
    expect(new Set(slots).size).toBe(slots.length); // the late player is never in two matches at once
  });

  it('refuses a late entry for someone already entered, or once knockouts have started', () => {
    const t = event(8, 2, 2);
    expect(planLateEntry(t.tournament, t.divisions[0], [t.entries[0].playerIds[0]], t.entries, t.matches, id)).toMatch(/already entered/);
    const ko = { ...t.matches[0], id: 'ko', stage: 'sf' as const };
    expect(planLateEntry(t.tournament, t.divisions[0], ['new'], t.entries, [...t.matches, ko], id)).toMatch(/Knockouts have started/);
  });
});

describe('desk view', () => {
  it('shows what each court is playing now and next', () => {
    const t = event(6, 1, 0);
    const first = [...t.matches].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.court ?? 0) - (b.court ?? 0));
    const live = { ...first[0], status: 'live' as const };
    const matches = t.matches.map((m) => (m.id === live.id ? live : m));
    const board = courtBoard(matches, 2);
    expect(board).toHaveLength(2);
    expect(board.find((c) => c.court === live.court)?.now?.id).toBe(live.id);
    expect(board.every((c) => c.next)).toBe(true);
    expect(upNext(matches, 3)).toHaveLength(3);
  });

  it('calls the next match whose players are free, not someone already on court', () => {
    const t = event(6, 1, 0);
    const sorted = [...t.matches].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.court ?? 0) - (b.court ?? 0));
    const live = { ...sorted[0], status: 'live' as const };
    const matches = t.matches.map((m) => (m.id === live.id ? live : m));
    const call = nextMatchToCall(matches);
    expect(call).toBeDefined();
    const busy = new Set([...live.sideA, ...live.sideB]);
    expect([...(call as ClubMatch).sideA, ...(call as ClubMatch).sideB].some((p) => busy.has(p))).toBe(false);
  });
});

describe('DUPR export', () => {
  const t = event(4, 1, 0);
  const withIds = new Map<string, ClubPlayer>(t.players.map((p) => [p.id, { ...p, duprId: `D${p.id.toUpperCase()}` }]));

  it('only exports finished matches with real scores where everyone has a DUPR ID', () => {
    const [m1, m2, m3] = t.matches;
    const walkover: ClubMatch = { ...m3, status: 'done', winner: 'A', games: [] };
    const matches = [finish(m1, 11, 9), finish(m2, 8, 11), walkover, ...t.matches.slice(3)];
    const noIdFor = new Map(withIds);
    noIdFor.set(m2.sideA[0], { ...(withIds.get(m2.sideA[0]) as ClubPlayer), duprId: undefined });
    const c = duprCheck(matches, noIdFor);
    expect(c.ready.map((m) => m.id)).toEqual([m1.id]);
    expect(c.missingIds.map((m) => m.id)).toEqual([m2.id]);
    expect(c.playersMissing.map((p) => p.id)).toEqual([m2.sideA[0]]);
    expect(c.noScores).toBe(1);
    expect(c.unfinished).toBe(t.matches.length - 3);
  });

  it('writes one row per match in DUPR’s column order, escaping commas', () => {
    const m = finish(t.matches[0], 11, 9);
    const pmap = new Map(withIds);
    const a = pmap.get(m.sideA[0]) as ClubPlayer;
    pmap.set(a.id, { ...a, name: 'Smith, Jo' });
    const csv = duprCsv({ ...t.tournament }, t.divisions, [m], pmap);
    const [head, row] = csv.trim().split('\r\n');
    expect(head).toBe(DUPR_HEADER.join(','));
    expect(row.startsWith('S,SIDEOUT,Test Open · Open Singles,2026-11-01,"Smith, Jo",')).toBe(true);
    expect(row).toContain(',11,9,');
  });
});
