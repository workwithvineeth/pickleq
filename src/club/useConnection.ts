import { useEffect, useState } from 'react';
import { PHONE_SCORES_EVENT, countUnsent, readBlocked } from './matchdaySafety';

/** How long a problem has to last before the referee is told about it (a short wobble is not news). */
export const TROUBLE_AFTER_MS = 5000;

/** Whether the phone says it has a connection. Unknown counts as online: an odd browser must never raise a false alarm. */
export function isOnline(): boolean {
  try { return navigator.onLine !== false; } catch { return true; }
}

export function useOnline(): boolean {
  const [on, setOn] = useState(isOnline);
  useEffect(() => {
    const up = () => setOn(isOnline()), down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

/** Scores kept on this phone, waiting to be sent, and scores the server refused for good. Re-read every second. */
export function usePhoneScores(): { unsent: number; blocked: number } {
  const read = () => ({ unsent: countUnsent(), blocked: Object.keys(readBlocked()).length });
  const [v, setV] = useState(read);
  useEffect(() => {
    const tick = () => setV((old) => { const n = read(); return n.unsent === old.unsent && n.blocked === old.blocked ? old : n; });
    const h = window.setInterval(tick, 1000);
    window.addEventListener('storage', tick); window.addEventListener('online', tick); window.addEventListener(PHONE_SCORES_EVENT, tick);
    return () => { window.clearInterval(h); window.removeEventListener('storage', tick); window.removeEventListener('online', tick); window.removeEventListener(PHONE_SCORES_EVENT, tick); };
  }, []);
  return v;
}

/** True only once `trouble` has been true for `ms` without a break. */
export function useTroubleFor(trouble: boolean, ms = TROUBLE_AFTER_MS): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!trouble) { setShown(false); return; }
    const h = window.setTimeout(() => setShown(true), ms);
    return () => window.clearTimeout(h);
  }, [trouble, ms]);
  return shown;
}
