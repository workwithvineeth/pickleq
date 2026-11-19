import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Screens where points are entered: court/referee links, the desk and the club scorer. */
const SCORING = /^#\/(court|club-score|desk|club-desk|helper)(\/|$)/;
/** Scores kept on this phone until they are sent (same key as club/matchdaySafety.ts; read here so no club code enters the personal app). */
const UNSENT_KEY = 'pq-club-unsent-scores';
const MATCHDAY_CHECK_MS = 3000;

/**
 * Match-day screens take an update by themselves, but only at a safe moment (audit 19 Nov): no score pad open, nobody typing,
 * and no points waiting on this phone to be sent. Until then they keep checking.
 */
export function safeToReload(doc: Document = document, storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  if (!SCORING.test(window.location.hash)) return false;
  if (doc.querySelector('.score-tap')) return false;
  const el = doc.activeElement as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
  try { const v = storage?.getItem(UNSENT_KEY); if (v && v !== '{}') return false; } catch { return false; }
  return true;
}
function safeStorage() { try { return window.localStorage; } catch { return null; } }

/**
 * Shows "Update ready" when a new version has downloaded; nothing changes until the user taps.
 * `offlineNotice` (default on) also says once that the app works offline. `inline` puts the prompt in the page flow at the top
 * instead of floating, so it never covers a form or a button (the RallyQ club app uses both: no offline notice, inline).
 */
export function UpdatePrompt({ offlineNotice = true, inline = false }: { offlineNotice?: boolean; inline?: boolean } = {}) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    // Installed apps (especially on iPhone) only look for updates on a cold start unless asked.
    // Check whenever the app comes back to the screen, and every 30 minutes while it's open.
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine !== false) void reg.update().catch(() => {}); };
      if (import.meta.env.VITE_CLUB_APP === 'on') check();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.setInterval(check, 30 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (import.meta.env.VITE_CLUB_APP !== 'on' || !('serviceWorker' in navigator)) return;
    const worker = navigator.serviceWorker;
    // Club workers activate immediately. Keep the open page's update button visible even after activation.
    // Let the organiser choose when to reload so scoring and unsaved edits are preserved.
    // On a first visit the worker takes control of a page it didn't control yet: that's not an update, so say nothing.
    let hadController = !!worker.controller;
    const ready = () => {
      // A newer version took over right after opening: reload now so nobody keeps looking at an old cached build.
      // Never on scoring screens: a referee may already have tapped a point that isn't saved yet.
      if (hadController && import.meta.env.MODE !== 'test' && performance.now() < 15000 && !SCORING.test(window.location.hash)) { window.location.reload(); return; }
      if (hadController) setNeedRefresh(true); hadController = true;
    };
    worker.addEventListener('controllerchange', ready);
    return () => worker.removeEventListener('controllerchange', ready);
  }, [setNeedRefresh]);

  // On match-day screens an update applies itself at the next safe moment instead of waiting for a tap.
  useEffect(() => {
    if (!needRefresh || import.meta.env.VITE_CLUB_APP !== 'on' || !SCORING.test(window.location.hash)) return;
    const h = window.setInterval(() => {
      if (!safeToReload()) return;
      window.clearInterval(h);
      void updateServiceWorker(true);
      window.setTimeout(() => window.location.reload(), 1500);
    }, MATCHDAY_CHECK_MS);
    return () => window.clearInterval(h);
  }, [needRefresh, updateServiceWorker]);

  if (needRefresh) {
    return (
      <div className={inline ? 'toast toast-inline' : 'toast'} role="status">
        <span>A new version of {import.meta.env.VITE_CLUB_APP === "on" ? "RallyQ" : "RallyQ"} is ready.</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="toast-dismiss" onClick={() => setNeedRefresh(false)}>Later</button>
          <button type="button" onClick={() => {
            void updateServiceWorker(true);
            // If the new version took over without a handover (e.g. the first visit after installing), reload ourselves.
            setTimeout(() => window.location.reload(), 2500);
          }}>Update</button>
        </span>
      </div>
    );
  }
  if (offlineReady && offlineNotice) {
    return (
      <div className="toast" role="status">
        <span>{import.meta.env.VITE_CLUB_APP === "on" ? "RallyQ" : "RallyQ"} now works offline.</span>
        <button type="button" onClick={() => setOfflineReady(false)}>OK</button>
      </div>
    );
  }
  return null;
}
