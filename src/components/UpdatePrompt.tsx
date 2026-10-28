import { useRegisterSW } from 'virtual:pwa-register/react';

/** Shows "Update ready" when a new version has downloaded; nothing changes until the user taps. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (needRefresh) {
    return (
      <div className="toast" role="status">
        <span>A new version of PICKLEQ is ready.</span>
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
        <span>PICKLEQ now works offline.</span>
        <button type="button" onClick={() => setOfflineReady(false)}>OK</button>
      </div>
    );
  }
  return null;
}
