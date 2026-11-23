import { act, render, screen, within } from '@testing-library/react';
import qrcode from 'qrcode-generator';
import { afterEach, expect, it, vi } from 'vitest';
import type { ClubBackend, PublicTournament } from '../../club/backend';
import { publicSourcesFor } from '../../club/index';
import { LIVE_SCORE_STALE_MS, type LiveScoreStream } from '../../club/live/scoreStream';
import { RallyTV } from './RallyTV';

vi.mock('../../club/index', () => ({
  publicSourcesFor: vi.fn().mockResolvedValue([]),
  eventsBackend: () => ({ currentUser: async () => null }),
}));
vi.mock('../useClubLogo', () => ({ useClubLogo: () => null, logoTile: () => '' }));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.mocked(publicSourcesFor).mockResolvedValue([]); });

it('shows scores from the live feed before a timer or poll runs, and warns when scores go stale', async () => {
  vi.useFakeTimers();
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const match = { id: 'm', court: 1, stage: 'pool', status: 'live', games: [{ a: 2, b: 0, points: '' }] } as const;
  const event: PublicTournament = {
    name: 'Cedar Open', club: 'Cedar', startDate: '2026-11-20', startTime: '18:00', slotMinutes: 20,
    status: 'live', divisions: [], entries: [], matches: [{ ...match, games: [...match.games] }],
  };
  const read = vi.fn<ClubBackend['publicTournament']>().mockResolvedValue(event);
  const subscribe = vi.fn<LiveScoreStream['subscribe']>(() => () => undefined);
  const source: Pick<ClubBackend, 'publicTournament' | 'liveScores'> = { publicTournament: read, liveScores: () => ({ subscribe }) };
  vi.mocked(publicSourcesFor).mockResolvedValue([source as ClubBackend]);
  render(<RallyTV slug="cedar-open" go={vi.fn()} />);
  await act(async () => {});
  const [, receive, status] = subscribe.mock.calls[0];
  await act(async () => status('live'));
  expect(screen.getByRole('status')).toHaveTextContent('Scores update live');
  const court = within(screen.getByRole('button', { name: /Court 1/ }));
  expect(court.getByText('2', { exact: true })).toBeVisible();
  const reads = read.mock.calls.length;
  act(() => receive({ ...match, games: [{ a: 7, b: 0, points: '' }], at: Date.now() }));
  expect(court.getByText('7', { exact: true })).toBeVisible();
  expect(read).toHaveBeenCalledTimes(reads);

  hidden = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(LIVE_SCORE_STALE_MS + 15_000); });
  expect(screen.getByRole('status')).toHaveTextContent('Reconnecting · scores may be behind');
  expect(screen.getByRole('status')).toHaveClass('rqm-stale');
});

it('shows the accessible QR only with square fit and encodes the public live page', async () => {
  const go = vi.fn();
  const { rerender } = render(<RallyTV slug="cedar-open" go={go} />);
  const label = { name: 'QR code: watch live on rallyq.in' };
  expect(screen.queryByRole('img', label)).not.toBeInTheDocument();
  rerender(<RallyTV slug="cedar-open?fit=square" go={go} />);
  expect(screen.getByText('Watch live on rallyq.in')).toBeVisible();
  const expected = qrcode(0, 'M');
  expected.addData(`${location.origin}${import.meta.env.BASE_URL}#/live/cedar-open`);
  expected.make();
  expect(screen.getByRole('img', label)).toHaveAttribute('src', expected.createDataURL(8));
  await act(async () => {});
});
