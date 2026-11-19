import { describe, expect, it } from 'vitest';
import { knockoutBlockers } from './plan';
import type { ClubMatch, Division } from './types';

const div = (over: Partial<Division> = {}) => ({ id: 'd1', name: 'Open Doubles', advance: 2, ...over }) as Division;
const m = (id: string, status: ClubMatch['status'], stage: ClubMatch['stage'] = 'pool') => ({ id, divisionId: 'd1', stage, status, sideA: [], sideB: [], games: [] }) as unknown as ClubMatch;

describe('knockouts waiting on pool matches (audit 19 Nov)', () => {
  it('lists the unfinished pool matches once the pools have started', () => {
    const [b] = knockoutBlockers([div()], [m('1', 'done'), m('2', 'scheduled'), m('3', 'live'), m('4', 'void')]);
    expect(b.division.id).toBe('d1');
    expect(b.waiting.map((x) => x.id)).toEqual(['2', '3']);
  });
  it('says nothing before any pool match is played, when pools are done, or once knockouts exist', () => {
    expect(knockoutBlockers([div()], [m('1', 'scheduled')])).toEqual([]);
    expect(knockoutBlockers([div()], [m('1', 'done'), m('2', 'void')])).toEqual([]);
    expect(knockoutBlockers([div()], [m('1', 'done'), m('2', 'scheduled'), m('k', 'scheduled', 'sf')])).toEqual([]);
  });
  it('skips events without knockouts', () => {
    expect(knockoutBlockers([div({ advance: 0 })], [m('1', 'done'), m('2', 'scheduled')])).toEqual([]);
    expect(knockoutBlockers([div({ shape: 'ko' } as Partial<Division>)], [m('1', 'done'), m('2', 'scheduled')])).toEqual([]);
  });
});
