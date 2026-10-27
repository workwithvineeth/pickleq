import { useCallback, useEffect, useState } from 'react';

export type Tab = 'home' | 'matches' | 'train' | 'stats' | 'coach';
export type Route = Tab | 'log' | 'settings';

const routes: Route[] = ['home', 'matches', 'train', 'stats', 'coach', 'log', 'settings'];

export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '');
  return (routes as string[]).includes(name) ? (name as Route) : 'home';
}

/** Hash-based routes so the phone's back button and GitHub Pages both work. */
export function useRoute(): [Route, (r: Route) => void, () => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((r: Route) => {
    if (parseRoute(window.location.hash) !== r) window.location.hash = `/${r}`;
    setRoute(r);
  }, []);
  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else go('home');
  }, [go]);
  return [route, go, back];
}
