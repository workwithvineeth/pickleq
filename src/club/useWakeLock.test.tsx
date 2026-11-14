import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

describe('useWakeLock', () => {
  afterEach(() => { Reflect.deleteProperty(navigator, 'wakeLock'); });

  it('holds the screen while mounted and lets go on unmount', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { unmount } = renderHook(() => useWakeLock());
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    unmount();
    await vi.waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('does nothing without browser support, and survives a refused lock', async () => {
    expect(() => renderHook(() => useWakeLock()).unmount()).not.toThrow();
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { unmount } = renderHook(() => useWakeLock());
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    expect(() => unmount()).not.toThrow();
  });
});
