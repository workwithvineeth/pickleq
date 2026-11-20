import {describe, expect, it} from 'vitest';
import type {PublicTournament} from '../../club/backend';
import {featured, heroChip, heroCta, heroEvent, liveCourts, schedule, tickerLines} from './home20';

const fmt = {bestOf: 1, pointsTo: 11, scoring: 'rally'} as const;
const d = {
  name: 'Cedar Open', club: 'Cedar Club', startDate: '2026-11-21', startTime: '15:00', slotMinutes: 20, status: 'live',
  divisions: [{id: 'd', name: 'Mixed 3.5', kind: 'doubles', pools: 1, advance: 0, format: fmt, koFormat: fmt}],
  entries: [['Asha', 'Lata'], ['Meera', 'Divya'], ['Kiran', 'Neha'], ['Rohan', 'Sameer']].map((names, i) => ({id: 'e' + i, divisionId: 'd', pool: 1, names})),
  matches: [
    {id: 'm0', divisionId: 'd', stage: 'pool', pool: 1, court: 1, slot: 0, entryA: 'e0', entryB: 'e1', status: 'done', winner: 'A', games: [{a: 11, b: 8, points: ''}]},
    {id: 'm1', divisionId: 'd', stage: 'sf', court: 2, slot: 1, entryA: 'e1', entryB: 'e2', status: 'live', games: [{a: 3, b: 1, points: 'AABA'}]},
    {id: 'm2', divisionId: 'd', stage: 'sf', court: 1, slot: 2, entryA: 'e2', entryB: 'e3', status: 'scheduled', games: []},
  ],
} as unknown as PublicTournament;
const ev = (status: string, startDate: string, results = true) => ({slug: 's-' + status, name: 'Ev ' + status, club: 'Club', startDate, startTime: '15:00', status, results}) as never;

describe('Home 20/10 data', () => {
  it('follows the event: details before, live scores during, results after', () => {
    const now = new Date('2026-11-20T10:00:00');
    expect(heroCta(heroEvent([ev('open', '2026-11-21')], now))).toEqual({label: 'See event details', href: '#/event/s-open'});
    expect(heroCta(heroEvent([ev('live', '2026-11-20'), ev('open', '2026-11-21')], now)).label).toBe('See live scores');
    expect(heroCta(heroEvent([ev('done', '2026-11-19')], now))).toEqual({label: 'See results', href: '#/results/s-done'});
    expect(heroCta(heroEvent([], now)).href).toBe('#/events');
    expect(heroChip(heroEvent([ev('live', '2026-11-20')], now))).toBe('Live now · Ev live · Hosted by Club');
  });
  it('features the live match with real names, score and rallies; nothing when nothing is live', () => {
    const f = featured(d)!;
    expect(f).toMatchObject({court: 'Court 2', a: 'Meera & Divya', b: 'Kiran & Neha', sa: 3, sb: 1});
    expect(f.rallies).toHaveLength(4);
    expect(f.stage).toContain('Semi-final');
    expect(featured({...d, matches: d.matches.filter(m => m.status !== 'live')})).toBeNull();
    expect(featured(null)).toBeNull();
  });
  it('builds the ticker, schedule and live courts from the event only', () => {
    expect(tickerLines(d)[0]).toEqual({live: true, text: 'Court 2 · Meera & Divya 3–1 Kiran & Neha'});
    const rows = schedule(d);
    expect(rows.map(r => r.cls)).toEqual(['done', 'now', '']);
    expect(rows[0]).toMatchObject({t: '3:00', s: 'Final · 11–8'});
    expect(rows[1].t).toBe('3:20');
    expect(liveCourts(d)).toEqual([expect.objectContaining({court: 'Court 2', sa: 3, sb: 1, leadA: true})]);
    expect(schedule(null)).toEqual([]);
  });
});
