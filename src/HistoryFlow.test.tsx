import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { db } from './db/db';
import { addMatch } from './db/matches';
import { DEFAULT_FORMAT } from './domain/types';

beforeEach(async () => {
  await db.matches.clear();
  await db.players.clear();
  localStorage.clear();
});

async function seedWin() {
  return addMatch({
    date: '2026-10-20', type: 'singles', category: 'practice', format: DEFAULT_FORMAT,
    participants: [{ name: 'Arjun', role: 'opponent', rating: 3.9 }], outcome: 'played',
    games: [{ you: 11, them: 8, momentum: 'neither' }], won: true, status: 'complete', backfilled: false, tags: {},
  });
}

describe('match history', () => {
  it('corrects a score, updates the record and shows the edit history', async () => {
    const m = await seedWin();
    window.location.hash = `#/match/${m.id}`;
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Edit match' }));
    await screen.findByRole('heading', { name: 'Edit match' });
    await user.click(screen.getByRole('button', { name: /^Your score/ }));
    await user.click(within(screen.getByRole('group', { name: 'Your score' })).getByRole('button', { name: '9' }));
    await user.click(screen.getByRole('button', { name: /^Their score/ }));
    await user.click(within(screen.getByRole('group', { name: 'Their score' })).getByRole('button', { name: '11' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { name: /Loss · 9–11/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit history (1)' }));
    expect(screen.getByText(/11–8 → 9–11/)).toBeInTheDocument();
  });

  it('moves a match to Trash and restores it', async () => {
    const m = await seedWin();
    window.location.hash = `#/match/${m.id}`;
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Delete match' }));
    await user.click(screen.getByRole('button', { name: 'Move to Trash' }));
    expect(await screen.findByRole('heading', { name: 'Matches' })).toBeInTheDocument();
    expect(await screen.findByText('No matches yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trash' }));
    await user.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(await db.matches.filter((x) => x.deletedAt === undefined).count()).toBe(1);
  });

  it('backfills an old match as complete, without momentum', async () => {
    window.location.hash = '#/backfill';
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Add an old match' });
    expect(screen.queryByRole('group', { name: 'Momentum' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Your score/ }));
    await user.click(within(screen.getByRole('group', { name: 'Your score' })).getByRole('button', { name: '11' }));
    await user.click(within(screen.getByRole('group', { name: 'Their score' })).getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: 'Save old match' }));
    expect(await screen.findByRole('heading', { name: /Win · 11–4/ })).toBeInTheDocument();
    const [saved] = await db.matches.toArray();
    expect(saved).toMatchObject({ backfilled: true, status: 'complete' });
  });
});
