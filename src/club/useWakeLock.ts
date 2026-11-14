import { useEffect } from 'react';

/** Keeps the phone screen awake while this screen is open (the referee pad: a dark screen between rallies loses the score).
 * Quietly does nothing where the browser has no screen wake lock. Asks again when the person comes back to the tab. */
export function useWakeLock(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const ask = async () => {
      try {
        const got = await navigator.wakeLock.request('screen');
        if (stopped) { void got.release().catch(() => undefined); return; }
        lock = got;
      } catch { /* A refused lock (low battery, background tab) must never get in the way of scoring. */ }
    };
    const again = () => { if (document.visibilityState === 'visible' && !stopped) void ask(); };
    void ask();
    document.addEventListener('visibilitychange', again);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', again);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
