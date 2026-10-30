import { useRegisterSW } from 'virtual:pwa-register/react';

/** Shows "Update ready" when a new version has downloaded; nothing changes until the user taps. */
export function UpdatePrompt() {
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
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.setInterval(check, 30 * 60 * 1000);
    },
  });

  if (needRefresh) {
    return (
      <div className="toast" role="status">
        <span>A new version of {import.meta.env.VITE_CLUB_APP === "on" ? "PQ Club" : "PICKLEQ"} is ready.</span>
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
  if (offlineReady) {
    return (
      <div className="toast" role="status">
        <span>{import.meta.env.VITE_CLUB_APP === "on" ? "PQ Club" : "PICKLEQ"} now works offline.</span>
        <button type="button" onClick={() => setOfflineReady(false)}>OK</button>
      </div>
    );
  }
  return null;
}
