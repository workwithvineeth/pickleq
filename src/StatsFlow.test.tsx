import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { db } from './db/db';
import { activeMatches, addMatch } from './db/matches';
import { ratingHistory } from './db/ratings';
import { loadSampleData } from './db/sample';
import { pct, summarize } from './domain/stats';
import { DEFAULT_FORMAT } from './domain/types';

beforeEach(async () => {
  await db.matches.clear();
  await db.players.clear();
  await db.ratings.clear();
  localStorage.clear();
  window.location.hash = '';
});

describe('stats and ratings', () => {
  it('shows stats that match the calculation for 24 sample matches', async () => {
    await loadSampleData();
    const all = await activeMatches();
    expect(all).toHaveLength(24);
    const s = summarize(all);
    window.location.hash = '#/stats';
    render(<App />);
    expect(await screen.findByText(`${pct(s.record)}%`)).toBeInTheDocument();
    expect(screen.getByText(`${s.record.wins}–${s.record.losses} · 24 matches`)).toBeInTheDocument();
    expect(screen.getByLabelText('Win rate by situation')).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(2); // head-to-head and partners
  });

  it('switching to Singles only counts singles matches', async () => {
    await loadSampleData();
    const singles = (await activeMatches()).filter((m) => m.type === 'singles');
    const s = summarize(singles);
    window.location.hash = '#/stats';
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Win % by situation');
    await user.click(within(screen.getByRole('group', { name: 'Match type' })).getByRole('button', { name: 'Singles' }));
    expect(await screen.findByText(`${s.record.wins}–${s.record.losses} · ${singles.length} matches`)).toBeInTheDocument();
  });

  it('stats update after a match is edited', async () => {
    const m = await addMatch({ date: '2026-10-20', type: 'singles', category: 'casual', format: DEFAULT_FORMAT, participants: [], outcome: 'played',
      games: [{ you: 11, them: 5, momentum: 'neither' }], won: true, status: 'complete', backfilled: false, tags: {} });
    window.location.hash = '#/stats';
    render(<App />);
    expect(await screen.findByText('1–0 · 1 matches')).toBeInTheDocument();
    await db.matches.update(m.id, { games: [{ you: 5, them: 11, momentum: 'neither' }], won: false });
    expect(await screen.findByText('0–1 · 1 matches')).toBeInTheDocument();
  });

  it('adds a DUPR rating, rejects a bad one, and shows it on Home', async () => {
    window.location.hash = '#/ratings';
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(await screen.findByRole('group', { name: 'Rating type' })).getByRole('button', { name: 'Singles' }));
    await user.type(screen.getByLabelText('New singles rating'), '9.2');
    await user.click(screen.getByRole('button', { name: 'Save rating' }));
    expect(screen.getByRole('status')).toHaveTextContent('between 1 and 8');
    await user.clear(screen.getByLabelText('New singles rating'));
    await user.type(screen.getByLabelText('New singles rating'), '3.715');
    await user.click(screen.getByRole('button', { name: 'Save rating' }));
    expect(await screen.findByText('Saved singles rating 3.715.')).toBeInTheDocument();
    expect((await ratingHistory('singles'))[0]).toMatchObject({ value: 3.715, source: 'dupr-manual' });
    window.location.hash = '#/home';
    expect(await screen.findByRole('button', { name: /Singles rating: 3.715/ })).toBeInTheDocument();
  });
});
