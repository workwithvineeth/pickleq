import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT, type Match } from './types';
import { checkOtherResult, checkTournament, decodeLink, encodeLink, eventSummary, ME, nextSlot, nextTournament, standings, when, whenLabel, type Tournament, type TournamentEvent } from './tournaments';

const ev = (over: Partial<TournamentEvent> = {}): TournamentEvent => ({
  id: 'e1', name: 'Men’s doubles 4.0', type: 'doubles', format: DEFAULT_FORMAT, structure: 'pools-knockout',
  teams: [{ id: 'a', name: 'Arjun / Ravi' }, { id: 'b', name: 'Kiran / Dev' }, { id: 'c', name: 'Sam / Joe' }],
  otherResults: [], schedule: [], ...over,
});
let n = 0;
const match = (you: number, them: number, teamId?: string, extra: Partial<Match> = {}): Match => ({
  id: `m${++n}`, date: '2026-11-07', type: 'doubles', category: 'tournament', format: DEFAULT_FORMAT, participants: [], outcome: 'played',
  games: [{ you, them, momentum: 'neither' }], won: you > them, status: 'complete', backfilled: false, tags: {}, createdAt: n, updatedAt: n, history: [],
  tournament: { tournamentId: 't1', eventId: 'e1', stage: 'pool', teamId }, ...extra,
});

describe('pool standings', () => {
  it('counts your matches automatically and marks the table partial', () => {
    const s = standings(ev(), [match(11, 5, 'a'), match(9, 11, 'b')]);
    expect(s.entered).toBe(2);
    expect(s.total).toBe(6);
    expect(s.complete).toBe(false);
    const me = s.rows.find((r) => r.teamId === ME)!;
    expect(me).toMatchObject({ played: 2, won: 1, lost: 1, pointsFor: 20, pointsAgainst: 16, diff: 4 });
  });

  it('ranks a full pool by wins, then head-to-head between two tied teams', () => {
    const e = ev({ otherResults: [
      { id: 'r1', teamA: 'a', teamB: 'b', games: [{ a: 11, b: 2 }] },
      { id: 'r2', teamA: 'a', teamB: 'c', games: [{ a: 11, b: 9 }] },
      { id: 'r3', teamA: 'b', teamB: 'c', games: [{ a: 11, b: 4 }] },
    ] });
    // You beat b and c, lose to a: you 2-1, a 2-1 (beat you), b 1-2, c 0-3.
    const s = standings(e, [match(4, 11, 'a'), match(11, 9, 'b'), match(11, 3, 'c')]);
    expect(s.complete).toBe(true);
    expect(s.rows.map((r) => r.teamId)).toEqual(['a', ME, 'b', 'c']);
    expect(s.rows[0].rank).toBe(1);
  });

  it('breaks a three-way tie on point difference between the tied teams', () => {
    const e = ev({ teams: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], otherResults: [{ id: 'r', teamA: 'a', teamB: 'b', games: [{ a: 11, b: 9 }] }] });
    // Circle: you beat a by 10, a beats b by 2, b beats you by 5. All 1-1. Diffs: you +5, a -8, b +3.
    const s = standings(e, [match(11, 1, 'a'), match(6, 11, 'b')]);
    expect(s.rows.map((r) => r.teamId)).toEqual([ME, 'b', 'a']);
  });

  it('ignores knockout matches and matches without a pool opponent', () => {
    const ko = match(11, 2, 'a', { tournament: { tournamentId: 't1', eventId: 'e1', stage: 'knockout', round: 'Final' } });
    const s = standings(ev(), [ko, match(11, 2)]);
    expect(s.entered).toBe(0);
  });
});

