import { flushSync } from 'react-dom';
import { useCallback, useEffect, useState } from 'react';

export type Tab = 'home' | 'matches' | 'events' | 'train' | 'stats' | 'coach';
export type RouteName = Tab | 'log' | 'backfill' | 'settings' | 'trash' | 'backup' | 'ratings' | 'goals' | 'session-new' | 'session' | 'match' | 'edit' | 'details' | 'clips' | 'tournaments' | 'tournament-new' | 'tournament' | 'tournament-edit' | 'coach-task' | 'conversation' | 'coach-settings' | 'report' | 'help' | 'privacy'
  | 'club' | 'club-signin' | 'club-new' | 'club-join' | 'club-view' | 'club-player' | 'club-tournament' | 'club-tournament-new' | 'club-score' | 'club-sharing' | 'results'
  | 'club-desk' | 'club-streams' | 'club-scorers' | 'club-entries' | 'club-dupr' | 'club-results-dupr' | 'court' | 'helper' | 'desk'
  | 'event' | 'event-enter' | 'my-entries' | 'admin-listings' | 'admin-login' | 'demo' | 'admin' | 'admin-club' | 'events-post' | 'club-inbox'
  | 'club-tournaments' | 'club-results' | 'club-player-studio' | 'club-claim' | 'live' | 'public-player' | 'club-tv' | 'club-social' | 'overlay' | 'data-privacy';
export interface Route { name: RouteName; id?: string }

const simple: RouteName[] = ['data-privacy', 'admin-login', 'demo', 'club-tournaments', 'club-results', 'my-entries', 'admin-listings', 'events-post', 'club', 'club-signin', 'club-new', 'home', 'train', 'stats', 'coach', 'tournaments', 'tournament-new', 'coach-settings', 'report', 'help', 'privacy', 'backfill', 'settings', 'trash', 'backup', 'ratings', 'goals', 'session-new'];
const withId: RouteName[] = ['club-claim', 'admin-club', 'event', 'event-enter', 'club-inbox', 'club-desk', 'club-streams', 'club-scorers', 'club-entries', 'club-dupr', 'club-results-dupr', 'court', 'helper', 'desk', 'club-join', 'club-view', 'club-player', 'club-tournament', 'club-tournament-new', 'club-score', 'club-sharing', 'results', 'match', 'edit', 'details', 'session', 'tournament', 'tournament-edit', 'coach-task', 'conversation'];
const optionalId: RouteName[] = ['live','public-player','club-tv','club-social','club-player-studio', 'admin', 'events', 'matches', 'clips', 'log'];
/** The Events tab only exists in Club builds (until Club mode launches). */
export const TABS: Tab[] = ['home', 'matches', 'events', 'train', 'stats', 'coach'];

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const overlay = /^overlay(?:\/([^?]*))?(?:\?|$)/.exec(path);
  if (overlay) {
    try { return overlay[1] ? { name: 'overlay', id: decodeURIComponent(overlay[1]) } : { name: 'overlay' }; }
    catch { return { name: 'overlay' }; }
  }
  const [name, id] = path.split('/');
  if ((optionalId as string[]).includes(name)) return id ? { name: name as RouteName, id: decodeURIComponent(id) } : { name: name as RouteName };
  if ((simple as string[]).includes(name)) return { name: name as RouteName };
  if ((withId as string[]).includes(name) && id) return { name: name as RouteName, id: decodeURIComponent(id) };
  return { name: 'home' };
}

export function routeHash(r: Route): string {
  if (r.name === 'overlay' && r.id) return `#/overlay/${r.id.split('/').map(encodeURIComponent).join('/')}`;
  return r.id ? `#/${r.name}/${encodeURIComponent(r.id)}` : `#/${r.name}`;
}

export type Go = (name: RouteName, id?: string, opts?: { replace?: boolean }) => void;

/** A short cross-fade between screens where the browser supports View Transitions; instant for reduced motion. */
function withTransition(update: () => void, instant = false) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (instant || !doc.startViewTransition || reduced) { update(); return; }
  doc.startViewTransition(() => flushSync(update));
}

/** Hash-based routes so the phone's back button and GitHub Pages both work. */
export function useRoute(): [Route, Go, () => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      const next = parseRoute(window.location.hash);
      withTransition(() => setRoute(next), next.name === 'overlay');
    };
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
    withTransition(() => setRoute(next), name === 'overlay');
    window.scrollTo?.(0, 0);
  }, []);
  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else go('home');
  }, [go]);
  return [route, go, back];
}
