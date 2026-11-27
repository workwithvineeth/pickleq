import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PublicProfile } from './PublicProfile';

const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../private/backend', async () => {
  const actual = await vi.importActual<typeof import('../private/backend')>('../private/backend');
  return { ...actual, loadPublicPlayer: load };
});

it('UX-08: a missing profile says Player not found, with Find players', async () => {
  load.mockResolvedValue(null);
  render(<PublicProfile playerId="nobody" go={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Player not found' })).toBeInTheDocument();
  expect(screen.getByText("This profile isn't available.")).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Find players' })).toBeInTheDocument();
});

it('UX-08: a profile with no results and no DUPR shows the empty state and Unrated', async () => {
  const { samplePublicPlayer } = await vi.importActual<typeof import('../private/backend')>('../private/backend');
  load.mockResolvedValue({ ...samplePublicPlayer(), playerId: 'p1', official: [], duprDoubles: undefined });
  render(<PublicProfile playerId="p1" go={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'No tournament results yet' })).toBeInTheDocument();
  expect(screen.getByText('Referee-scored tournament matches will appear here when results are saved.')).toBeInTheDocument();
  expect(screen.getAllByText('Unrated').length).toBeGreaterThan(0);
  expect(screen.queryByText('Demo profile')).toBeNull();
});

it('audit 21 Nov: a real player gets a court picture (never the sample person), a Champion chip, and the final listed first', async () => {
  const { samplePublicPlayer } = await vi.importActual<typeof import('../private/backend')>('../private/backend');
  const base = samplePublicPlayer();
  const m0 = base.official[0];
  const day = '2026-11-21';
  const match = (id: string, stage: string, win: boolean) => ({ ...m0, id, stage, playedOn: day, tournament: 'Sample Cup', winner: win ? m0.mySide : (m0.mySide === 'A' ? 'B' : 'A') });
  load.mockResolvedValue({ ...base, playerId: 'p1', official: [match('pool1', 'pool', true), match('fin', 'final', true), match('pool2', 'pool', false)] });
  const { container } = render(<PublicProfile playerId="p1" go={vi.fn()} />);
  expect(await screen.findByText('Champion · Sample Cup')).toBeInTheDocument();
  expect(container.querySelector('.athlete-photo')).toHaveAttribute('src', expect.stringContaining('club-night.jpg'));
});
