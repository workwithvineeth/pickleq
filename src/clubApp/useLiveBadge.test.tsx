import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countLiveCourts, useLiveBadge } from './useLiveBadge';
import type { PublicTournament } from '../club/backend';
const { events, tournament } = vi.hoisted(() => ({ events: vi.fn(), tournament: vi.fn() }));
vi.mock('../club/index', () => ({ eventsBackend: () => ({ publicEvents: events, publicTournament: tournament }) }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const score = { status: 'live', matches: [{ court: 1, status: 'live' }, { court: 1, status: 'live' }, { court: 2, status: 'scheduled' }, { court: 3, status: 'void' }, { court: 4, status: 'live' }] } as PublicTournament;
describe('truthful live court chip', () => {
  it('counts unique active courts only and never counts finished tournaments', () => {
    expect(countLiveCourts(score)).toBe(2); expect(countLiveCourts(null)).toBe(0); expect(countLiveCourts({ ...score, status: 'done' })).toBe(0);
  });
  it('reads only the focused public event, hides after errors, pauses and cleans up', async () => {
    vi.useFakeTimers(); let hidden = false; vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    tournament.mockResolvedValueOnce(score).mockRejectedValueOnce(Error('offline'));
    const { result, unmount } = renderHook(() => useLiveBadge('public-event', true));
    await act(async () => {}); expect(result.current).toMatchObject({ count: 2, slug: 'public-event' }); expect(events).not.toHaveBeenCalled();
    hidden = true; await act(async () => { await vi.advanceTimersByTimeAsync(30000); }); expect(tournament).toHaveBeenCalledTimes(1);
    hidden = false; await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); expect(result.current.count).toBe(0);
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('makes no global count request when a club has no public live event', async () => {
    const { result } = renderHook(() => useLiveBadge(undefined, true)); await act(async () => {});
    expect(result.current.count).toBe(0); expect(events).not.toHaveBeenCalled(); expect(tournament).not.toHaveBeenCalled();
  });
});
