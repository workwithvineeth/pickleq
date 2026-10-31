import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { db } from './db/db';
import { addMatch } from './db/matches';
import { DEFAULT_FORMAT } from './domain/types';
import { demoBackend, resetClubBackendsForTests } from './club';
import { setClubMode } from './club/config';
import type { ClubMatch } from './club/types';

beforeEach(async () => {
  for (const t of [db.matches, db.players, db.sessions]) await t.clear();
  localStorage.clear();
  sessionStorage.clear();
  resetClubBackendsForTests();
  window.location.hash = '';
  vi.stubEnv('VITE_CLUB', 'on');
});
afterEach(() => { vi.unstubAllEnvs(); });

function demoState() { return JSON.parse(localStorage.getItem('pq-club-demo-v1') ?? '{}'); }

async function openEvent(user: ReturnType<typeof userEvent.setup>) {
  await openDemo(user);
  await user.click(screen.getByRole('button', { name: /PQ Demo Open/ }));
  await screen.findByRole('heading', { name: 'PQ Demo Open' });
}

async function openDemo(user: ReturnType<typeof userEvent.setup>) {
  window.location.hash = '#/club';
  render(<App />);
  await user.type(await screen.findByLabelText('Your name in the demo'), 'Vineeth');
  await user.click(screen.getByRole('button', { name: 'Open PQ Demo Club' }));
  await screen.findByRole('heading', { name: 'PQ Demo Club' });
}

