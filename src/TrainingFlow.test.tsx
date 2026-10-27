import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { db } from './db/db';
import { activeSessions } from './db/training';
import { loadSampleData } from './db/sample';
import { addMatch } from './db/matches';
import { DEFAULT_FORMAT } from './domain/types';

beforeEach(async () => {
  for (const t of [db.matches, db.players, db.ratings, db.sessions, db.drillCategories, db.goals]) await t.clear();
  localStorage.clear();
  window.location.hash = '';
});

describe('training journal', () => {
  it('logs a session with a drill, refuses made > tries, and shows it on Train and Home', async () => {
    window.location.hash = '#/session-new';
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Log training' });
    await user.click(within(screen.getByRole('group', { name: 'Duration' })).getByRole('button', { name: '90' }));
    await user.click(within(screen.getByRole('group', { name: 'Add a drill' })).getByRole('button', { name: '+ Third-shot drops' }));
    for (let i = 0; i < 21; i++) await user.click(screen.getByRole('button', { name: 'Raise made score' }));
    await user.click(screen.getByRole('button', { name: 'Save session' }));
    expect(screen.getByRole('status')).toHaveTextContent('made can’t be more than attempts');
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Lower made score' }));
    await user.click(screen.getByRole('button', { name: 'Save session' }));
    await waitFor(async () => expect(await activeSessions()).toHaveLength(1));
    const [s] = await activeSessions();
    expect(s).toMatchObject({ minutes: 90, drills: [{ category: 'Third-shot drops', made: 18, attempts: 20 }] });
    window.location.hash = '#/train';
    expect(await screen.findByLabelText('Third-shot drops: 90%, 18 of 20')).toBeInTheDocument();
    window.location.hash = '#/home';
    expect(await screen.findByRole('button', { name: /Training this week: 1.5 hours/ })).toBeInTheDocument();
  });

  it('logs a rest day without a duration and counts it in the streak', async () => {
    window.location.hash = '#/session-new';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Rest day' }));
    expect(screen.getByText('Rest days keep your training streak going.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save session' }));
    window.location.hash = '#/home';
    expect(await screen.findByRole('button', { name: /1-day streak/ })).toBeInTheDocument();
  });

  it('adds a custom drill category', async () => {
    window.location.hash = '#/session-new';
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('New drill name'), 'Erne practice');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: 'Remove Erne practice' })).toBeInTheDocument();
    expect(await db.drillCategories.count()).toBe(1);
  });

  it('adds and validates goals', async () => {
    window.location.hash = '#/goals';
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Hours per week'), '0');
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(screen.getByRole('status')).toHaveTextContent('hours');
    await user.clear(screen.getByLabelText('Hours per week'));
    await user.type(screen.getByLabelText('Hours per week'), '6');
    await user.click(screen.getByRole('button', { name: 'Add goal' }));
    expect(await screen.findByText('Train 6 hours a week')).toBeInTheDocument();
  });
});

describe('strengths, weaknesses and insights', () => {
  it('saves optional shot ratings as estimates on a match', async () => {
    const m = await addMatch({ date: '2026-10-20', type: 'singles', category: 'casual', format: DEFAULT_FORMAT, participants: [], outcome: 'played',
      games: [{ you: 11, them: 5, momentum: 'neither' }], won: true, status: 'incomplete', backfilled: false, tags: {} });
    window.location.hash = `#/details/${m.id}`;
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Rate your shots (optional)' }));
    await user.click(within(screen.getByRole('group', { name: 'Serve rating' })).getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(async () => expect((await db.matches.get(m.id))?.shotRatings).toEqual({ Serve: 4 }));
  });

  it('shows built-in insights and coach questions from the sample data', async () => {
    await loadSampleData();
    window.location.hash = '#/coach';
    render(<App />);
    expect(await screen.findByText('Insights · last 90 days')).toBeInTheDocument();
    expect(screen.getAllByText('From your data').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Questions for your coach' })).toBeInTheDocument();
    for (const el of screen.getAllByText(/./, { selector: '.card div' })) expect(el.textContent).not.toMatch(/\bbecause\b/i);
  });

  it('shows tag and shot sections on Stats with the estimate label', async () => {
    await loadSampleData();
    window.location.hash = '#/stats';
    render(<App />);
    expect(await screen.findByText('Tags · needs work vs went well')).toBeInTheDocument();
    expect(screen.getByText('Your estimates, 1–5')).toBeInTheDocument();
  });
});
