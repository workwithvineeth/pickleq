import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Division } from '../types';
import { KnockoutPlan, formatWords } from './Tournament';

const div = (pools: number, advance: number): Division => ({
  id: 'd', tournamentId: 't', clubId: 'c', name: 'Open', kind: 'singles', pools, advance, sort: 0,
  format: { bestOf: 1, pointsTo: 11, golden: false, scoring: 'sideout' } as Division['format'],
  koFormat: { bestOf: 1, pointsTo: 11, golden: false, scoring: 'sideout' } as Division['format'],
  stageFormats: { sf: { bestOf: 1, pointsTo: 15, golden: false, scoring: 'sideout' } as Division['format'], final: { bestOf: 1, pointsTo: 15, golden: false, scoring: 'sideout' } as Division['format'] },
});

describe('KnockoutPlan', () => {
  it('shows the 4-pool crossover, later rounds and each round format before the groups finish', () => {
    render(<KnockoutPlan division={div(4, 2)} pools={[1, 2, 3, 4]} />);
    for (const g of ['A1 v D2', 'B1 v C2', 'C1 v B2', 'D1 v A2', 'Winner QF1 v Winner QF2', 'Winner SF1 v Winner SF2']) expect(screen.getByText(g)).toBeInTheDocument();
    expect(screen.getAllByText('One game to 11, win by 2')).toHaveLength(1);
    expect(screen.getAllByText('One game to 15, win by 2')).toHaveLength(2);
    expect(screen.getByText(/Top 2 from each pool go through/)).toBeInTheDocument();
  });
  it('shows the 2-pool top-4 chart', () => {
    render(<KnockoutPlan division={div(2, 4)} pools={[1, 2]} />);
    for (const g of ['A1 v B4', 'A4 v B1', 'A2 v B3', 'A3 v B2']) expect(screen.getByText(g)).toBeInTheDocument();
  });
  it('words the format', () => {
    expect(formatWords({ bestOf: 1, pointsTo: 11, golden: true })).toBe('One game to 11, golden point');
  });
});
