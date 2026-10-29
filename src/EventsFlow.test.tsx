import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { db } from './db/db';
import { resetClubBackendsForTests } from './club';
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

type User = ReturnType<typeof userEvent.setup>;

async function openDemo(user: User) {
  window.location.hash = '#/club';
  render(<App />);
  await user.type(await screen.findByLabelText('Your name in the demo'), 'Robot');
  await user.click(screen.getByRole('button', { name: 'Open PQ Demo Club' }));
  await screen.findByRole('heading', { name: 'PQ Demo Club' });
}

async function goTab(user: User, name: string) {
  await user.click(within(await screen.findByRole('navigation', { name: 'Main' })).getByRole('button', { name }));
}

async function fillPerson(user: User, label: string, p: { name: string; phone: string; dupr?: string; age: string; gender: 'Man' | 'Woman' }) {
  const box = screen.getByRole('group', { name: label });
  await user.clear(within(box).getByLabelText(`${label} name`));
  await user.type(within(box).getByLabelText(`${label} name`), p.name);
  await user.clear(within(box).getByLabelText(`${label} phone`));
  if (p.phone) await user.type(within(box).getByLabelText(`${label} phone`), p.phone);
  if (p.dupr) { await user.clear(within(box).getByLabelText(`${label} DUPR rating`)); await user.type(within(box).getByLabelText(`${label} DUPR rating`), p.dupr); }
  await user.clear(within(box).getByLabelText(`${label} age`));
  await user.type(within(box).getByLabelText(`${label} age`), p.age);
  await user.click(within(within(box).getByRole('group', { name: `${label} gender` })).getByRole('button', { name: p.gender }));
}

describe('Events tab (Club builds only)', () => {
  it('is not in Live or Preview builds', async () => {
    vi.stubEnv('VITE_CLUB', '');
    window.location.hash = '#/home';
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('button', { name: 'Events' })).not.toBeInTheDocument();
    expect(within(nav).getAllByRole('button')).toHaveLength(5);
  });

  it('shows the board: dates, entries open, listed-only events, and a pending listing kept off', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    window.location.hash = '#/home';
    await goTab(user, 'Events');
    expect(await screen.findByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'PQ Demo Night' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PQ Demo Sunday Social' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PQ Demo Ladder Cup' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Entries open' }));
    expect(screen.queryByRole('button', { name: 'PQ Demo Sunday Social' })).not.toBeInTheDocument();
    // The demo user is a PICKLEQ admin, so the review queue shows.
    expect(screen.getByRole('button', { name: /1 listing to review/ })).toBeInTheDocument();
  });

  it('a listed-only event shows how to contact the organiser, with no entry form', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    window.location.hash = '#/event/pq-demo-social';
    expect(await screen.findByRole('heading', { name: 'PQ Demo Sunday Social' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /WhatsApp 90000 00000/ })).toHaveAttribute('href', 'https://wa.me/919000000000');
    expect(screen.queryByRole('button', { name: /^Enter / })).not.toBeInTheDocument();
  });
});

