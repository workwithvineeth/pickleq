import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicTournament } from '../backend';
import { usePublicScores } from './usePublicScores';
const { read, sources } = vi.hoisted(() => ({ read: vi.fn(), sources: vi.fn() }));
vi.mock('../index', () => ({ publicSourcesFor: sources }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const score = { name: 'Sample', status: 'live' } as PublicTournament;
describe('public score refresh lifecycle', () => {
  it('retains the last score on refresh failure and pauses while hidden', async () => {
    vi.useFakeTimers(); let hidden = false; vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    sources.mockResolvedValue([{ publicTournament: read }]); read.mockResolvedValueOnce(score).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(score);
    const { result, unmount } = renderHook(() => usePublicScores('sample'));
    await act(async () => {}); expect(result.current.data).toBe(score);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); expect(result.current.data).toBe(score); expect(result.current.error).toBe('Offline');
    hidden = true; await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); expect(read).toHaveBeenCalledTimes(2);
    hidden = false; await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); expect(read).toHaveBeenCalledTimes(3);
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('reports when scores last arrived and how many polls failed in a row', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    sources.mockResolvedValue([{ publicTournament: read }]);
    read.mockResolvedValueOnce(score).mockRejectedValueOnce(new Error('Offline')).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(score);
    const { result, unmount } = renderHook(() => usePublicScores('sample'));
    expect(result.current).toMatchObject({ updatedAt: null, failures: 0 });
    await act(async () => {}); expect(result.current).toMatchObject({ updatedAt: 1_000_000, failures: 0 });
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); expect(result.current).toMatchObject({ updatedAt: 1_000_000, failures: 1, data: score });
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); expect(result.current.failures).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); expect(result.current).toMatchObject({ updatedAt: 1_060_000, failures: 0, error: null });
    unmount();
  });
  it('ignores a response from a previous tournament after navigation', async () => {
    let resolve!: (d: PublicTournament) => void;
    sources.mockResolvedValue([{ publicTournament: read }]); read.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce({ ...score, name: 'New tournament' });
    const { result, rerender } = renderHook(({ slug }) => usePublicScores(slug), { initialProps: { slug: 'old' } });
    await act(async () => {}); rerender({ slug: 'new' }); await act(async () => {});
    await act(async () => { resolve(score); }); expect(result.current.data?.name).toBe('New tournament');
  });
  it('downloads the full tournament only when its version changes, with a full refresh every 2 minutes', async () => {
    vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const rev = vi.fn().mockResolvedValue('v1');
    sources.mockResolvedValue([{ publicTournament: read, publicTournamentRev: rev }]); read.mockResolvedValue(score);
    const { unmount } = renderHook(() => usePublicScores('sample'));
    await act(async () => {}); expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000 * 4); }); expect(read).toHaveBeenCalledTimes(1); // nothing changed: only the tiny version check
    rev.mockResolvedValue('v2');
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); }); expect(read).toHaveBeenCalledTimes(2); // a point was scored
    await act(async () => { await vi.advanceTimersByTimeAsync(20000 * 6); }); expect(read).toHaveBeenCalledTimes(3); // safety-net full refresh
    unmount();
  });
});
