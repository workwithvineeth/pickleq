import { useState } from 'react';

/** Test stand-in for vite-plugin-pwa's virtual module. */
export function useRegisterSW() {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return { needRefresh, offlineReady, updateServiceWorker: async () => {} };
}
