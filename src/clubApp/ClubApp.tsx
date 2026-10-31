import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { UpdatePrompt } from '../components/UpdatePrompt';
import ClubRoutes from '../club/screens/ClubRoutes';
import { eventsBackend } from '../club/index';
import { useRoute, type Go, type RouteName } from '../navigation';
import { appVersion, buildId } from '../config';
import { ClubResultsTab, ClubTournamentsTab } from './Tabs';

type ClubTab = 'events' | 'club' | 'club-tournaments' | 'club-results';
const TABS: { id: ClubTab; label: string; icon: IconName }[] = [
  { id: 'events', label: 'Events', icon: 'events' },
  { id: 'club', label: 'My clubs', icon: 'home' },
  { id: 'club-tournaments', label: 'Tournaments', icon: 'matches' },
  { id: 'club-results', label: 'Results', icon: 'stats' },
];

/** Routes that belong to the personal PaddleQ app: not part of PaddleQ, so they open My club instead. */
const PERSONAL: RouteName[] = ['matches', 'train', 'stats', 'coach', 'log', 'backfill', 'edit', 'details', 'match', 'trash', 'settings', 'backup', 'ratings', 'coach-task', 'conversation', 'coach-settings', 'report', 'help', 'privacy', 'tournaments', 'tournament-new', 'tournament-edit', 'tournament', 'clips', 'goals', 'session-new', 'session', 'club-sharing'];

// Opened from a sign-in email (…/?code=…): show the sign-in screen, which finishes it.
if (/[?&](code|error_description)=/.test(window.location.search) && !window.location.hash.startsWith('#/club-signin')) {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/club-signin`);
}

export default function ClubApp() {
  const [route, go, back] = useRoute();
  // PaddleQ admins see every club on this tab, so it's called Clubs for them; organisers see their own, My clubs.
  const [admin, setAdmin] = useState(false);
  useEffect(() => { let on = true; eventsBackend().isPlatformAdmin().then((a) => { if (on) setAdmin(a); }, () => undefined); return () => { on = false; }; }, [route.name]);
  const personal = route.name === 'home' || PERSONAL.includes(route.name);
  useEffect(() => { if (personal && route.name !== 'home') go('club', undefined, { replace: true }); }, [personal, route.name, go]);
  const name: RouteName = personal ? 'club' : route.name;
  // A club's own page counts as My club, so the tabs stay there too.
  const tab = name === 'club-view' ? 'club' : (TABS.map((t) => t.id) as RouteName[]).includes(name) ? (name as ClubTab) : null;
  // Top-level "back" in PaddleQ goes to the events board, never to the personal app.
  const clubGo: Go = (n, id, opts) => go(n === 'home' ? 'club' : n, id, opts);
  return (
    <div className="app pq-brand">
      {name === 'club-tournaments' && <ClubTournamentsTab go={clubGo} />}
      {name === 'club-results' && <ClubResultsTab go={clubGo} />}
      {name !== 'club-tournaments' && name !== 'club-results' && <ClubRoutes route={{ ...route, name }} go={clubGo} back={back} />}
      {name === 'club' && <p className="small muted" style={{ margin: '0 16px 96px' }}>PaddleQ {appVersion} · build {buildId}</p>}
      {tab && (
        <nav className="nav" aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="nav-btn" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <Icon name={t.icon} />
              <span>{t.id === 'club' && admin ? 'Clubs' : t.label}</span>
            </button>
          ))}
        </nav>
      )}
      <UpdatePrompt />
    </div>
  );
}
