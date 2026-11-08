import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PublicTournament } from '../backend';
import { PublicScoreAnnouncement } from './PublicScoreAnnouncement';
afterEach(() => { vi.useRealTimers(); });
it('announces changed totals politely after one second, with no initial or unchanged-poll repeat', async () => {
  vi.useFakeTimers();
  const data = { entries: [{ id: 'a', names: ['Alex'] }, { id: 'b', names: ['Robin'] }], matches: [{ id: 'm', court: 1, entryA: 'a', entryB: 'b', status: 'live', games: [{ a: 1, b: 2 }] }] } as PublicTournament;
  const { container, rerender, unmount } = render(<PublicScoreAnnouncement slug="one" data={data} />);
  const live = container.querySelector('[aria-live]')!;
  expect(live).toHaveAttribute('aria-live', 'polite'); expect(live).toHaveAttribute('aria-atomic', 'true'); expect(live).toHaveTextContent('');
  const next = { ...data, matches: [{ ...data.matches[0], games: [{ a: 2, b: 2, points: '' }] }] };
  rerender(<PublicScoreAnnouncement slug="one" data={next} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(999); }); expect(live).toHaveTextContent('');
  await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(live).toHaveTextContent('Court 1: Alex, 2. Robin, 2.');
  rerender(<PublicScoreAnnouncement slug="one" data={{ ...next }} />); expect(vi.getTimerCount()).toBe(0);
  rerender(<PublicScoreAnnouncement slug="two" data={next} />); expect(live).toHaveTextContent('');
  unmount(); expect(vi.getTimerCount()).toBe(0);
});