describe('other results', () => {
  const bo3 = { ...DEFAULT_FORMAT, bestOf: 3 as const };
  it('checks teams and scores', () => {
    expect(checkOtherResult(DEFAULT_FORMAT, 'a', 'a', [{ a: 11, b: 3 }])).toBe('Pick two different teams');
    expect(checkOtherResult(DEFAULT_FORMAT, 'a', 'b', [{ a: 11, b: 10 }])).toBe('The winner must win by 2');
    expect(checkOtherResult(DEFAULT_FORMAT, 'a', 'b', [{ a: 11, b: 3 }])).toBeNull();
    expect(checkOtherResult(bo3, 'a', 'b', [{ a: 11, b: 3 }, { a: null, b: null }, { a: null, b: null }])).toMatch(/win 2 games/);
    expect(checkOtherResult(bo3, 'a', 'b', [{ a: 11, b: 3 }, { a: 11, b: 5 }, { a: 11, b: 6 }])).toMatch(/third game/);
    expect(checkOtherResult(bo3, 'a', 'b', [{ a: 11, b: 3 }, { a: 5, b: 11 }, { a: 11, b: 6 }])).toBeNull();
  });
});

describe('summary, links and dates', () => {
  it('summarises an event', () => {
    const s = eventSummary(ev({ placement: '3' }), [
      match(11, 9, 'a', { games: [{ you: 11, them: 9, momentum: 'came-back', fromYou: 4, fromThem: 9 }] }),
      match(7, 11, undefined, { tournament: { tournamentId: 't1', eventId: 'e1', stage: 'knockout', round: 'Semifinal' } }),
      match(11, 6, undefined, { tournament: { tournamentId: 't1', eventId: 'e1', stage: 'knockout', round: 'Bronze match' } }),
    ]);
    expect(s).toMatchObject({ wins: 2, losses: 1, pointsFor: 29, pointsAgainst: 26, close: 1, cameBack: 1, placement: '3', bestKo: 'Bronze match' });
  });
  it('round-trips the log link', () => {
    const l = { tournamentId: 't 1', eventId: 'e~1', stage: 'knockout' as const, round: 'Quarterfinal' as const, slotId: 's1' };
    expect(decodeLink(encodeLink(l))).toEqual({ ...l, teamId: undefined });
    expect(decodeLink('junk')).toBeUndefined();
  });
  it('says when a tournament is', () => {
    const t = { startDate: '2026-11-07', endDate: '2026-11-08' };
    expect(whenLabel(when(t, '2026-11-06'))).toBe('Tomorrow');
    expect(whenLabel(when(t, '2026-10-28'))).toBe('In 10 days');
    expect(whenLabel(when(t, '2026-11-08'))).toBe('Day 2 of 2');
    expect(whenLabel(when({ startDate: '2026-11-07', endDate: '2026-11-07' }, '2026-11-07'))).toBe('Today');
    expect(whenLabel(when(t, '2026-11-09'))).toBe('Finished');
  });
  it('picks the next tournament and the next unplayed slot', () => {
    const base: Tournament = { id: 't1', name: 'A', startDate: '2026-11-07', endDate: '2026-11-08', events: [ev({ schedule: [
      { id: 's2', at: '2026-11-07T11:00', stage: 'pool' }, { id: 's1', at: '2026-11-07T09:30', stage: 'pool', teamId: 'a' },
    ] })], checklist: [], createdAt: 0, updatedAt: 0 };
    const later = { ...base, id: 't2', startDate: '2026-12-01', endDate: '2026-12-01' };
    const past = { ...base, id: 't0', startDate: '2026-10-01', endDate: '2026-10-01' };
    expect(nextTournament([later, past, base], '2026-10-28')?.id).toBe('t1');
    expect(nextSlot(base, [])?.slot.id).toBe('s1');
    expect(nextSlot(base, [match(11, 3, 'a', { tournament: { tournamentId: 't1', eventId: 'e1', stage: 'pool', teamId: 'a', slotId: 's1' } })])?.slot.id).toBe('s2');
  });
  it('checks a new tournament', () => {
    expect(checkTournament({ name: '', startDate: '2026-11-07', endDate: '2026-11-07', events: [{ name: 'x' }] })).toMatch(/name/);
    expect(checkTournament({ name: 'A', startDate: '2026-11-08', endDate: '2026-11-07', events: [{ name: 'x' }] })).toMatch(/before/);
    expect(checkTournament({ name: 'A', startDate: '2026-11-07', endDate: '2026-11-07', events: [] })).toMatch(/event/);
    expect(checkTournament({ name: 'A', startDate: '2026-11-07', endDate: '2026-11-07', events: [{ name: 'MD 4.0' }] })).toBeNull();
  });
});
