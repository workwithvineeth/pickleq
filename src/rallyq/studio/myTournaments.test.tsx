import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyEntry, PublicTournament } from '../../club/backend';
import { entryStatus, myTournamentItems, nextMatchLine, upcomingEntries } from './myTournaments';

const entry = (o: Partial<MyEntry>): MyEntry => ({
  id: 'r1', status: 'accepted', payment: 'paid', players: [{ name: 'Asha Rao' }, { name: 'Lata Iyer' }] as MyEntry['players'],
  division: 'Open Doubles', kind: 'doubles', fee: 600, slug: 'demo-night', tournament: 'PQ Demo Night', startDate: '2026-11-20', startTime: '09:00',
  venue: 'Court Yard', city: 'Hyderabad', club: 'PQ Demo Club', drawn: true, results: false, ...o,
});

const event: PublicTournament = {
  name: 'PQ Demo Night', startDate: '2026-11-20', startTime: '09:00', slotMinutes: 20, status: 'live', club: 'PQ Demo Club',
  divisions: [{ id: 'd1', name: 'Open Doubles', kind: 'doubles' }],
  entries: [{ id: 'e1', divisionId: 'd1', names: ['Lata Iyer', 'Asha Rao'] }, { id: 'e2', divisionId: 'd1', names: ['Gita Rao', 'Rekha Das'] }],
  matches: [
    { id: 'm1', divisionId: 'd1', stage: 'pool', court: 1, slot: 0, entryA: 'e1', entryB: 'e2', games: [], status: 'done' },
    { id: 'm2', divisionId: 'd1', stage: 'pool', court: 2, slot: 3, entryA: 'e2', entryB: 'e1', games: [], status: 'scheduled' },
  ],
} as unknown as PublicTournament;

describe('Player Studio: My tournaments', () => {
  it('keeps upcoming entries still in play, soonest first', () => {
    const list = upcomingEntries([
      entry({ id: 'late', startDate: '2026-12-01' }),
      entry({ id: 'past', startDate: '2026-11-01' }),
      entry({ id: 'out', status: 'withdrawn' }),
      entry({ id: 'done', results: true }),
      entry({ id: 'soon', startDate: '2026-11-13', status: 'pending', payment: 'unpaid' }),
    ], '2026-11-12');
    expect(list.map((x) => x.id)).toEqual(['soon', 'late']);
  });
  it('uses the same status words as My entries', () => {
    expect(entryStatus({ status: 'accepted', payment: 'paid' }).text).toBe('Confirmed');
    expect(entryStatus({ status: 'pending', payment: 'unpaid', fee: 600 }).text).toBe('Waiting for payment');
    expect(entryStatus({ status: 'pending', payment: 'claimed', fee: 600 }).text).toBe('Waiting for the organiser');
    expect(entryStatus({ status: 'waitlist', payment: 'unpaid' }).text).toBe('Waitlist');
  });
  it('finds the next match by division and player names (any order)', () => {
    expect(nextMatchLine(entry({}), event)).toBe('Next match 10:00 am · Court 2 · vs Gita Rao / Rekha Das');
    const live = { ...event, matches: [{ ...event.matches[1], status: 'live' }] } as PublicTournament;
    expect(nextMatchLine(entry({}), live)).toBe('Playing now · Court 2 · vs Gita Rao / Rekha Das');
    expect(nextMatchLine(entry({ drawn: false }), event)).toBe('');
    expect(nextMatchLine(entry({ players: [{ name: 'Someone Else' }] as MyEntry['players'] }), event)).toBe('');
  });
  it('builds the card rows with payment words', () => {
    const [x] = myTournamentItems([entry({ payment: 'claimed', status: 'pending' })], '2026-11-12', { 'demo-night': event });
    expect(x).toMatchObject({ title: 'PQ Demo Night · Open Doubles', pay: '₹600 · Paid by UPI · not checked yet', slug: 'demo-night' });
    expect(x.when).toContain('Court Yard, Hyderabad · PQ Demo Club');
  });
});

const backend = vi.hoisted(() => ({ myEntries: vi.fn(), publicTournament: vi.fn() }));
vi.mock('../../club/index', () => ({ eventsBackend: () => backend }));

describe('My tournaments card', () => {
  it('shows entries, the next match and the way to Events and Live scores', async () => {
    const { MyTournaments } = await import('./MyTournaments');
    backend.myEntries.mockResolvedValue([entry({ startDate: '2999-01-01' })]);
    backend.publicTournament.mockResolvedValue({ ...event, startDate: '2999-01-01' });
    const go = vi.fn();
    render(<MyTournaments go={go} />);
    const card = await screen.findByRole('region', { name: 'My tournaments' });
    const row = await within(card).findByRole('link', { name: 'PQ Demo Night · Open Doubles: Confirmed' });
    expect(row).toHaveTextContent('Next match 10:00 am · Court 2');
    expect(within(card).getByRole('link', { name: 'Find a tournament' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Live scores' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'All my entries →' })).toBeInTheDocument();
  });
  it('says so when there are no upcoming tournaments', async () => {
    const { MyTournaments } = await import('./MyTournaments');
    backend.myEntries.mockResolvedValue([]);
    render(<MyTournaments go={vi.fn()} />);
    expect(await screen.findByText(/No upcoming tournaments/)).toBeInTheDocument();
  });
});
