import { useEffect, useRef } from 'react';
import { isOnline } from './useConnection';

export const FLUSH_EVERY_MS = 15_000;
export interface FlushResult { sent: number; blocked: number; offline: boolean }

/**
 * Sends the scores a phone kept while offline: when the list opens, the moment the signal comes back, and every 15 seconds.
 * One send at a time. `onChange` runs when something was sent or refused, so the list can refresh.
 */
export function useFlushUnsent(enabled: boolean, flush: (active: () => boolean) => Promise<FlushResult>, onChange?: () => void): void {
  const latest = useRef({ flush, onChange });
  const running = useRef(false);
  latest.current = { flush, onChange };
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = async () => {
      if (!alive || running.current || !isOnline()) return;
      running.current = true;
      try {
        const r = await latest.current.flush(() => alive);
        if (alive && (r.sent > 0 || r.blocked > 0)) latest.current.onChange?.();
      } catch { /* the next round tries again */ } finally { running.current = false; }
    };
    void run();
    const h = window.setInterval(() => void run(), FLUSH_EVERY_MS);
    window.addEventListener('online', run);
    return () => { alive = false; window.clearInterval(h); window.removeEventListener('online', run); };
  }, [enabled]);
}
