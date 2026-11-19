import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SocialPicker } from './TvPicker';
import { copyLink } from '../../club/screens/common';

const { events } = vi.hoisted(() => ({ events: vi.fn() }));
vi.mock('../../club', () => ({ serverBackend: () => ({ publicEvents: events }) }));
vi.mock('../../club/config', () => ({ inLaunchCity: () => true }));
afterEach(() => vi.clearAllMocks());

it('UX-07: with no event in the link it asks for one, and Choose tournament opens the chosen one', async () => {
  events.mockResolvedValue([{ slug: 'cedar-open', name: 'Cedar Open', status: 'draft', startDate: '2026-12-05', city: 'Hyderabad' }]);
  const go = vi.fn();
  render(<SocialPicker go={go} />);
  expect(screen.getByRole('heading', { name: 'Social posts' })).toBeInTheDocument();
  expect(screen.getByText('No tournament selected')).toBeInTheDocument();
  expect(screen.getByText('Choose a tournament to create and share match-day posts.')).toBeInTheDocument();
  const choose = screen.getByRole('button', { name: 'Choose tournament' });
  expect(choose).toBeDisabled();
  fireEvent.click(await screen.findByRole('button', { name: /Cedar Open/ }));
  fireEvent.click(choose);
  expect(go).toHaveBeenCalledWith('club-social', 'cedar-open');
});

it('UX-07: with no tournaments it says so and offers Create tournament', async () => {
  events.mockResolvedValue([]);
  const go = vi.fn();
  render(<SocialPicker go={go} />);
  expect(await screen.findByText('No tournaments yet')).toBeInTheDocument();
  expect(screen.getByText('Create a tournament to get started.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));
  expect(go).toHaveBeenCalledWith('club');
});

it('UX-06: Copy link says Link copied, or plainly that it could not copy', async () => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
  expect(await copyLink('https://example.test/#/court/abc')).toEqual({ ok: true, text: 'Link copied' });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => { throw new Error('denied'); }) }, configurable: true });
  expect(await copyLink('https://example.test/#/court/abc')).toEqual({ ok: false, text: "Couldn't copy the link. Try again." });
});

it('follows Day mode instead of staying dark (QA checkpoint 2)', async () => {
  const { chooseTheme } = await import('../../theme');
  chooseTheme('light');
  events.mockResolvedValue([]);
  const { container } = render(<SocialPicker go={vi.fn()} />);
  await screen.findByText('No tournaments yet');
  const main = container.querySelector('main')!;
  expect(main.hasAttribute('data-day')).toBe(true);
  expect(main.style.background).toBe('rgb(43, 110, 75)');
  chooseTheme('dark');
});