describe('Entering a tournament', () => {
  it('checks the rules, sends the entry, and shows it in My entries, where it can be withdrawn', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    window.location.hash = '#/event/pq-demo-night';
    expect(await screen.findByRole('heading', { name: 'PQ Demo Night' })).toBeInTheDocument();
    const men = screen.getByRole('region', { name: 'Men’s Doubles 3.5' });
    expect(within(men).getByText('Men · Doubles · DUPR 3.5 and under · ₹600')).toBeInTheDocument();
    expect(within(men).getByText('3 of 8 left')).toBeInTheDocument();
    await user.click(within(men).getByRole('button', { name: 'Enter Men’s Doubles 3.5' }));
    await screen.findByRole('heading', { name: 'Enter Men’s Doubles 3.5' });
    await fillPerson(user, 'You', { name: 'Robot Player', phone: '98111 11111', dupr: '3.62', age: '30', gender: 'Man' });
    await fillPerson(user, 'Partner', { name: 'Robot Partner', phone: '98111 11112', dupr: '3.1', age: '17', gender: 'Man' });
    await user.click(screen.getByRole('button', { name: 'Send my entry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Robot Player: rating 3.62 is above this event’s cap of 3.5');
    await fillPerson(user, 'You', { name: 'Robot Player', phone: '98111 11111', dupr: '3.42', age: '30', gender: 'Man' });
    await user.click(screen.getByRole('button', { name: 'Send my entry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('18 or over');
    await fillPerson(user, 'Partner', { name: 'Robot Partner', phone: '98111 11112', dupr: '3.1', age: '27', gender: 'Man' });
    await user.click(within(screen.getByRole('group', { name: 'How you’ll pay' })).getByRole('button', { name: 'Paid by UPI' }));
    expect(screen.getByRole('link', { name: 'Pay ₹600 by UPI to pqdemo@upi' }).getAttribute('href')).toMatch(/^upi:\/\/pay\?pa=pqdemo%40upi&.*am=600/);
    await user.type(screen.getByLabelText('UPI reference number'), '412398765432');
    await user.click(screen.getByRole('button', { name: 'Send my entry' }));
    expect(await screen.findByText(/You’re entered in Men’s Doubles 3.5/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'My entries' }));
    const entry = await screen.findByRole('region', { name: 'PQ Demo Night: Men’s Doubles 3.5' });
    expect(within(entry).getByText('Waiting for the organiser')).toBeInTheDocument();
    expect(within(entry).getByText('Paid by UPI (to confirm)')).toBeInTheDocument();
    await user.click(within(entry).getByRole('button', { name: 'Withdraw…' }));
    await user.click(within(entry).getByRole('button', { name: 'Yes, withdraw' }));
    expect(await screen.findByText('Withdrawn from Men’s Doubles 3.5')).toBeInTheDocument();
    // The details are remembered for next time (on this phone only).
    expect(JSON.parse(localStorage.getItem('pq-entry-me') ?? '{}').name).toBe('Robot Player');
  });
});

describe('Organiser: entries inbox and draw', () => {
  it('accepts, marks paid, adds an offline entry, closes entries and makes the draw', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    await user.click(screen.getByRole('button', { name: /PQ Demo Night/ }));
    await screen.findByRole('heading', { name: 'PQ Demo Night' });
    expect(screen.getByRole('region', { name: 'Events board' })).toHaveTextContent('On the board');
    await user.click(screen.getByRole('button', { name: 'Entries inbox and draw' }));
    await screen.findByRole('heading', { name: 'Entries inbox' });
    const counts = screen.getByRole('region', { name: 'Men’s Doubles 3.5 entries' });
    expect(counts).toHaveTextContent('Accepted3 of 8');
    expect(counts).toHaveTextContent('To decide2');
    const imran = screen.getByRole('region', { name: 'Imran Khan / Tarun Bose' });
    await user.click(within(imran).getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('Imran Khan / Tarun Bose: accepted')).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Show entries' })).getByRole('button', { name: 'Accepted' }));
    const imran2 = await screen.findByRole('region', { name: 'Imran Khan / Tarun Bose' });
    await user.click(within(imran2).getByRole('button', { name: 'Mark paid' }));
    expect(await screen.findByText('Imran Khan / Tarun Bose: paid')).toBeInTheDocument();
    const aditya = (await screen.findAllByRole('region')).find((r) => r.getAttribute('aria-label') === 'Aditya Kulkarni / Pranav Joshi');
    expect(aditya).toBeUndefined(); // still to decide, so not in the Accepted list

    // Offline entry: adults only; phone optional.
    await user.click(screen.getByText('Add an entry yourself (offline)'));
    await fillPerson(user, 'Player 1', { name: 'Desk One', phone: '', dupr: '3.2', age: '44', gender: 'Man' });
    await fillPerson(user, 'Player 2', { name: 'Desk Two', phone: '', dupr: '3.0', age: '16', gender: 'Man' });
    await user.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('18 or over');
    await fillPerson(user, 'Player 2', { name: 'Desk Two', phone: '', dupr: '3.0', age: '46', gender: 'Man' });
    await user.click(screen.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByText('Desk One / Desk Two added')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Men’s Doubles 3.5 entries' })).toHaveTextContent('Accepted5 of 8');

    await user.click(screen.getByRole('button', { name: 'Close entries' }));
    expect(await screen.findByText(/Entries closed\./)).toBeInTheDocument();
    const draw = screen.getByRole('region', { name: 'Draw' });
    expect(within(draw).getByText('Men’s Doubles 3.5 · 5 teams')).toBeInTheDocument();
    await user.click(within(draw).getByRole('button', { name: 'Make the draw' }));
    await user.click(within(draw).getByRole('button', { name: 'Yes, make the draw' }));
    expect(await screen.findByText('Draw made. Pools and the schedule are ready.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See the draw' }));
    await screen.findByRole('heading', { name: 'PQ Demo Night' });
    await user.click(within(screen.getByRole('group', { name: 'Tournament view' })).getByRole('button', { name: 'Pools' }));
    const pool = await screen.findByRole('table', { name: 'Pool A' });
    expect(within(pool).getAllByRole('row')).toHaveLength(6);
    expect(within(pool).getByText('Desk One / Desk Two')).toBeInTheDocument();
    // The event page now says the draw is made and takes no more entries.
    window.location.hash = '#/event/pq-demo-night';
    await screen.findByRole('heading', { name: 'PQ Demo Night' });
    expect(screen.queryByRole('button', { name: /^Enter / })).not.toBeInTheDocument();
  });
});

describe('Posting a tournament and approving it', () => {
  it('a new registration tournament waits for approval, then shows on the board', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    const clubId = window.location.hash.split('/')[2];
    window.location.hash = `#/club-tournament-new/${clubId}`;
    await screen.findByRole('heading', { name: 'New tournament' });
    await user.click(within(screen.getByRole('group', { name: 'How do players enter?' })).getByRole('button', { name: 'They register' }));
    await user.type(screen.getByLabelText('Tournament name'), 'Robot Mixed Cup');
    await user.type(screen.getByLabelText('City'), 'Hyderabad');
    await user.type(screen.getByLabelText('Venue'), 'Robot Courts');
    await user.type(screen.getByLabelText('Your UPI ID'), 'not-a-upi');
    await user.click(screen.getByRole('button', { name: 'Create and open entries' }));
    expect(await screen.findByText('A UPI ID looks like name@bank')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Your UPI ID'));
    await user.type(screen.getByLabelText('Your UPI ID'), 'robot@bank');
    await user.click(within(screen.getByRole('group', { name: 'Event 1 type' })).getByRole('button', { name: 'Doubles' }));
    await user.click(within(screen.getByRole('group', { name: 'Event 1 gender' })).getByRole('button', { name: 'Mixed' }));
    await user.type(screen.getByLabelText('Event 1 entry fee'), '700');
    expect(screen.queryByLabelText('Event 1 find player')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create and open entries' }));
    await screen.findByRole('heading', { name: 'Robot Mixed Cup' });
    const card = screen.getByRole('region', { name: 'Events board' });
    expect(card).toHaveTextContent('Being checked');
    expect(card).toHaveTextContent('Robot Courts, Hyderabad');

    window.location.hash = '#/admin-listings';
    await screen.findByRole('heading', { name: 'Review listings' });
    const review = screen.getByRole('region', { name: 'Robot Mixed Cup' });
    expect(review).toHaveTextContent('Mixed · Doubles · ₹700');
    await user.click(within(review).getByRole('button', { name: 'Reject…' }));
    await user.click(within(review).getByRole('button', { name: 'Reject with this reason' }));
    expect(await screen.findByText('Give the organiser a reason')).toBeInTheDocument();
    await user.type(within(review).getByLabelText('Reason for rejecting Robot Mixed Cup'), 'Add the start time');
    await user.click(within(review).getByRole('button', { name: 'Reject with this reason' }));
    expect(await screen.findByText('Robot Mixed Cup rejected')).toBeInTheDocument();

    window.history.back();
    await waitFor(() => expect(window.location.hash).toMatch(/club-tournament\//));
    await screen.findByRole('heading', { name: 'Robot Mixed Cup' });
    expect(screen.getByRole('region', { name: 'Events board' })).toHaveTextContent('Reason: Add the start time');
    await user.click(screen.getByRole('button', { name: 'Put it on the board' }));
    expect(await screen.findByText(/Sent to PICKLEQ to check/)).toBeInTheDocument();
    window.location.hash = '#/admin-listings';
    const again = await screen.findByRole('region', { name: 'Robot Mixed Cup' });
    await user.click(within(again).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Robot Mixed Cup is on the board. PQ Demo Club is now verified.')).toBeInTheDocument();
    window.location.hash = '#/events';
    expect(await screen.findByRole('button', { name: 'Robot Mixed Cup' })).toBeInTheDocument();
  });

  it('a listing-only post needs a contact, and skips courts and formats', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    const clubId = window.location.hash.split('/')[2];
    window.location.hash = `#/club-tournament-new/${clubId}`;
    await screen.findByRole('heading', { name: 'New tournament' });
    await user.click(within(screen.getByRole('group', { name: 'How do players enter?' })).getByRole('button', { name: 'List only' }));
    expect(screen.queryByRole('group', { name: 'Courts' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Tournament name'), 'Robot Listed Open');
    await user.type(screen.getByLabelText('City'), 'Hyderabad');
    await user.type(screen.getByLabelText('Venue'), 'Robot Park');
    await user.click(screen.getByRole('button', { name: 'Post the listing' }));
    expect(await screen.findByText('Add a contact number or a link so players can enter')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contact number for entries'), '90000 11111');
    await user.click(screen.getByRole('button', { name: 'Post the listing' }));
    await screen.findByRole('heading', { name: 'Robot Listed Open' });
    expect(screen.getByRole('region', { name: 'Events board' })).toHaveTextContent('Being checked');
    expect(screen.queryByRole('button', { name: /Entries inbox/ })).not.toBeInTheDocument();
  });
});

describe('Signing in to enter (real server)', () => {
  it('remembers the entry form to come back to after the email link', async () => {
    setClubMode(null);
    const { rememberReturn, takeReturn } = await import('./club');
    rememberReturn('#/event-enter/abc~def');
    expect(localStorage.getItem('pq-club-return')).toBe('#/event-enter/abc~def');
    expect(takeReturn()).toBe('#/event-enter/abc~def');
    expect(takeReturn()).toBeNull();
  });
});
