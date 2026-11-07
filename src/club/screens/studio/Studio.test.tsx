import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankLog, type StudioData } from '../../playerStudio';
import { PlayerStudio } from './Studio';
import { Claim, ClaimLinks } from './Claim';

const fixture = vi.hoisted(() => ({
  kind: 'server',
  user: { id: 'u1', email: 'fixture@example.test' } as { id: string; email: string } | null,
  data: null as unknown,
  currentUser: vi.fn(),
  studioData: vi.fn(),
  foundPlayers: vi.fn(async () => [] as unknown[]),
  saveStudioLog: vi.fn(async () => undefined),
  saveStudioSession: vi.fn(async () => undefined),
  saveStudioRating: vi.fn(async () => undefined),
  saveStudioSettings: vi.fn(async () => undefined),
  claimPreview: vi.fn(),
  claimPlayer: vi.fn(async () => undefined),
  claimLink: vi.fn(async () => ({ claimed: false, token: 'a'.repeat(64) })),
  myEntries: vi.fn(async () => []),
  remember: vi.fn(),
}));
vi.mock('../../index', () => ({
  serverBackend: () => fixture,
  eventsBackend: () => fixture,
  rememberReturn: fixture.remember,
}));

const data = (): StudioData => ({
  players: [{ playerId: 'p-me', name: 'Fixture Me', club: 'Fixture Club', claimedAt: '2026-11-02T08:00:00Z', duprSingles: 3.4 }],
  official: [{
    id: 'o1', club: 'Fixture Club', tournament: 'Fixture Open', tournamentId: 't1', division: 'Singles', kind: 'singles', stage: 'final', playedOn: '2026-11-01',
    format: { pointsTo: 11 }, games: [{ a: 11, b: 8 }], winner: 'A', mySide: 'A', me: 'p-me', sideA: [{ id: 'p-me', name: 'Fixture Me' }], sideB: [{ id: 'p-r', name: 'Fixture Rival' }],
  }],
  logs: [], sessions: [], ratings: [], settings: { useOfficial: true, goals: [] },
});

beforeEach(() => {
  vi.clearAllMocks();
  fixture.user = { id: 'u1', email: 'fixture@example.test' };
  fixture.currentUser.mockImplementation(async () => fixture.user);
  fixture.studioData.mockImplementation(async () => data());
  fixture.foundPlayers.mockImplementation(async () => []);
});

