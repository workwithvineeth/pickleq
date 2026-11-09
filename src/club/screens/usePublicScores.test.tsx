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
  it('ignores a response from a previous tournament after navigation', async () => {
    let resolve!: (d: PublicTournament) => void;
    sources.mockResolvedValue([{ publicTournament: read }]); read.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce({ ...score, name: 'New tournament' });
    const { result, rerender } = renderHook(({ slug }) => usePublicScores(slug), { initialProps: { slug: 'old' } });
    await act(async () => {}); rerender({ slug: 'new' }); await act(async () => {});
    await act(async () => { resolve(score); }); expect(result.current.data?.name).toBe('New tournament');
  });
});
