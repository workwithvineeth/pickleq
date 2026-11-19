import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlushUnsent } from './useFlushUnsent';

describe('court list sends kept scores', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  const ok = { sent: 1, blocked: 0, offline: false };

  it('sends on open, when the signal returns, and every 15 seconds', async () => {
    const flush = vi.fn(async () => ok);
    renderHook(() => useFlushUnsent(true, flush));
    await act(async () => { await Promise.resolve(); });
    expect(flush).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(flush).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(flush).toHaveBeenCalledTimes(3);
    await act(async () => { vi.advanceTimersByTime(14_000); });
    expect(flush).toHaveBeenCalledTimes(3);
  });

  it('does nothing until enabled and never runs two sends at once', async () => {
    let release = () => {};
    const flush = vi.fn(() => new Promise<typeof ok>((r) => { release = () => r(ok); }));
    const { rerender } = renderHook(({ on }) => useFlushUnsent(on, flush), { initialProps: { on: false } });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(flush).not.toHaveBeenCalled();
    rerender({ on: true });
    await act(async () => { vi.advanceTimersByTime(30_000); window.dispatchEvent(new Event('online')); });
    expect(flush).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
  });

  it('tells the screen when something was sent or blocked, so it can refresh', async () => {
    const done = vi.fn();
    renderHook(() => useFlushUnsent(true, async () => ({ sent: 2, blocked: 0, offline: false }), done));
    await act(async () => { await Promise.resolve(); });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when there was nothing to send', async () => {
    const done = vi.fn();
    renderHook(() => useFlushUnsent(true, async () => ({ sent: 0, blocked: 0, offline: false }), done));
    await act(async () => { await Promise.resolve(); });
    expect(done).not.toHaveBeenCalled();
  });
  it('keeps one flush across disabling and re-enabling, and cancels the old batch', async () => {
    let release!: () => void;
    let active!: () => boolean;
    const flush = vi.fn((isActive: () => boolean) => {
      active = isActive;
      return new Promise<typeof ok>((resolve) => { release = () => resolve(ok); });
    });
    const { rerender } = renderHook(({ on }) => useFlushUnsent(on, flush), { initialProps: { on: true } });
    expect(active()).toBe(true);
    rerender({ on: false });
    expect(active()).toBe(false);
    rerender({ on: true });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(flush).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(flush).toHaveBeenCalledTimes(2);
    await act(async () => { release(); });
  });

});
