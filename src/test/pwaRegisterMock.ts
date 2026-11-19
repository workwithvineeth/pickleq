import { useState } from 'react';

/** Test stand-in for vite-plugin-pwa's virtual module. Tests can set the starting state with `pwaMockState`. */
export const pwaMockState = { needRefresh: false, offlineReady: false };
export function useRegisterSW() {
  const needRefresh = useState(pwaMockState.needRefresh);
  const offlineReady = useState(pwaMockState.offlineReady);
  return { needRefresh, offlineReady, updateServiceWorker: async () => {} };
}