describe('Club mode', () => {
  it('stays hidden unless the build switches it on', async () => {
    vi.stubEnv('VITE_CLUB', '');
    window.location.hash = '#/club';
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'PICKLEQ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Club/ })).not.toBeInTheDocument();
  });

  it('has a Club button at the top of Home that opens Club mode', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/home';
    render(<App />);
    const header = (await screen.findByRole('heading', { name: 'PICKLEQ' })).closest('header') as HTMLElement;
    await user.click(await within(header).findByRole('button', { name: 'Club' }));
    expect(await screen.findByRole('button', { name: 'Open PQ Demo Club' })).toBeInTheDocument();
  });

  it('opens the PQ Demo Club demo with its roster, tournament and coach view', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    expect(screen.getByText(/Demo club on this phone/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PQ Demo Open/ })).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /PQ Demo Open/ }));
    await screen.findByRole('heading', { name: 'PQ Demo Open' });
    await user.click(within(screen.getByRole('group', { name: 'Tournament view' })).getByRole('button', { name: 'Pools' }));
    for (const p of ['A', 'B', 'C', 'D']) expect(screen.getByRole('table', { name: `Pool ${p}` })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Pool A' })).getAllByText('Through')).toHaveLength(2);
    expect(screen.getByText(/head-to-head \(wins in matches between the tied players\)/)).toBeInTheDocument();
    await user.click(within(screen.getByRole('group', { name: 'Tournament view' })).getByRole('button', { name: 'Knockouts' }));
    expect(screen.getByRole('heading', { name: 'Quarter-finals' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Final' })).toBeInTheDocument();
  });

  it('live-scores a doubles semi-final point by point, then draws the final', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    await user.click(screen.getByRole('button', { name: /PQ Demo Open/ }));
    await screen.findByRole('heading', { name: 'PQ Demo Open' });
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
      await screen.findByRole('heading', { name: 'PQ Demo Open' });
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
    expect(fromClub.every((m) => m.club?.clubName === 'PQ Demo Club' && m.venue === 'PQ Demo Club')).toBe(true);
    expect(fromClub.some((m) => m.category === 'tournament')).toBe(true);
    expect(fromClub.some((m) => m.games.some((g) => g.momentum !== 'neither'))).toBe(true);
    await waitFor(() => expect(screen.queryByRole('button', { name: /club matches to add/ })).not.toBeInTheDocument());
    // Deleted ones don't come back.
    await db.matches.update(fromClub[0].id, { deletedAt: Date.now() });
    window.location.hash = '#/home';
    await screen.findByRole('button', { name: 'Club' });
    expect(screen.queryByRole('button', { name: /to add to your history/ })).not.toBeInTheDocument();
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
    window.location.hash = '#/results/pq-demo-open';
    await screen.findByRole('heading', { name: 'PQ Demo Open' });
    expect(screen.getByText('Scored with PaddleQ.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Pool A' })).toBeInTheDocument();
    expect(screen.queryByText(/DUPR/)).not.toBeInTheDocument();
  });

  it('closing the demo deletes it from the phone', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    window.location.hash = '#/club';
    await user.click(await screen.findByRole('button', { name: /Close the demo/ }));
    expect(await screen.findByRole('button', { name: 'Open PQ Demo Club' })).toBeInTheDocument();
    expect(localStorage.getItem('pq-club-demo-v1')).toContain('"clubs":[]');
    setClubMode(null);
  });

  it('scorer links: a court scorer with no account scores with the PIN; wrong PINs are refused', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    await user.click(screen.getByRole('button', { name: 'Referee links' }));
    await screen.findByRole('heading', { name: 'Referee links' });
    await user.click(screen.getByRole('button', { name: 'Make a link for each court (6)' }));
    await screen.findByText('Made 6 court links');
    await user.click(screen.getByRole('button', { name: 'Add an any-court link' }));
    await screen.findByText('Made an any-court link');
    const link = demoState().scorerLinks.find((l: { court?: number }) => !l.court);
    expect(await screen.findByLabelText(`Referee PIN ${link.pin}`)).toBeInTheDocument();

    window.location.hash = `#/court/${link.token}`;
    const pin = await screen.findByLabelText('PIN');
    await user.type(pin, link.pin === '0000' ? '1111' : '0000');
    await user.click(screen.getByRole('button', { name: 'Start scoring' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');
    await user.clear(pin);
    await user.type(pin, link.pin);
    await user.click(screen.getByRole('button', { name: 'Start scoring' }));
    await screen.findByText('Up next');
    expect(screen.queryByText(/DUPR|@/)).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /^Score: / })[0]);
    for (let g = 0; g < 2; g++) {
      for (let i = 0; i < 11; i++) await user.click(screen.getAllByRole('button', { name: /^Point to / })[0]);
      if (g === 0) await user.click(screen.getByRole('button', { name: 'Start game 2' }));
    }
    await user.click(screen.getByRole('button', { name: 'Save result' }));
    await screen.findByText('Finished');
    const [{ club }] = await demoBackend().myClubs();
    const done = (await demoBackend().clubBundle(club.id)).matches.filter((m) => m.stage === 'sf' && m.status === 'done');
    expect(done.some((m) => m.games.map((x) => `${x.a}-${x.b}`).join() === '11-0,11-0')).toBe(true);
  });

  it('a court link only shows that court, and a turned-off link stops working', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    await user.click(screen.getByRole('button', { name: 'Referee links' }));
    await user.click(await screen.findByRole('button', { name: 'Make a link for each court (6)' }));
    await screen.findByText('Made 6 court links');
    const c1 = demoState().scorerLinks.find((l: { court?: number }) => l.court === 1);
    await user.click(within(screen.getByLabelText('Court 1 referee link')).getByRole('button', { name: 'Turn off' }));
    await screen.findByText('Court 1 link turned off');
    window.location.hash = `#/court/${c1.token}`;
    await user.type(await screen.findByLabelText('PIN'), c1.pin);
    await user.click(screen.getByRole('button', { name: 'Start scoring' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn’t valid/);
  });

  it('referee PIN: every court link shares it; the organiser sets their own (not easy, not the desk PIN) or makes a new one', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    await user.click(screen.getByRole('button', { name: 'Referee links' }));
    await user.click(await screen.findByRole('button', { name: 'Make a link for each court (6)' }));
    await screen.findByText('Made 6 court links');
    await user.click(screen.getByRole('button', { name: 'Add an any-court link' }));
    await screen.findByText('Made an any-court link');
    const pins = new Set(demoState().scorerLinks.map((l: { pin: string }) => l.pin));
    expect(pins.size).toBe(1);
    const [first] = [...pins] as string[];
    const card = screen.getByRole('region', { name: 'Referee PIN' });
    expect(within(card).getByLabelText(`Referee PIN ${first}`)).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Share desk link' })).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'New PIN' }));
    await screen.findByText(/New referee PIN on every court link/);
    const after = new Set(demoState().scorerLinks.map((l: { pin: string }) => l.pin));
    expect(after.size).toBe(1);
    const [next] = [...after] as string[];
    expect(next).not.toBe(first);
    expect(await within(card).findByLabelText(`Referee PIN ${next}`)).toBeInTheDocument();
    // Set my own: an easy one and the desk PIN are refused; a good one goes on every link.
    const desk = screen.getByRole('region', { name: 'Desk access' });
    const deskPin = Object.values(demoState().desks as Record<string, { pin: string }>)[0].pin;
    expect(within(desk).getByLabelText(`Desk PIN ${deskPin}`)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Set my own' }));
    await user.type(within(card).getByLabelText('Your referee PIN'), '1234');
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too easy to guess/);
    await user.clear(within(card).getByLabelText('Your referee PIN'));
    await user.type(within(card).getByLabelText('Your referee PIN'), deskPin);
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The referee PIN must be different from the desk PIN');
    await user.clear(within(card).getByLabelText('Your referee PIN'));
    await user.type(within(card).getByLabelText('Your referee PIN'), '4826');
    await user.click(within(card).getByRole('button', { name: 'Save' }));
    await screen.findByText(/Referee PIN saved on every court link/);
    expect(new Set(demoState().scorerLinks.map((l: { pin: string }) => l.pin))).toEqual(new Set(['4826']));
    expect(await within(card).findByLabelText('Referee PIN 4826')).toBeInTheDocument();
  });

  it('desk access: its own 6-digit PIN (never the referee PIN), New PIN, Share desk link, new desk link with a check', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    await user.click(screen.getByRole('button', { name: 'Referee links' }));
    const desk = await screen.findByRole('region', { name: 'Desk access' });
    const state = () => Object.values(demoState().desks as Record<string, { pin: string; token: string }>)[0];
    const first = state();
    expect(first.pin).toMatch(/^\d{6}$/);
    expect(await within(desk).findByLabelText(`Desk PIN ${first.pin}`)).toBeInTheDocument();
    expect(within(desk).getByRole('button', { name: 'Share desk link' })).toBeInTheDocument();
    expect(within(desk).getByText(/No players’ phone numbers/)).toBeInTheDocument();
    await user.click(within(desk).getByRole('button', { name: 'New PIN' }));
    await screen.findByText('New desk PIN. Tell your desk team.');
    expect(state().pin).not.toBe(first.pin);
    await user.click(within(desk).getByRole('button', { name: /Make a new desk link/ }));
    await user.click(within(desk).getByRole('button', { name: 'Make a new desk link' }));
    await screen.findByText('New desk link made. The old one no longer works.');
    expect(state().token).not.toBe(first.token);
  });

  it('the desk link: desk PIN only (the referee PIN is refused), this tournament only, walkover and entries, and it stops when finished', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    await user.click(screen.getByRole('button', { name: 'Referee links' }));
    await screen.findByRole('region', { name: 'Desk access' });
    const { token, pin } = Object.values(demoState().desks as Record<string, { pin: string; token: string }>)[0];
    const referee = demoState().eventPins ? Object.values(demoState().eventPins as Record<string, string>)[0] : '0000';
    window.location.hash = `#/desk/${token}`;
    expect(await screen.findByRole('heading', { name: 'PQ Demo Club Desk' })).toBeInTheDocument();
    expect(screen.getByText('PQ Demo Open')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Desk PIN'), referee);
    await user.click(screen.getByRole('button', { name: 'Open the desk' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong desk PIN');
    await user.type(screen.getByLabelText('Desk PIN'), pin);
    await user.click(screen.getByRole('button', { name: 'Open the desk' }));
    expect(await screen.findByRole('heading', { name: 'PQ Demo Open · Desk' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Referee links' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\+91|98\d{8}|@/);
    // A walkover from the desk is saved through the desk link.
    const before = demoState().matches.filter((m: { status: string }) => m.status === 'done').length;
    await user.click(screen.getAllByRole('button', { name: 'Walkover…' })[0]);
    await user.click(within(screen.getByRole('region', { name: 'Walkover or retired' })).getAllByRole('button', { name: /go through$/ })[0]);
    await screen.findByText(/win by walkover|the other side retired/);
    expect(demoState().matches.filter((m: { status: string }) => m.status === 'done').length).toBe(before + 1);
    // "Call to court": a ready message for the players' group (copied when the phone can't share).
    const writes: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (x: string) => { writes.push(x); } }, configurable: true });
    await user.click(screen.getAllByRole('button', { name: /^Call .* to court \d+$/ })[0]);
    await screen.findByText(/Message copied/);
    expect(writes[0]).toMatch(/^PQ Demo Open · Court \d+: .+ v .+ Please come to court \d+ now\.$/);
    // Entries page inside the desk link.
    await user.click(screen.getByRole('button', { name: 'Entries' }));
    expect(await screen.findByRole('heading', { name: 'Entries' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Late entry' })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/desk/${token}~entries`);
    window.history.back();
    expect(await screen.findByRole('heading', { name: 'PQ Demo Open · Desk' })).toBeInTheDocument();
    // The organiser marks it finished: the desk link stops.
    const tid = demoState().tournaments.find((t: { name: string }) => t.name === 'PQ Demo Open').id;
    await demoBackend().updateTournament(tid, { status: 'done' });
    localStorage.removeItem(`pq-desk-pin-${token}`);
    window.location.hash = '#/events';
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'PQ Demo Open · Desk' })).not.toBeInTheDocument());
    window.location.hash = `#/desk/${token}`;
    await user.type(await screen.findByLabelText('Desk PIN'), pin);
    await user.click(screen.getByRole('button', { name: 'Open the desk' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This tournament is finished, so the desk link no longer works.');
  });

  it('an old desk link (#/helper/…) explains that the desk has a new link', async () => {
    window.location.hash = '#/helper/abc123';
    render(<App />);
    expect(await screen.findByText('The desk now has its own link and its own desk PIN.')).toBeInTheDocument();
  });

  it('tournament page: ready-for-the-day check, Desk / Referee links / Entries first, Mark as finished last, friendly dates', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    const check = await screen.findByRole('region', { name: 'Ready for the day?' });
    expect(within(check).getByText(/No referee links yet/)).toBeInTheDocument();
    expect(within(check).getByText(/Draw made: \d+ matches/)).toBeInTheDocument();
    const run = screen.getByRole('navigation', { name: 'Run the tournament' });
    const names = within(run).getAllByRole('button').map((b) => b.textContent);
    expect(names.slice(0, 3)).toEqual(['Desk view', 'Referee links', 'Entries']);
    expect(within(run).queryByRole('button', { name: 'Mark as finished' })).not.toBeInTheDocument();
    const end = screen.getByRole('region', { name: 'When it’s over' });
    expect(within(end).getByRole('button', { name: 'Mark as finished' })).toBeInTheDocument();
    // The last thing on the page.
    const all = screen.getAllByRole('button');
    expect(all.indexOf(within(end).getByRole('button', { name: 'Mark as finished' }))).toBeGreaterThan(all.indexOf(within(run).getByRole('button', { name: 'Desk view' })));
    expect(document.body.textContent).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    await user.click(within(check).getByRole('button', { name: 'Open referee links' }));
    expect(await screen.findByRole('heading', { name: 'Referee links' })).toBeInTheDocument();
  });

  it('a tournament marked finished by mistake can be reopened (with a check before finishing)', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    await user.click(screen.getByRole('button', { name: 'Mark as finished' }));
    const confirm = screen.getByRole('region', { name: 'Finish the tournament' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Finish the tournament' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark as finished' }));
    await user.click(screen.getByRole('button', { name: 'Yes, mark as finished' }));
    await screen.findByText('Marked as finished');
    await user.click(await screen.findByRole('button', { name: 'Reopen tournament' }));
    await screen.findByText('Reopened: the tournament is live again');
    expect(await screen.findByRole('button', { name: 'Mark as finished' })).toBeInTheDocument();
  });

  it('desk view: every court on one screen, results typed in at the desk', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    await user.click(screen.getByRole('button', { name: 'Desk view' }));
    await screen.findByRole('heading', { name: 'PQ Demo Open · Desk' });
    for (let c = 1; c <= 6; c++) expect(screen.getByLabelText(`Court ${c}`)).toBeInTheDocument();
    const card = screen.getAllByRole('button', { name: 'Enter result' })[0].closest('[aria-label^="Court"]') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Enter result' }));
    const boxes = within(card).getAllByRole('textbox');
    await user.type(boxes[0], '11'); await user.type(boxes[1], '10');
    await user.click(within(card).getByRole('button', { name: 'Save result' }));
    expect(await within(card).findByRole('status')).toHaveTextContent(/won by 2/);
    await user.clear(boxes[1]); await user.type(boxes[1], '9');
    await user.type(boxes[2], '11'); await user.type(boxes[3], '7');
    await user.click(within(card).getByRole('button', { name: 'Save result' }));
    await screen.findByText('Result saved');
  });

  it('entries: withdrawing a semi-finalist gives the opponent a walkover; late entries are refused after the draw', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    const [{ club }] = await demoBackend().myClubs();
    const before = await demoBackend().clubBundle(club.id);
    const players = new Map(before.players.map((p) => [p.id, p.name]));
    const semi = before.matches.find((m) => m.stage === 'sf' && m.status === 'scheduled') as ClubMatch;
    const out = semi.sideA.map((id) => players.get(id)).join(' / ');
    await user.click(screen.getByRole('button', { name: 'Entries' }));
    await screen.findByRole('heading', { name: 'Entries' });
    await user.click(within(screen.getByRole('group', { name: 'Event' })).getByRole('button', { name: 'Open Doubles' }));
    const card = await screen.findByLabelText(out);
    await user.click(within(card).getByRole('button', { name: 'Change' }));
    await user.click(within(card).getByRole('button', { name: 'Withdraw…' }));
    await user.click(within(card).getByRole('button', { name: 'Yes, withdraw' }));
    await screen.findByText(/withdrawn\. 0 matches cancelled, 1 walkover/);
    const after = await demoBackend().clubBundle(club.id);
    expect(after.matches.find((m) => m.id === semi.id)).toMatchObject({ status: 'done', winner: 'B' });

    const late = screen.getByLabelText('Late entry player') as HTMLSelectElement;
    await user.selectOptions(late, late.options[1].value);
    await user.selectOptions(screen.getByLabelText('Late entry partner'), (screen.getByLabelText('Late entry partner') as HTMLSelectElement).options[1].value);
    await user.click(screen.getByRole('button', { name: 'Add to the event' }));
    await screen.findByText('Knockouts have started, so new entries can’t join');

    await user.type(screen.getByLabelText('Walk-in player name'), 'Wally Walkin');
    await user.click(screen.getByRole('button', { name: 'Add player' }));
    await screen.findByText('Wally Walkin added to the club. Now enter them above.');
  });

  it('DUPR export: collects missing DUPR IDs and only exports matches that are ready', async () => {
    const user = userEvent.setup();
    await openEvent(user);
    await user.click(screen.getByRole('button', { name: 'Send to DUPR' }));
    await screen.findByRole('heading', { name: 'Send to DUPR' });
    expect(screen.getByRole('button', { name: /Download the DUPR file \(0\)/ })).toBeDisabled();
    const inputs = screen.getAllByLabelText(/^DUPR ID for /);
    expect(inputs.length).toBeGreaterThan(10);
    await user.type(inputs[0], 'bad id!');
    await user.click(screen.getByRole('button', { name: 'Save DUPR IDs' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/3 to 20 letters or numbers/);
    await user.clear(inputs[0]);
    await user.type(inputs[0], 'ab12cd');
    await user.click(screen.getByRole('button', { name: 'Save DUPR IDs' }));
    await screen.findByText('Saved 1 DUPR ID');
    const [{ club }] = await demoBackend().myClubs();
    expect((await demoBackend().clubBundle(club.id)).players.some((p) => p.duprId === 'AB12CD')).toBe(true);
  });

  it('every event chooses golden point or win by 2, and the choice reaches scoring', async () => {
    const user = userEvent.setup();
    await openDemo(user);
    await user.click(screen.getByRole('button', { name: 'New tournament' }));
    await screen.findByRole('heading', { name: 'New tournament' });
    expect(within(screen.getByRole('group', { name: 'Event 1 scoring' })).getByRole('button', { name: 'Golden point' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Golden point: at 10–10 the next point wins.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tournament name'), 'Win by two night');
    await user.click(within(screen.getByRole('group', { name: 'Event 1 format' })).getByRole('button', { name: 'Round robin' }));
    await user.click(within(screen.getByRole('group', { name: 'Event 1 scoring' })).getByRole('button', { name: 'Win by 2' }));
    expect(screen.getByText('Win by 2: play on past 11 until someone leads by 2.')).toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox').slice(0, 4)) await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Create tournament' }));
    await screen.findByRole('heading', { name: 'Win by two night' });
    expect(screen.getAllByRole('button', { name: /^Score / })).toHaveLength(6);
    await user.click(screen.getAllByRole('button', { name: /^Score / })[0]);
    expect(await screen.findByText(/One game to 11 · win by 2/)).toBeInTheDocument();
  });
});
