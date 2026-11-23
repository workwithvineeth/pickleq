import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ClubBackend } from '../backend';
import { deskBackend } from '../desk';
import type { LiveScoreMessage, LiveScoreStream } from '../live/scoreStream';
import { DeskCtx } from './deskContext';
import { useTournament } from './Organiser';

afterEach(() => { vi.useRealTimers(); });

it.each([true, false])('keeps the PIN desk poll and subscribes only when public (%s)', async isPublic => {
  vi.useFakeTimers();
  const bundle = {
    tournament: { id: 'event', publicSlug: 'cedar-open', isPublic, approval: 'approved', status: 'live' },
    desk: true, divisions: [], entries: [], matches: [],
  };
  const read = vi.fn().mockResolvedValue(bundle);
  const stop = vi.fn();
  const subscribe = vi.fn<LiveScoreStream['subscribe']>(() => stop);
  const source = { deskOpen: read, liveScores: () => ({ subscribe }) } as unknown as ClubBackend;
  const value = { b: deskBackend(source, 'token', '1234'), token: 'token', leave: vi.fn() };
  const wrapper = ({ children }: { children: ReactNode }) => <DeskCtx.Provider value={value}>{children}</DeskCtx.Provider>;
  const { unmount } = renderHook(() => useTournament('event', 8000), { wrapper });
  const elapsed = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await elapsed(0);
  expect(read).toHaveBeenCalledTimes(1);
  if (isPublic) {
    expect(subscribe).toHaveBeenCalledWith('cedar-open', expect.any(Function), expect.any(Function));
    const [, receive, status] = subscribe.mock.calls[0];
    const score: LiveScoreMessage = { id: 'm', status: 'live', games: [], at: Date.now() };
    act(() => receive(score));
    await elapsed(500);
    act(() => receive(score));
    await elapsed(999);
    expect(read).toHaveBeenCalledTimes(1);
    await elapsed(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledTimes(1);
    act(() => status('down'));
    await elapsed(6500);
    expect(read).toHaveBeenCalledTimes(3);
    act(() => receive(score));
    unmount();
    await elapsed(1000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(stop).toHaveBeenCalledOnce();
  } else {
    expect(subscribe).not.toHaveBeenCalled();
    await elapsed(8000);
    expect(read).toHaveBeenCalledTimes(2);
    unmount();
  }
});
