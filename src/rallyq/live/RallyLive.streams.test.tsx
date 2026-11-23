import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PublicTournament } from '../../club/backend';
import type { PublicScores } from '../../club/screens/usePublicScores';
import { RallyLive } from './RallyLive';

const mocks = vi.hoisted(() => ({
  scores: null as unknown as PublicScores,
  server: {
    currentUser: async () => null,
    publicEvents: async () => [{ name: 'Sample Open', club: 'Sample Club', slug: 'sample-open', status: 'live', results: true }],
    publicCourtStreams: vi.fn(),
  },
}));
vi.mock('../../club', () => ({
  eventsBackend: () => mocks.server,
  serverBackend: () => mocks.server,
  isSampleSlug: () => false,
}));
vi.mock('../../club/screens/usePublicScores', () => ({ usePublicScores: () => mocks.scores }));

const videoId = 'Ab3dEfG_h-1';
const secondId = 'Ab3dEfG_h-2';
const format = { bestOf: 3, pointsTo: 11, scoring: 'rally' } as const;
const fixture = (a: number): PublicTournament => ({
  name: 'Sample Open', club: 'Sample Club', startDate: '2026-11-24', startTime: '10:00', slotMinutes: 20, status: 'live',
  divisions: [{ id: 'd', name: 'Doubles', kind: 'doubles', pools: 1, advance: 2, format, koFormat: format }],
  entries: [{ id: 'a', divisionId: 'd', names: ['Alex', 'Sam'] }, { id: 'b', divisionId: 'd', names: ['Robin', 'Taylor'] }],
  matches: [{ id: 'm', divisionId: 'd', court: 1, entryA: 'a', entryB: 'b', stage: 'pool', status: 'live',
    games: [{ a, b: 0, points: 'A'.repeat(a) }] }],
});

beforeEach(() => {
  localStorage.clear();
  mocks.scores = { data: fixture(2), error: null, loading: false, updatedAt: Date.now(), failures: 0 };
  mocks.server.publicCourtStreams.mockReset().mockResolvedValue([
    { court: 1, videoId, status: 'unknown' },
    { court: 2, videoId: secondId, status: 'unknown' },
  ]);
});
afterEach(() => vi.useRealTimers());

it('shows the selected video and can switch courts via the thumbnail or tabs', async () => {
  render(<RallyLive go={vi.fn()} />);
  expect(await screen.findByTitle('YouTube court video')).toHaveAttribute('src', expect.stringContaining(`youtube-nocookie.com/embed/${videoId}`));
  expect(screen.getByRole('link', { name: /Watch on YouTube/ })).toHaveAttribute('href', `https://www.youtube.com/watch?v=${videoId}`);
  const other = within(screen.getByRole('region', { name: 'Other courts' }));
  fireEvent.click(other.getByRole('button', { name: /Court 2/ }));
  expect(screen.getByRole('tab', { name: 'Court 2' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTitle('YouTube court video')).toHaveAttribute('src', expect.stringContaining(`/embed/${secondId}`));
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Court 2' }), { key: 'ArrowLeft' });
  expect(screen.getByRole('tab', { name: /Court 1/ })).toHaveAttribute('aria-selected', 'true');
});

it('delays new scores by default and keeps the same iframe as scores change', async () => {
  vi.useFakeTimers();
  const go = vi.fn();
  const { rerender, unmount } = render(<RallyLive go={go} />);
  await act(async () => {});
  const frame = screen.getByTitle('YouTube court video');
  expect(screen.getByRole('switch', { name: 'Synced to video' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByText('Delay 3 s')).toBeInTheDocument();

  mocks.scores = { ...mocks.scores, data: fixture(3) };
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  rerender(<RallyLive go={go} />);
  const teamPoints = () => screen.getByLabelText('Team A points');
  expect(teamPoints()).toHaveTextContent('2');
  await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
  expect(teamPoints()).toHaveTextContent('2');
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(teamPoints()).toHaveTextContent('3');
  expect(screen.getByTitle('YouTube court video')).toBe(frame);

  fireEvent.change(screen.getByRole('slider', { name: 'Score delay in seconds' }), { target: { value: '15' } });
  expect(screen.getByText('Delay 15 s')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: 'Synced to video' }));
  expect(screen.getByRole('switch', { name: 'Synced to video' })).toHaveTextContent('Instant scores');
  expect(teamPoints()).toHaveTextContent('3');
  expect(screen.getByTitle('YouTube court video')).toBe(frame);
  expect(JSON.parse(localStorage.getItem('pq-live-video-sync')!)).toEqual({ enabled: false, seconds: 15 });
  unmount();
  render(<RallyLive go={go} />);
  await act(async () => {});
  expect(screen.getByRole('switch', { name: 'Synced to video' })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByText('Delay 15 s')).toBeInTheDocument();
});

it('keeps the existing Arena board and controls when there is no linked video', async () => {
  mocks.server.publicCourtStreams.mockResolvedValue([]);
  const { container } = render(<RallyLive go={vi.fn()} />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Live scores' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: 'Venue' })).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Find a player' })).toBeInTheDocument();
  expect(screen.getByText('Courts · tap to follow')).toBeInTheDocument();
  expect(container.querySelector('.qboard20')).toBeInTheDocument();
  expect(container.querySelector('.court-watch')).not.toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(container.querySelector('iframe')).not.toBeInTheDocument();
});

it('refreshes links every minute and on return to the tab', async () => {
  vi.useFakeTimers();
  render(<RallyLive go={vi.fn()} />);
  await act(async () => {});
  expect(mocks.server.publicCourtStreams).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(mocks.server.publicCourtStreams).toHaveBeenCalledTimes(2);
  mocks.server.publicCourtStreams.mockResolvedValue([]);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(mocks.server.publicCourtStreams).toHaveBeenCalledTimes(3);
  expect(screen.queryByTitle('YouTube court video')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Live scores' })).toBeInTheDocument();
});
