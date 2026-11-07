import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicEvent } from '../club/backend';
import { Landing } from './Landing';

const fx = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  events: [] as unknown[],
  past: [] as unknown[],
}));
vi.mock('../club/index', () => ({
  eventsBackend: () => ({ currentUser: async () => fx.user }),
  serverBackend: () => ({ publicEvents: async () => fx.events, recentResults: async () => fx.past }),
}));

const ev = (over: Partial<PublicEvent>): PublicEvent => ({
  slug: 'e1', name: 'Fixture Smash', startDate: '2026-11-16', startTime: '08:00', city: 'Hyderabad', club: 'Fixture Club', listing: 'run', status: 'registration',
  entryMode: 'registration', registrationOpen: true, results: false, drawn: false,
  divisions: [{ id: 'd1', name: 'Doubles 3.5', kind: 'doubles', rules: { gender: 'open', cap: 8 }, taken: 5 }], ...over,
} as PublicEvent);

beforeEach(() => { fx.user = null; fx.events = []; fx.past = []; });

describe('Home page', () => {
  it('sends signed-in people straight to My clubs', async () => {
    fx.user = { id: 'u1', email: 'x@example.test' };
    const go = vi.fn();
    render(<Landing go={go} />);
    await waitFor(() => expect(go).toHaveBeenCalledWith('club', undefined, { replace: true }));
    expect(screen.queryByRole('heading', { name: /Every tournament/ })).not.toBeInTheDocument();
  });

  it('shows visitors real upcoming events, live tournaments, results and the clubs behind them', async () => {
    fx.events = [ev({}), ev({ slug: 'live1', name: 'Live Fixture Open', status: 'live', results: true, club: 'Live Club' })];
    fx.past = [ev({ slug: 'p1', name: 'Past Fixture Cup', status: 'done', club: 'Past Club' })];
    const go = vi.fn();
    render(<Landing go={go} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Every tournament, every result, in one place.' })).toBeInTheDocument();
    const live = await screen.findByRole('complementary', { name: 'Live now' });
    fireEvent.click(within(live).getByRole('button', { name: 'Follow live scores' }));
    expect(go).toHaveBeenCalledWith('results', 'live1');
    const coming = screen.getByRole('region', { name: 'Tournaments you can enter' });
    expect(within(coming).getByText('3 spots left')).toBeInTheDocument();
    fireEvent.click(within(coming).getByRole('button', { name: 'Enter' }));
    expect(go).toHaveBeenCalledWith('event', 'e1');
    fireEvent.click(screen.getByRole('button', { name: 'Past Fixture Cup results' }));
    expect(go).toHaveBeenCalledWith('results', 'p1');
    expect(within(screen.getByRole('region', { name: 'Clubs and privacy' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Live Club', 'Fixture Club', 'Past Club']);
  });

  it('leaves out sections with nothing to show, and still offers both paths', async () => {
    const go = vi.fn();
    render(<Landing go={go} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: 'Tournaments you can enter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recent results' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Find a tournament' }));
    expect(go).toHaveBeenCalledWith('events');
    fireEvent.click(screen.getByRole('button', { name: 'Start your club, free' }));
    expect(go).toHaveBeenCalledWith('club-new');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(go).toHaveBeenCalledWith('club-signin');
  });
});
