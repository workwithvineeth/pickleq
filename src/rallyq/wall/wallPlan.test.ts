import { describe, expect, it } from 'vitest';
import type { PublicTournament } from '../../club/backend';
import { parseRoute } from '../../navigation';
import { wallCells, wallEmbedUrl, wallOptions } from './wallPlan';

const fmt = { bestOf: 1, pointsTo: 11, scoring: 'rally' } as const;
const d = {
  name: 'Cedar Open', club: 'Cedar Club', status: 'live',
  divisions: [{ id: 'd', name: 'Open', kind: 'doubles', pools: 1, advance: 0, format: fmt, koFormat: fmt }],
  entries: [['Asha', 'Lata'], ['Meera', 'Divya']].map((names, i) => ({ id: 'e' + i, divisionId: 'd', pool: 1, names })),
  matches: [{ id: 'm', divisionId: 'd', stage: 'pool', pool: 1, court: 2, slot: 0, entryA: 'e0', entryB: 'e1', status: 'live', games: [{ a: 7, b: 4, points: '' }] }],
} as unknown as PublicTournament;

describe('LED wall', () => {
  it('opens from #/wall with or without an event', () => {
    expect(parseRoute('#/wall')).toEqual({ name: 'wall' });
    expect(parseRoute('#/wall?v=VztQ5w9JVlI')).toEqual({ name: 'wall' });
    expect(parseRoute('#/wall/central-open?scores=on')).toEqual({ name: 'wall', id: 'central-open' });
  });
  it('reads the four videos from the address and drops bad ones', () => {
    const o = wallOptions('https://rallyq.in/#/wall?v=VztQ5w9JVlI,bad,Bj4iCpYgVPo,CeR0vNMc0HM&scores=on');
    expect(o).toEqual({ videos: ['VztQ5w9JVlI', undefined, 'Bj4iCpYgVPo', 'CeR0vNMc0HM'], scores: true });
    expect(wallOptions('https://rallyq.in/#/wall').scores).toBe(false);
  });
  it('fills Court 1 to 4: address first, then the stream shown to fans; scores only when asked', () => {
    const o = wallOptions('https://rallyq.in/#/wall/x?v=VztQ5w9JVlI');
    const cells = wallCells(o, [{ court: 1, videoId: 'yE6r5EObL6c' }, { court: 2, videoId: 'yE6r5EObL6c' }] as never, d);
    expect(cells.map(c => c.videoId)).toEqual(['VztQ5w9JVlI', 'yE6r5EObL6c', undefined, undefined]);
    expect(cells.every(c => !c.score)).toBe(true);
    const scored = wallCells({ ...o, scores: true }, [], d);
    expect(scored[1].score).toEqual({ a: 'Asha & Lata', b: 'Meera & Divya', sa: 7, sb: 4 });
  });
  it('plays muted with no controls so the wall starts by itself', () => {
    expect(wallEmbedUrl('VztQ5w9JVlI', 'https://rallyq.in')).toMatch(/embed\/VztQ5w9JVlI\?autoplay=1&mute=1&controls=0/);
  });
});
