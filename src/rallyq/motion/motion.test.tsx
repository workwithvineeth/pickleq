import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { flip, moment, resetMoments, type Seen } from './motion';
import { CountUp } from './CountUp';
import { MatchDna } from '../arena/MatchDna';
import type { PublicTournament } from '../../club/backend';

describe('motion board helpers', () => {
  it('flips the class only when the value changes, so the animation restarts', () => {
    const seen: Seen = new Map();
    expect(flip(seen, 'k', '1', 'rqr')).toBe('');
    expect(flip(seen, 'k', '2', 'rqr')).toBe('rqr0');
    expect(flip(seen, 'k', '2', 'rqr')).toBe('rqr0');
    expect(flip(seen, 'k', '3', 'rqr')).toBe('rqr1');
  });
  it('shows a banner only after a change, never on first load, and for 1.6 s', () => {
    resetMoments();
    expect(moment('b', 'Live|0|3', 'Side out', 1000)).toBeNull();
    expect(moment('b', 'Live|0|4', 'Side out', 2000)).toEqual({ text: 'Side out', at: 2000 });
    expect(moment('b', 'Live|0|4', 'Side out', 3000)).toEqual({ text: 'Side out', at: 2000 });
    expect(moment('b', 'Live|0|4', 'Side out', 3700)).toBeNull();
    expect(moment('b', 'Live|0|5', '', 4000)).toBeNull();
  });
  it('counts keep the real number for screen readers', () => {
    const { container } = render(<CountUp text="1,003" />);
    expect(container.querySelector('[aria-label="1,003"]')).not.toBeNull();
  });
  it('draws no Match DNA when the referee recorded no rallies', () => {
    const d = { divisions: [{ id: 'd', kind: 'doubles' }] } as unknown as PublicTournament;
    const m = { divisionId: 'd', games: [{ a: 11, b: 8, points: '' }] } as unknown as PublicTournament['matches'][number];
    const { container } = render(<MatchDna d={d} m={m} all />);
    expect(container.textContent).toBe('');
  });
});
