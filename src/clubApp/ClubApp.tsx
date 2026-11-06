import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { UpdatePrompt } from '../components/UpdatePrompt';
import ClubRoutes from '../club/screens/ClubRoutes';
import { BrandMark } from '../club/screens/Brand';
import { eventsBackend } from '../club/index';
import type { SupportSession } from '../club/backend';
import { useRoute, type Go, type RouteName } from '../navigation';
import { appVersion, buildId } from '../config';
import { ClubResultsTab, ClubTournamentsTab } from './Tabs';

type ClubTab = 'events' | 'club' | 'club-tournaments' | 'club-results';
const TABS: { id: ClubTab; label: string; icon: IconName }[] = [
  { id: 'events', label: 'Events', icon: 'events' },
  { id: 'club', label: 'My clubs', icon: 'home' },
  { id: 'club-results', label: 'Results', icon: 'stats' },
];

/** Screens without an account (referee court, desk PIN, public results and event pages): no account strip there. */
const NO_ACCOUNT: RouteName[] = ['court', 'desk', 'helper', 'results', 'event', 'club-signin', 'admin-login', 'demo'];

/** "Signed in as … · Sign out" on every signed-in screen, so sign-out is never more than one tap away. */
function AccountStrip({ route, go }: { route: RouteName; go: Go }) {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { let on = true; eventsBackend().currentUser().then((u) => { if (on) setEmail(u?.email ?? null); }, () => undefined); return () => { on = false; }; }, [route]);
  if (!email || NO_ACCOUNT.includes(route)) return null;
  async function signOut() {
    await eventsBackend().signOut().catch(() => undefined);
    setEmail(null);
    go('club', undefined, { replace: true });
  }
  return (
    <div className="pq-account" role="region" aria-label="Account">
      <span className="small muted" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Signed in as {email}</span>
      <button type="button" className="link-btn" onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}

/** While a PaddleQ admin is in a support session, every screen says so, with one tap to end it. */
function SupportBanner({ route }: { route: RouteName }) {
  const [list, setList] = useState<SupportSession[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => { const f = () => setTick((n) => n + 1); window.addEventListener('pq-support-changed', f); return () => window.removeEventListener('pq-support-changed', f); }, []);
  useEffect(() => { let on = true; eventsBackend().supportSessions().then((x) => { if (on) setList(x); }, () => undefined); return () => { on = false; }; }, [route, tick]);
  if (!list.length || NO_ACCOUNT.includes(route)) return null;
  return (
    <>
      {list.map((x) => (
        <div key={x.clubId} className="pq-support" role="status" aria-label="PaddleQ support session">
          <span style={{ flex: 1, minWidth: 0 }}><b>PaddleQ support</b> in {x.club} until {new Date(x.until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. Every change is logged.</span>
          <button type="button" className="link-btn" onClick={async () => { await eventsBackend().endSupport(x.clubId).catch(() => undefined); setTick((n) => n + 1); }}>End support</button>
        </div>
      ))}
    </>
  );
}

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
  // Desktop keeps the side menu on every signed-in screen (not on referee, desk or public pages); phones show tabs on tab screens only.
  const showNav = !!tab || !NO_ACCOUNT.includes(name);
  const current = tab ?? (name.startsWith('admin') ? 'club' : name === 'event' || name === 'my-entries' ? 'events' : 'club');
  return (
    <div className={`app pq-brand${showNav ? ' has-side' : ''}`}>
      {/* At the top of the page, never floating over the sign-in form or the main buttons; no "works offline" popup. */}
      <UpdatePrompt offlineNotice={false} inline />
      <AccountStrip route={name} go={clubGo} />
      <SupportBanner route={name} />
      {name === 'club-tournaments' && <ClubTournamentsTab go={clubGo} />}
      {name === 'club-results' && <ClubResultsTab go={clubGo} />}
      {name !== 'club-tournaments' && name !== 'club-results' && <ClubRoutes route={{ ...route, name }} go={clubGo} back={back} />}
      {name === 'club' && <p className="small muted" style={{ margin: '0 16px 96px' }}>PaddleQ {appVersion} · build {buildId}</p>}
      {showNav && (
        <nav className={`nav${tab ? '' : ' nav-sub'}`} aria-label="Main">
          <div className="nav-brand" aria-hidden="true"><span className="nav-brand-tile"><BrandMark size={30} /></span><span><b>PaddleQ</b><small>{admin ? 'Platform admin' : 'For clubs'}</small></span></div>
          {TABS.map((t) => (
            <button key={t.id} type="button" className="nav-btn" aria-current={current === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <Icon name={t.icon} />
              <span>{t.id === 'club' && admin ? 'Clubs' : t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
