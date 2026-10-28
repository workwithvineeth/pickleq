import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { db } from './db/db';
import { addMatch } from './db/matches';
import { DEFAULT_FORMAT } from './domain/types';
import { demoBackend, resetClubBackendsForTests } from './club';
import { setClubMode } from './club/config';

beforeEach(async () => {
  for (const t of [db.matches, db.players, db.sessions]) await t.clear();
  localStorage.clear();
  sessionStorage.clear();
  resetClubBackendsForTests();
  window.location.hash = '';
  vi.stubEnv('VITE_CLUB', 'on');
});
afterEach(() => { vi.unstubAllEnvs(); });

async function openDemo(user: ReturnType<typeof userEvent.setup>) {
  window.location.hash = '#/club';
  render(<App />);
  await user.type(await screen.findByLabelText('Your name in the demo'), 'Vineeth');
  await user.click(screen.getByRole('button', { name: 'Open Pickleball Central' }));
  await screen.findByRole('heading', { name: 'Pickleball Central' });
}

describe('Club mode', () => {
  it('stays hidden unless the build switches it on', async () => {
    vi.stubEnv('VITE_CLUB', '');
    window.location.hash = '#/club';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'PICKLEQ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Club/ })).not.toBeInTheDocument();
  });

  it('opens the Pickleball Central demo with its roster, tournament and coach view', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    expect(screen.getByText(/Demo club on this phone/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pickleball Central Open/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Players' }));
    expect(await screen.findByRole('heading', { name: '56 players' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coach' }));
    const squad = await screen.findByRole('table', { name: 'Squad' });
    expect(within(squad).getAllByRole('row').length).toBeGreaterThan(40);
    expect(screen.getByText('Lost leads across the squad')).toBeInTheDocument();
  });

  it('shows pools with tie-break rules, and the singles knockouts through to the final', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    await user.click(screen.getByRole('button', { name: /Pickleball Central Open/ }));
    await screen.findByRole('heading', { name: 'Pickleball Central Open' });
    await user.click(within(screen.getByRole('group', { name: 'Tournament view' })).getByRole('button', { name: 'Pools' }));
    for (const p of ['A', 'B', 'C', 'D']) expect(screen.getByRole('table', { name: `Pool ${p}` })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Pool A' })).getAllByText('Through')).toHaveLength(2);
    expect(screen.getByText(/head-to-head between the tied players/)).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Tournament view' })).getByRole('button', { name: 'Knockouts' }));
    expect(screen.getByRole('heading', { name: 'Quarter-finals' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Final' })).toBeInTheDocument();
  });

  it('live-scores a doubles semi-final point by point, then draws the final', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    await user.click(screen.getByRole('button', { name: /Pickleball Central Open/ }));
    await screen.findByRole('heading', { name: 'Pickleball Central Open' });
    await user.click(within(screen.getByRole('group', { name: 'Event' })).getByRole('button', { name: 'Open Doubles' }));
    await user.click(within(screen.getByRole('group', { name: 'Tournament view' })).getByRole('button', { name: 'Knockouts' }));
    const semis = screen.getAllByRole('button', { name: /^Score / });
    expect(semis).toHaveLength(2);
    expect(screen.queryByRole('heading', { name: 'Final' })).not.toBeInTheDocument();

    for (let s = 0; s < 2; s++) {
      await user.click(screen.getAllByRole('button', { name: /^Score / })[0]);
      const [a, b] = await screen.findAllByRole('button', { name: /^Point to / });
      // Game 1: B goes 8–3 up, then A wins 8 straight (a comeback); game 2: A wins 11–0.
      for (const side of 'ABBABBBABBB') await user.click(side === 'A' ? a : b);
      expect(screen.getByText(/lead by 5/)).toBeInTheDocument();
      for (let i = 0; i < 8; i++) await user.click(a);
      expect(screen.getByText(/came back from 3–8/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Start game 2' }));
      for (let i = 0; i < 11; i++) await user.click(screen.getAllByRole('button', { name: /^Point to / })[0]);
      await user.click(screen.getByRole('button', { name: 'Save result' }));
      await screen.findByRole('heading', { name: 'Pickleball Central Open' });
    }
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Final' })).toBeInTheDocument());
    const d = await demoBackend().myClubs();
    const t = await demoBackend().clubBundle(d[0].club.id);
    const final = t.matches.filter((m) => m.stage === 'final');
    expect(final).toHaveLength(2);
    expect(final.filter((m) => m.status === 'scheduled')).toHaveLength(1);
  });

  it('adds your club matches to your personal history once, with automatic momentum', async () => {
    const user = userEvent.setup();
    await addMatch({ date: '2026-10-01', type: 'singles', category: 'casual', format: DEFAULT_FORMAT, participants: [{ name: 'Old rival', role: 'opponent' }], outcome: 'played', games: [{ you: 11, them: 5, momentum: 'neither' }], won: true, status: 'complete', backfilled: false, tags: {} });
    await openDemo(user);
    window.location.hash = '#/club';
    const banner = await screen.findByRole('button', { name: /club matches to add to your history/ });
    const n = Number(banner.textContent?.match(/(\d+) club/)?.[1]);
    expect(n).toBeGreaterThanOrEqual(10);
    await user.click(banner);
    await screen.findByText(`Added ${n} club matches to your history.`);
    const all = await db.matches.toArray();
    expect(all).toHaveLength(n + 1);
    const fromClub = all.filter((m) => m.club);
    expect(fromClub.every((m) => m.club?.clubName === 'Pickleball Central' && m.venue === 'Pickleball Central')).toBe(true);
    expect(fromClub.some((m) => m.category === 'tournament')).toBe(true);
    expect(fromClub.some((m) => m.games.some((g) => g.momentum !== 'neither'))).toBe(true);
    await waitFor(() => expect(screen.queryByRole('button', { name: /club matches to add/ })).not.toBeInTheDocument());
    // Deleted ones don't come back.
    await db.matches.update(fromClub[0].id, { deletedAt: Date.now() });
    window.location.hash = '#/home';
    await screen.findByRole('button', { name: /^Club\s*›$/ });
  });

  it('lets you choose what your club sees, shows exactly what is shared, and coaches see it', async () => {
    const user = userEvent.setup();
    await addMatch({ date: '2026-10-01', type: 'doubles', category: 'casual', format: DEFAULT_FORMAT, participants: [{ name: 'X', role: 'opponent' }], outcome: 'played', games: [{ you: 9, them: 11, momentum: 'neither' }], won: false, status: 'complete', backfilled: false, tags: { 'Backhand drive': 'needs-work' } });
    await openDemo(user);
    await user.click(screen.getByRole('button', { name: 'Members' }));
    await user.click(screen.getByRole('button', { name: /What this club can see about me/ }));
    await screen.findByRole('heading', { name: 'What my club sees' });
    expect(screen.getByText(/stays on this phone/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /What needs work/ }));
    expect(await screen.findByText('Backhand drive: needs work')).toBeInTheDocument();
    expect(screen.getByText('This is exactly what your coaches will see.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Share these numbers' }));
    await screen.findByText(/Shared with your club/);
    const [{ club, myPlayerId }] = await demoBackend().myClubs();
    const bundle = await demoBackend().clubBundle(club.id);
    const s = bundle.summaries.find((x) => x.playerId === myPlayerId);
    expect(s?.data.tags?.[0]).toMatchObject({ tag: 'Backhand drive', inLosses: 1, losses: 1 });
    expect(s?.data.record).toBeUndefined();
    // Turning everything off removes it.
    await user.click(screen.getByRole('checkbox', { name: /What needs work/ }));
    await user.click(screen.getByRole('button', { name: 'Save: share nothing' }));
    await screen.findByText(/not sharing anything/);
    expect((await demoBackend().clubBundle(club.id)).summaries).toHaveLength(0);
  });

  it('shows a player’s comebacks and lost leads to the coach, evidence only', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    await user.click(screen.getByRole('button', { name: 'Coach' }));
    await user.click(screen.getAllByRole('button', { name: 'Lost lead' })[0]);
    const table = screen.getByRole('table', { name: 'Squad' });
    const first = within(table).getAllByRole('row')[1];
    await user.click(within(first).getAllByRole('button')[0]);
    await screen.findByRole('heading', { name: 'From club matches' });
    expect(screen.getByText(/It doesn’t say why/)).toBeInTheDocument();
    expect(screen.getByText('Leads lost (score you led from)')).toBeInTheDocument();
    expect(screen.getByText('By opponent rating')).toBeInTheDocument();
  });

  it('creates a tournament: seeds by rating into pools and schedules every match', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    await user.click(screen.getByRole('button', { name: 'New tournament' }));
    await screen.findByRole('heading', { name: 'New tournament' });
    await user.type(screen.getByLabelText('Tournament name'), 'Friday Ladder');
    await user.click(within(screen.getByRole('group', { name: 'Courts' })).getByRole('button', { name: '2' }));
    const boxes = screen.getAllByRole('checkbox');
    for (const box of boxes.slice(0, 6)) await user.click(box);
    await user.click(within(screen.getByRole('group', { name: 'Event 1 going through' })).getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: 'Create tournament' }));
    expect(await screen.findByRole('status')).toHaveTextContent('More players go through than some pools have');
    await user.click(within(screen.getByRole('group', { name: 'Event 1 going through' })).getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: 'Create tournament' }));
    await screen.findByRole('heading', { name: 'Friday Ladder' });
    expect(screen.getAllByRole('button', { name: /^Score / })).toHaveLength(6);
    expect(screen.getAllByText(/Court [12]/).length).toBe(6);
  });

  it('public results open without signing in and show names and scores only', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    window.location.hash = '#/results/pbc-open';
    await screen.findByRole('heading', { name: 'Pickleball Central Open' });
    expect(screen.getByText('Scored with PICKLEQ.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Pool A' })).toBeInTheDocument();
    expect(screen.queryByText(/DUPR/)).not.toBeInTheDocument();
  });

  it('closing the demo deletes it from the phone', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    window.location.hash = '#/club';
    await user.click(await screen.findByRole('button', { name: /Close the demo/ }));
    expect(await screen.findByRole('button', { name: 'Open Pickleball Central' })).toBeInTheDocument();
    expect(localStorage.getItem('pq-club-demo-v1')).toContain('"clubs":[]');
    setClubMode(null);
  });
});
