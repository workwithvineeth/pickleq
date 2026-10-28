import { useCallback, useEffect, useState } from 'react';

export type Tab = 'home' | 'matches' | 'train' | 'stats' | 'coach';
export type RouteName = Tab | 'log' | 'backfill' | 'settings' | 'trash' | 'backup' | 'ratings' | 'goals' | 'session-new' | 'session' | 'match' | 'edit' | 'details' | 'clips' | 'tournaments' | 'tournament-new' | 'tournament' | 'tournament-edit' | 'coach-task' | 'conversation' | 'coach-settings' | 'report' | 'help' | 'privacy'
  | 'club' | 'club-signin' | 'club-new' | 'club-join' | 'club-view' | 'club-player' | 'club-tournament' | 'club-tournament-new' | 'club-score' | 'club-sharing' | 'results';
export interface Route { name: RouteName; id?: string }

const simple: RouteName[] = ['club', 'club-signin', 'club-new', 'home', 'train', 'stats', 'coach', 'tournaments', 'tournament-new', 'coach-settings', 'report', 'help', 'privacy', 'backfill', 'settings', 'trash', 'backup', 'ratings', 'goals', 'session-new'];
const withId: RouteName[] = ['club-join', 'club-view', 'club-player', 'club-tournament', 'club-tournament-new', 'club-score', 'club-sharing', 'results', 'match', 'edit', 'details', 'session', 'tournament', 'tournament-edit', 'coach-task', 'conversation'];
const optionalId: RouteName[] = ['matches', 'clips', 'log'];
export const TABS: Tab[] = ['home', 'matches', 'train', 'stats', 'coach'];

export function parseRoute(hash: string): Route {
  const [name, id] = hash.replace(/^#\/?/, '').split('/');
  if ((optionalId as string[]).includes(name)) return id ? { name: name as RouteName, id: decodeURIComponent(id) } : { name: name as RouteName };
  if ((simple as string[]).includes(name)) return { name: name as RouteName };
  if ((withId as string[]).includes(name) && id) return { name: name as RouteName, id: decodeURIComponent(id) };
  return { name: 'home' };
}

export function routeHash(r: Route): string {
  return r.id ? `#/${r.name}/${encodeURIComponent(r.id)}` : `#/${r.name}`;
}

export type Go = (name: RouteName, id?: string, opts?: { replace?: boolean }) => void;

/** Hash-based routes so the phone's back button and GitHub Pages both work. */
export function useRoute(): [Route, Go, () => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback<Go>((name, id, opts) => {
    const next: Route = { name, id };
    const hash = routeHash(next);
    if (window.location.hash !== hash) {
      if (opts?.replace) window.history.replaceState(null, '', hash);
      else window.location.hash = hash;
    }
    setRoute(next);
    window.scrollTo?.(0, 0);
  }, []);
  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else go('home');
  }, [go]);
  return [route, go, back];
}
