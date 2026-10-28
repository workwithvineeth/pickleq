import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { db } from './db/db';
import { activeMatches } from './db/matches';
import { addTournament } from './db/tournaments';
import { DEFAULT_FORMAT } from './domain/types';

beforeEach(async () => {
  for (const t of [db.matches, db.players, db.tournaments, db.goals]) await t.clear();
  localStorage.clear();
  window.location.hash = '';
});

const iso = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

describe('tournaments', () => {
  it('creates a tournament with two events and a starter checklist, and shows it on Home', async () => {
    window.location.hash = '#/tournament-new';
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'New tournament' });
    await user.click(screen.getByRole('button', { name: 'Save tournament' }));
    expect(screen.getByRole('status')).toHaveTextContent('Give the tournament a name');
    await user.type(screen.getByLabelText('Tournament name'), 'Chennai Classic');
    await user.type(screen.getByLabelText('Start date'), iso(5));
    await user.click(screen.getByRole('button', { name: 'Save tournament' }));
    expect(screen.getByRole('status')).toHaveTextContent('Give each event a name');
    await user.type(screen.getByLabelText('Event 1 name'), 'Men’s doubles 4.0');
    await user.type(screen.getByLabelText('Event 1 partner'), 'Dev');
    await user.click(screen.getByRole('button', { name: 'Add another event' }));
    await user.type(screen.getByLabelText('Event 2 name'), 'Mixed 3.5');
    await user.click(within(screen.getByRole('group', { name: 'Event 2 type' })).getByRole('button', { name: 'Mixed' }));
    await user.click(within(screen.getByRole('group', { name: 'Event 2 structure' })).getByRole('button', { name: 'Round robin' }));
    await user.click(screen.getByRole('button', { name: 'Save tournament' }));
    await screen.findByRole('heading', { name: 'Chennai Classic' });
    expect(screen.getByText('In 5 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /0 of 10 ready/ })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Court shoes' }));
    await screen.findByRole('button', { name: /1 of 10 ready/ });
    const [t] = await db.tournaments.toArray();
    expect(t.events.map((e) => [e.name, e.type, e.structure, e.partnerName])).toEqual([['Men’s doubles 4.0', 'doubles', 'pools-knockout', 'Dev'], ['Mixed 3.5', 'mixed', 'round-robin', undefined]]);
    window.location.hash = '#/home';
    expect(await screen.findByRole('button', { name: /Next tournament: Chennai Classic, In 5 days/ })).toBeInTheDocument();
  });

  it('logs a pool match from the schedule, builds the table, and summarises it', async () => {
    const t = await addTournament({ name: 'Bengaluru Open', startDate: iso(0), endDate: iso(1), events: [{ name: 'MD 4.0', type: 'doubles', format: DEFAULT_FORMAT, structure: 'pools-knockout', partnerName: 'Dev' }] });
    window.location.hash = `#/tournament/${t.id}`;
    const user = userEvent.setup();
    render(<App />);
    const card = await screen.findByRole('region', { name: 'MD 4.0' });
    await user.type(within(card).getByLabelText('Add a team to MD 4.0'), 'Arjun / Ravi');
    await user.click(within(card).getByRole('button', { name: 'Add' }));
    await user.type(within(card).getByLabelText('Add a team to MD 4.0'), 'Kiran / Om');
    await user.click(within(card).getByRole('button', { name: 'Add' }));
    await within(card).findByRole('button', { name: 'Remove Kiran / Om' });
    // schedule a pool match against Arjun / Ravi
    await user.click(within(card).getByRole('button', { name: 'Add a time' }));
    await user.click(within(card).getByRole('button', { name: 'Arjun / Ravi' }));
    await user.click(within(card).getByRole('button', { name: 'Add to schedule' }));
    await screen.findByRole('region', { name: 'Next match' });
    await user.click(screen.getByRole('button', { name: 'Log this result' }));
    await screen.findByRole('heading', { name: 'Log match' });
    expect(screen.getByText(/Bengaluru Open · MD 4.0 · Pool vs Arjun \/ Ravi/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Partner')).toHaveValue('Dev'));
    await user.click(within(screen.getByRole('group', { name: 'Your score' })).getByRole('button', { name: '11' }));
    await user.click(within(screen.getByRole('group', { name: 'Their score' })).getByRole('button', { name: '6' }));
    await user.click(screen.getByRole('button', { name: 'Save score' }));
    await waitFor(async () => expect(await activeMatches()).toHaveLength(1));
    const [m] = await activeMatches();
    expect(m.category).toBe('tournament');
    expect(m.tournament).toMatchObject({ tournamentId: t.id, stage: 'pool' });
    // back on the tournament
    window.location.hash = `#/tournament/${t.id}`;
    const table = await screen.findByRole('table', { name: 'MD 4.0 pool table' });
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent('1You & Dev1–0+5'));
    expect(await screen.findByText(/Partial table · 1 of 3 pool matches entered/)).toBeInTheDocument();
    // add the other result → full table
    await user.click(screen.getByRole('button', { name: 'Add a result between other teams' }));
    await user.type(screen.getByLabelText('Game 1 first team score'), '11');
    await user.type(screen.getByLabelText('Game 1 second team score'), '10');
    await user.click(screen.getByRole('button', { name: 'Save result' }));
    expect(screen.getByRole('status')).toHaveTextContent('The winner must win by 2');
    await user.clear(screen.getByLabelText('Game 1 second team score'));
    await user.type(screen.getByLabelText('Game 1 second team score'), '9');
    await user.click(screen.getByRole('button', { name: 'Save result' }));
    await screen.findByText(/Partial table · 2 of 3/);
    const summary = screen.getByRole('region', { name: 'Tournament summary' });
    expect(within(summary).getAllByText('1–0').length).toBeGreaterThan(0);
    await user.click(within(screen.getByRole('group', { name: 'MD 4.0 placement' })).getByRole('button', { name: '1st · Gold' }));
    await within(summary).findByText(/1–0 · 1st · Gold/);
  });

  it('logs a knockout match and lists it by round; the match links back to the tournament', async () => {
    const t = await addTournament({ name: 'Open', startDate: iso(-1), endDate: iso(0), events: [{ name: 'MD', type: 'doubles', format: DEFAULT_FORMAT, structure: 'pools-knockout' }] });
    window.location.hash = `#/tournament/${t.id}`;
    const user = userEvent.setup();
    render(<App />);
    const card = await screen.findByRole('region', { name: 'MD' });
    await user.click(within(card).getByRole('button', { name: 'Log a match in this event' }));
    await user.click(within(card).getByRole('button', { name: 'Knockout' }));
    await user.click(within(card).getByRole('button', { name: 'Semifinal' }));
    await user.click(within(card).getByRole('button', { name: 'Log the score' }));
    await screen.findByText(/Open · MD · Semifinal/);
    await user.click(within(screen.getByRole('group', { name: 'Your score' })).getByRole('button', { name: '9' }));
    await user.click(within(screen.getByRole('group', { name: 'Their score' })).getByRole('button', { name: '11' }));
    await user.click(screen.getByRole('button', { name: 'Save score' }));
    await waitFor(async () => expect(await activeMatches()).toHaveLength(1));
    const [m] = await activeMatches();
    window.location.hash = `#/match/${m.id}`;
    await user.click(await screen.findByRole('button', { name: /Open · MD · Semifinal/ }));
    const card2 = await screen.findByRole('region', { name: 'MD' });
    expect(within(card2).getByText('Semifinal')).toBeInTheDocument();
    expect(within(card2).getByText('Lost 9–11')).toBeInTheDocument();
  });

  it('won’t remove an event that has matches, and moves a tournament to the Trash and back', async () => {
    const t = await addTournament({ name: 'Cup', startDate: iso(0), endDate: iso(0), events: [{ name: 'A', type: 'singles', format: DEFAULT_FORMAT, structure: 'round-robin' }, { name: 'B', type: 'singles', format: DEFAULT_FORMAT, structure: 'round-robin' }] });
    await db.matches.add({ id: 'x', date: iso(0), type: 'singles', category: 'tournament', format: DEFAULT_FORMAT, participants: [], outcome: 'played', games: [{ you: 11, them: 3, momentum: 'neither' }], won: true, status: 'complete', backfilled: false, tags: {}, createdAt: 1, updatedAt: 1, history: [], tournament: { tournamentId: t.id, eventId: t.events[0].id, stage: 'pool' } });
    window.location.hash = `#/tournament-edit/${t.id}`;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Edit tournament' });
    await user.click(within(screen.getByRole('region', { name: 'Event 1' })).getByRole('button', { name: 'Remove event' }));
    expect(await screen.findByRole('status')).toHaveTextContent('A has 1 logged match. Delete those matches first.');
    window.location.hash = `#/tournament/${t.id}`;
    await user.click(await screen.findByRole('button', { name: 'Delete tournament' }));
    await user.click(screen.getByRole('button', { name: 'Move to Trash' }));
    await waitFor(async () => expect((await db.tournaments.get(t.id))?.deletedAt).toBeDefined());
    window.location.hash = '#/trash';
    await screen.findByRole('heading', { name: 'Trash' });
    await user.click((await screen.findAllByRole('button', { name: 'Restore' })).at(-1)!);
    await waitFor(async () => expect((await db.tournaments.get(t.id))?.deletedAt).toBeUndefined());
  });
});
