import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { db } from './db/db';

beforeEach(async () => {
  await db.matches.clear();
  await db.players.clear();
  localStorage.clear();
  window.location.hash = '';
});

async function openLog(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  const fab = (await screen.findAllByRole('button', { name: 'Log a match' })).find((b) => b.classList.contains('fab'))!;
  await user.click(fab);
}

async function pickScore(user: ReturnType<typeof userEvent.setup>, you: number, them: number) {
  await user.click(screen.getByRole('button', { name: /^Your score/ }));
  await user.click(within(screen.getByRole('group', { name: 'Your score' })).getByRole('button', { name: String(you) }));
  await user.click(within(screen.getByRole('group', { name: 'Their score' })).getByRole('button', { name: String(them) }));
}

describe('logging a match end to end', () => {
  it('saves a win in two taps, adds details, and shows it on Home', async () => {
    const user = userEvent.setup();
    await openLog(user);
    await user.type(screen.getByLabelText('Opponent 1'), 'Rohan');
    await user.type(screen.getByLabelText('DUPR', { selector: '#opponent-1-rating' }), '3.9');
    await pickScore(user, 11, 7);
    expect(screen.getByRole('status')).toHaveTextContent('Win · ready to save');
    await user.click(screen.getByRole('button', { name: 'Save score' }));

    expect(await screen.findByRole('heading', { name: 'Match details' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Backhand drive' }));
    expect(screen.getByRole('button', { name: 'Backhand drive, needs work' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Energy' })).getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: 'Save details' }));

    expect(await screen.findByRole('heading', { name: /Win · 11–7/ })).toBeInTheDocument();
    const saved = await db.matches.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ won: true, status: 'complete', energy: 4, tags: { 'Backhand drive': 'needs-work' } });
    expect(saved[0].participants.find((p) => p.name === 'Rohan')?.rating).toBe(3.9);
  });

  it('blocks an invalid score with a clear message', async () => {
    const user = userEvent.setup();
    await openLog(user);
    await pickScore(user, 11, 10);
    await user.click(screen.getByRole('button', { name: 'Save score' }));
    expect(screen.getByRole('status')).toHaveTextContent('win by 2');
    expect(await db.matches.count()).toBe(0);
  });

  it('“Finish later” keeps the match and shows the needs-details banner on Home', async () => {
    const user = userEvent.setup();
    await openLog(user);
    await pickScore(user, 6, 11);
    await user.click(screen.getByRole('button', { name: 'Save score' }));
    await user.click(await screen.findByRole('button', { name: 'Finish later' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Match details' })).not.toBeInTheDocument());
    window.location.hash = '#/home';
    expect(await screen.findByText('1 match needs details')).toBeInTheDocument();
    expect(screen.getByLabelText('Overall record')).toHaveTextContent('0–1');
  });

  it('records a walkover with the winner chosen', async () => {
    const user = userEvent.setup();
    await openLog(user);
    await user.click(screen.getByRole('button', { name: 'Walkover' }));
    await user.click(screen.getByRole('button', { name: 'Save score' }));
    expect(screen.getByRole('status')).toHaveTextContent('Choose who won');
    await user.click(screen.getByRole('button', { name: 'I won' }));
    await user.click(screen.getByRole('button', { name: 'Save score' }));
    await screen.findByRole('heading', { name: 'Match details' });
    const [m] = await db.matches.toArray();
    expect(m).toMatchObject({ outcome: 'walkover', won: true, games: [] });
  });
});
