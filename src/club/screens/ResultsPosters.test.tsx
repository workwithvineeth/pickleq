import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicTournament } from '../backend';
import { ChampionHero, ResultsPosters } from './ResultsPosters';
import { publicChampion } from './Tournament';

const div = { id: 'd1', name: 'Open Doubles', kind: 'doubles', pools: 1, advance: 2, format: { pointsTo: 11, bestOf: 1, golden: false }, shape: 'pools' } as unknown as PublicTournament['divisions'][number];
const entries = [
  { id: 'e1', divisionId: 'd1', names: ['Asha Rao', 'Kiran Das'] },
  { id: 'e2', divisionId: 'd1', names: ['Meena Iyer', 'Ravi Nair'] },
  { id: 'e3', divisionId: 'd1', names: ['Tara Sen', 'Uma Pillai'] },
  { id: 'e4', divisionId: 'd1', names: ['Vik Shah', 'Neel Bose'] },
];
type M = PublicTournament['matches'][number];
const match = (id: string, stage: M['stage'], a: string, b: string, games: { a: number; b: number }[], status: M['status'], winner?: 'A' | 'B'): M =>
  ({ id, divisionId: 'd1', stage, entryA: a, entryB: b, games, status, winner } as M);
const event = (final: M): PublicTournament => ({
  name: 'Fictional Cup', startDate: '2026-11-01', startTime: '08:00', slotMinutes: 20, status: 'done', club: 'Demo Paddle Club',
  divisions: [div], entries,
  matches: [match('s1', 'sf', 'e1', 'e3', [{ a: 11, b: 6 }], 'done', 'A'), match('s2', 'sf', 'e2', 'e4', [{ a: 9, b: 11 }, { a: 11, b: 4 }, { a: 11, b: 8 }], 'done', 'A'), final],
});

describe('champions on the public results', () => {
  it('only a finished final with a winner makes a champion', () => {
    expect(publicChampion(event(match('f', 'final', 'e1', 'e2', [{ a: 7, b: 11 }], 'live')), 'd1')).toBeNull();
    expect(publicChampion(event(match('f', 'final', 'e1', 'e2', [], 'scheduled')), 'd1')).toBeNull();
    const c = publicChampion(event(match('f', 'final', 'e1', 'e2', [{ a: 7, b: 11 }, { a: 11, b: 9 }, { a: 8, b: 11 }], 'done', 'B')), 'd1');
    expect(c).toMatchObject({ category: 'Open Doubles', winners: ['Meena Iyer', 'Ravi Nair'], runnersUp: ['Asha Rao', 'Kiran Das'], score: '11–7 · 9–11 · 11–8', lostScore: '7–11 · 11–9 · 8–11', won: 2, played: 2 });
    expect(c?.semiFinalists).toEqual(['Tara Sen / Uma Pillai', 'Vik Shah / Neel Bose']);
  });

  it('shows the gold frame and four type-only posters with working buttons', () => {
    const c = publicChampion(event(match('f', 'final', 'e1', 'e2', [{ a: 11, b: 5 }], 'done', 'A')), 'd1');
    if (!c) throw new Error('expected a champion');
    render(<><ChampionHero c={c} club="Demo Paddle Club" /><ResultsPosters c={c} event="Fictional Cup" club="Demo Paddle Club" date="1 Nov" link="https://example.test/#/results/x" /></>);
    const hero = screen.getByRole('region', { name: 'Champions · Open Doubles' });
    expect(within(hero).getByText('11–5')).toBeInTheDocument();
    expect(within(hero).getByText(/beat Meena Iyer \/ Ravi Nair in the final/)).toBeInTheDocument();
    const posters = screen.getByRole('region', { name: 'Posters for the winners' });
    for (const name of ['Download the champion poster', 'Copy the results link for the final result', 'Download the story', 'Copy the WhatsApp message']) {
      expect(within(posters).getByRole('button', { name })).toBeInTheDocument();
    }
    // Brand rule: no stock photo on real players' posters.
    expect(posters.querySelector('img, .ph')).toBeNull();
  });
});