describe('Player Studio', () => {
  it('asks a signed-out player to sign in, and comes back here after', async () => {
    fixture.user = null;
    const go = vi.fn();
    render(<PlayerStudio section="" go={go} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to Player Studio' }));
    expect(fixture.remember).toHaveBeenCalledWith('#/club-player-studio');
    expect(go).toHaveBeenCalledWith('club-signin');
  });

  it('opens on Home with the latest official result, six sections and a found-matches banner', async () => {
    fixture.foundPlayers.mockImplementation(async () => [{ playerId: 'p2', name: 'Fixture Me', club: 'Other Club', matches: 3, wins: 2, tournaments: [] }]);
    const go = vi.fn();
    render(<PlayerStudio section="" go={go} />);
    expect(await screen.findByText(/Won 11–8 against Fixture Rival in Fixture Open \(Final\)/)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Player Studio' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Home', 'Matches', 'Train', 'Stats', 'Coach', 'Profile']);
    expect(within(nav).getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Singles DUPR 3.400' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review and claim' }));
    expect(go).toHaveBeenCalledWith('club-claim', 'p.p2');
  });

  it('shows official matches read-only, with the games', async () => {
    const go = vi.fn();
    const { rerender } = render(<PlayerStudio section="matches" go={go} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fixture Open Final against Fixture Rival' }));
    expect(go).toHaveBeenCalledWith('club-player-studio', 'official.o1');
    rerender(<PlayerStudio section="official.o1" go={go} />);
    expect(await screen.findByRole('heading', { name: 'Won against Fixture Rival' })).toBeInTheDocument();
    expect(screen.getByText(/Only the final score was recorded/)).toBeInTheDocument();
    expect(screen.getByText(/Official result: read-only/)).toBeInTheDocument();
  });

  it('logs a casual match game by game, and never a tournament match', async () => {
    const go = vi.fn();
    render(<PlayerStudio section="log" go={go} />);
    const kind = await screen.findByLabelText('Kind of match');
    expect(within(kind).getByRole('option', { name: /Tournament/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Opponents'), { target: { value: 'Casual Friend' } });
    fireEvent.change(screen.getByLabelText('Game 1 your score'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Game 1 their score'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Energy 4 of 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Serve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save match' }));
    await waitFor(() => expect(fixture.saveStudioLog).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'casual', opponents: 'Casual Friend', games: [{ you: 11, them: 6 }], energy: 4, tags: { Serve: 'needs-work' },
    }), undefined));
    expect(go).toHaveBeenCalledWith('club-player-studio', 'matches');
  });

  it('refuses a level game before saving', async () => {
    render(<PlayerStudio section="log" go={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Opponents'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save match' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Game 1: a game can’t end level.');
    expect(fixture.saveStudioLog).not.toHaveBeenCalled();
  });

  it('logs practice with a counted drill, and a rest day with no minutes', async () => {
    const { unmount } = render(<PlayerStudio section="practice" go={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Add drill' }));
    fireEvent.change(screen.getByLabelText('Made'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save practice' }));
    await waitFor(() => expect(fixture.saveStudioSession).toHaveBeenCalledWith(expect.objectContaining({ kind: 'solo', minutes: 45, drills: [{ category: 'Dinks', made: 15, attempts: 20 }] }), undefined));
    unmount();
    render(<PlayerStudio section="practice" go={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText('Rest day'));
    expect(screen.queryByLabelText('Minutes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save rest day' }));
    await waitFor(() => expect(fixture.saveStudioSession).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'rest' }), undefined));
  });

  it('shows DUPR with Singles and Doubles tabs, prefilled from the organiser', async () => {
    render(<PlayerStudio section="profile" go={vi.fn()} />);
    expect(await screen.findByLabelText('Singles DUPR 3.400')).toBeInTheDocument();
    expect(screen.getByText(/From the entry list at Fixture Club/)).toBeInTheDocument();
    expect(screen.getByLabelText('Singles DUPR', { selector: 'input' })).toHaveValue('3.400');
    expect(within(screen.getByRole('list', { name: 'Singles rating history' })).getByText(/organiser, Fixture Club/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Doubles' }));
    expect(await screen.findByLabelText('Doubles DUPR not set')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Doubles DUPR', { selector: 'input' }), { target: { value: '3.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }));
    await waitFor(() => expect(fixture.saveStudioRating).toHaveBeenCalledWith(expect.objectContaining({ kind: 'doubles', value: 3.75 })));
    expect(screen.getByRole('button', { name: 'Sign in with DUPR' })).toBeDisabled();
  });

  it('labels coach notes as measured or as your estimate', async () => {
    const d = data();
    d.logs = [{ ...blankLog('2026-11-03'), id: 'l1', opponents: 'X', games: [{ you: 11, them: 3 }], score_for: 11, score_against: 3 }];
    d.sessions = [{ id: 's1', session_on: '2026-11-06', kind: 'solo', minutes: 30, intensity: null, drills: [{ category: 'Dinks', made: 30, attempts: 50 }], ratings: {}, note: '', created_at: '2026-11-06T00:00:00Z' }];
    fixture.studioData.mockImplementation(async () => d);
    render(<PlayerStudio section="coach" go={vi.fn()} />);
    const measured = await screen.findByRole('region', { name: 'Measured' });
    expect(within(measured).getByText(/Dinks: 30 made of 50 tries/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'YOUR ESTIMATES (NOT PROVEN)' })).toBeInTheDocument();
  });
});

describe('Claim', () => {
  it('sends a signed-out player to sign in with an email code, then back to the claim', async () => {
    fixture.user = null;
    const go = vi.fn();
    render(<Claim id={'b'.repeat(64)} go={go} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with email code' }));
    expect(fixture.remember).toHaveBeenCalledWith(`#/club-claim/${'b'.repeat(64)}`);
  });

  it('shows the matches found, then privacy choices, then claims', async () => {
    fixture.claimPreview.mockImplementation(async () => ({ playerId: 'p1', name: 'Fixture Me', club: 'Fixture Club', matches: 4, wins: 3, tournaments: [{ name: 'Fixture Open', date: '2026-11-01' }] }));
    const go = vi.fn();
    render(<Claim id="tok" go={go} />);
    expect(await screen.findByText('Fixture Club · 4 official matches, 3 wins')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'This is me' }));
    expect(screen.getByText(/Not your email, and not your diary/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Use these results in my Stats and Coach'));
    fireEvent.click(screen.getByRole('button', { name: 'Claim my matches' }));
    await waitFor(() => expect(fixture.claimPlayer).toHaveBeenCalledWith('tok', null, false));
    expect(go).toHaveBeenCalledWith('club-player-studio', 'matches', { replace: true });
  });

  it('explains a used or wrong link', async () => {
    fixture.claimPreview.mockImplementation(async () => ({ error: 'Someone has already claimed this player. If that wasn’t you, tell the organiser.' }));
    render(<Claim id="tok" go={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/already claimed/);
    expect(screen.queryByRole('button', { name: 'Claim my matches' })).not.toBeInTheDocument();
  });

  it('lets organisers send each player their own claim link', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
    render(<ClaimLinks tournament="Fixture Open" players={[{ id: 'p1', clubId: 'c', name: 'Fixture Me', share: {} }, { id: 'p2', clubId: 'c', name: 'Linked Player', userId: 'u9', share: {} }]} />);
    expect(screen.getByText('Claimed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send claim link to Fixture Me' }));
    await waitFor(() => expect(fixture.claimLink).toHaveBeenCalledWith('p1'));
    expect(await screen.findByRole('status')).toHaveTextContent('Fixture Me: Message copied');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining(`#/club-claim/${'a'.repeat(64)}`));
  });
});
