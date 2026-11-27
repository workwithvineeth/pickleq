import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicTournament } from '../backend';
import type { LiveScoreMessage, LiveScoreStream } from '../live/scoreStream';
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

const match = { id: 'm', court: 1, stage: 'pool', status: 'live', games: [{ a: 0, b: 0, points: '' }] } as const;
const event: PublicTournament = { ...score, matches: [{ ...match, games: [...match.games] }] };

function fakeStream() {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const connections: { receive: Parameters<LiveScoreStream['subscribe']>[1]; status: Parameters<LiveScoreStream['subscribe']>[2]; stop: ReturnType<typeof vi.fn> }[] = [];
  const subscribe = vi.fn<LiveScoreStream['subscribe']>((_slug, receive, status) => {
    const stop = vi.fn();
    connections.push({ receive, status, stop });
    status('connecting');
    return stop;
  });
  const stream = vi.fn(() => ({ subscribe }));
  sources.mockResolvedValue([{ publicTournament: vi.fn().mockResolvedValue(null) }, { publicTournament: read, liveScores: stream }]);
  read.mockResolvedValue(event);
  return { subscribe, connections };
}

const elapsed = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const point = (a: number, at: number): LiveScoreMessage => ({ id: 'm', status: 'live', court: 1, games: [{ a, b: 0, points: '' }], at });
const withPoint = (a: number): PublicTournament => ({ ...event, matches: [{ ...event.matches[0], games: point(a, 1).games }] });

describe('public score stream', () => {
  it('applies points immediately without downloading the whole tournament again', async () => {
    const { subscribe, connections } = fakeStream();
    const { result, unmount } = renderHook(() => usePublicScores('sample'));
    await elapsed(0);
    expect(subscribe).toHaveBeenCalledWith('sample', expect.any(Function), expect.any(Function));
    await act(async () => connections[0].status('live'));
    expect(result.current.live).toBe(true);
    read.mockClear().mockResolvedValue(withPoint(3));
    act(() => connections[0].receive(point(2, 200)));
    expect(result.current.data?.matches[0].games[0].a).toBe(2);
    await elapsed(700);
    act(() => connections[0].receive(point(3, 300)));
    act(() => connections[0].receive(point(1, 100)));
    expect(result.current.data?.matches[0].games[0].a).toBe(3);
    expect(result.current.updatedAt).toBe(Date.now());
    await elapsed(10_000);
    expect(read).not.toHaveBeenCalled();
    unmount();
  });

  it('fetches the tournament once, spread over a few seconds, for a match it does not know yet', async () => {
    const { connections } = fakeStream();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { unmount } = renderHook(() => usePublicScores('sample'));
    await elapsed(0);
    await act(async () => connections[0].status('live'));
    read.mockClear();
    const knockout = (at: number): LiveScoreMessage => ({ ...point(0, at), id: 'new-final' });
    act(() => connections[0].receive(knockout(100)));
    act(() => connections[0].receive(knockout(200)));
    await elapsed(2999); expect(read).not.toHaveBeenCalled();
    await elapsed(1); expect(read).toHaveBeenCalledOnce();
    unmount();
  });

  it('polls at 60 seconds while live and 20 while down, and fetches as it reconnects', async () => {
    const { subscribe, connections } = fakeStream();
    const { result, unmount } = renderHook(() => usePublicScores('sample'));
    await elapsed(0);
    await act(async () => connections[0].status('live'));
    expect(read).toHaveBeenCalledTimes(2);
    await elapsed(59_999); expect(read).toHaveBeenCalledTimes(2);
    await elapsed(1); expect(read).toHaveBeenCalledTimes(3);
    act(() => connections[0].status('down'));
    expect(result.current.live).toBe(false);
    expect(connections[0].stop).toHaveBeenCalledOnce();
    await elapsed(999); expect(subscribe).toHaveBeenCalledOnce();
    await elapsed(1); expect(subscribe).toHaveBeenCalledTimes(2); expect(read).toHaveBeenCalledTimes(4);
    await elapsed(18_999); expect(read).toHaveBeenCalledTimes(4);
    await elapsed(1); expect(read).toHaveBeenCalledTimes(5);
    await act(async () => connections[1].status('live'));
    expect(result.current.live).toBe(true);
    expect(read).toHaveBeenCalledTimes(6);
    unmount();
  });

  it('keeps a newer message while an older full response is on its way', async () => {
    const { connections } = fakeStream();
    const { result, unmount } = renderHook(() => usePublicScores('sample'));
    await elapsed(0);
    let finish!: (data: PublicTournament) => void;
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => connections[0].status('live'));
    act(() => connections[0].receive(point(2, 200)));
    await act(async () => finish(event));
    expect(result.current.data?.matches[0].games[0].a).toBe(2);
    read.mockResolvedValue(withPoint(2));
    await elapsed(1500);
    expect(result.current.data?.matches[0].games[0].a).toBe(2);
    unmount();
  });

  it('reconnects on online or visible and stops poll, stream and retries on unmount', async () => {
    const { subscribe, connections } = fakeStream();
    const { unmount } = renderHook(() => usePublicScores('sample'));
    await elapsed(0);
    act(() => connections[0].status('down'));
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(subscribe).toHaveBeenCalledTimes(2);
    act(() => connections[1].status('down'));
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(subscribe).toHaveBeenCalledTimes(3);
    act(() => connections[2].receive(point(1, 100)));
    act(() => connections[2].status('down'));
    const calls = read.mock.calls.length;
    unmount();
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    await elapsed(120_000);
    expect(read).toHaveBeenCalledTimes(calls);
    expect(subscribe).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disconnects when the minute check finds a finished tournament', async () => {
    const { connections } = fakeStream();
    const { result, unmount } = renderHook(() => usePublicScores('sample'));
    await elapsed(0);
    await act(async () => connections[0].status('live'));
    read.mockResolvedValue({ ...withPoint(1), status: 'done' });
    act(() => connections[0].receive(point(1, 100)));
    await elapsed(60_000);
    expect(result.current).toMatchObject({ data: { status: 'done' }, live: false });
    expect(connections[0].stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });
});
