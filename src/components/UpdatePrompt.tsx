import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Shows "Update ready" when a new version has downloaded; nothing changes until the user taps.
 * `offlineNotice` (default on) also says once that the app works offline. `inline` puts the prompt in the page flow at the top
 * instead of floating, so it never covers a form or a button (the PaddleQ club app uses both: no offline notice, inline).
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
    const ready = () => { if (hadController) setNeedRefresh(true); hadController = true; };
    worker.addEventListener('controllerchange', ready);
    return () => worker.removeEventListener('controllerchange', ready);
  }, [setNeedRefresh]);

  if (needRefresh) {
    return (
      <div className={inline ? 'toast toast-inline' : 'toast'} role="status">
        <span>A new version of {import.meta.env.VITE_CLUB_APP === "on" ? "PaddleQ" : "PICKLEQ"} is ready.</span>
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
        <span>{import.meta.env.VITE_CLUB_APP === "on" ? "PaddleQ" : "PICKLEQ"} now works offline.</span>
        <button type="button" onClick={() => setOfflineReady(false)}>OK</button>
      </div>
    );
  }
  return null;
}
