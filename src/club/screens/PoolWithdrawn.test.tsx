import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DivisionBody } from './Tournament';
import type { ClubMatch, Division, Entry } from '../types';

// Audit 21 Nov (B5): a withdrawn team is never ranked above a team that played; it sits at the bottom, labelled.
it('pool table puts a withdrawn team last, unranked and labelled Withdrawn', () => {
  const division = { id: 'd', tournamentId: 't', clubId: 'c', name: 'Open Doubles', kind: 'doubles', format: { pool: { pointsTo: 11, bestOf: 1, golden: true } }, pools: 1, advance: 2, sort: 0, rules: {} } as unknown as Division;
  const e = (id: string, status: Entry['status'] = 'active'): Entry => ({ id, divisionId: 'd', clubId: 'c', playerIds: [id], pool: 1, status });
  const m = (id: string, a: string, b: string, winner: 'A' | 'B', score: [number, number]): ClubMatch => ({ id, clubId: 'c', tournamentId: 't', divisionId: 'd', stage: 'pool', pool: 1, round: 1, slot: 0, court: 1, entryA: a, entryB: b, sideA: [a], sideB: [b], format: { pointsTo: 11, bestOf: 1, golden: true }, games: [{ a: score[0], b: score[1] }], status: 'done', winner, updatedAt: '' } as unknown as ClubMatch);
  const d = {
    divisions: [division],
    entries: [e('Asha'), e('Bela'), e('Out', 'withdrawn'), e('Chitra')],
    matches: [m('1', 'Asha', 'Bela', 'A', [11, 5]), m('2', 'Bela', 'Chitra', 'A', [11, 9]), m('3', 'Chitra', 'Asha', 'B', [3, 11])],
    tournament: { startTime: '08:00', slotMinutes: 20 },
  };
  render(<DivisionBody d={d} divisionId="d" view="pools" label={(x) => x?.id ?? ''} />);
  const rows = within(screen.getByRole('table', { name: 'Pool A' })).getAllByRole('row').slice(1);
  expect(rows.at(-1)).toHaveTextContent('Out');
  expect(rows.at(-1)).toHaveTextContent('Withdrawn');
  expect(rows.at(-1)).toHaveTextContent('–');
  expect(rows[2]).toHaveTextContent('Chitra');
});
