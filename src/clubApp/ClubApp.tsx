import { ThemeControls } from '../components/ThemeSwitch';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { SocialPicker, TvPicker } from '../rallyq/tv/TvPicker';
import { PlayerStudio } from '../club/screens/studio/Studio';
import { UpdatePrompt } from '../components/UpdatePrompt';
import ClubRoutes from '../club/screens/ClubRoutes';
import { BrandMark } from '../club/screens/Brand';
import { eventsBackend } from '../club/index';
import type { SupportSession } from '../club/backend';
import { useRoute, type Go, type Route, type RouteName } from '../navigation';
import { appVersion, buildId } from '../config';
import {RallyHome} from '../rallyq/home/RallyHome';
import {MyStudio} from '../rallyq/studio/MyStudio';
import {RallyLive} from '../rallyq/live/RallyLive';
import {ScoreOverlay} from '../rallyq/overlay/ScoreOverlay';
import {RallyEvent} from '../rallyq/event/RallyEvent';
import {RallyTV} from '../rallyq/tv/RallyTV';
import {PublicProfile} from '../rallyq/studio/PublicProfile';
import {RallySocial} from '../rallyq/social/RallySocial';
import { WorkspaceNav, workspaceOf } from './Workspace';

type ClubTab = 'events' | 'club' | 'club-tournaments' | 'club-results' | 'club-player-studio';
const TABS: { id: ClubTab; label: string; icon: IconName }[] = [
  { id: 'events', label: 'Events', icon: 'events' },
  { id: 'club', label: 'My clubs', icon: 'home' },
  { id: 'club-results', label: 'Results', icon: 'stats' },
  { id: 'club-player-studio', label: 'Studio', icon: 'ball' },
];

/** Screens without an account (referee court, desk PIN, public results and event pages): no account strip there. */
/** v1.2 screens bring their own shell (PublicShell / OrgShell): the frame adds nothing around them. */
const BARE: RouteName[] = ['club', 'club-tournaments', 'club-results', 'club-claim', 'club-join', 'club-view', 'club-new', 'club-tournament-new', 'admin', 'admin-club', 'admin-listings', 'club-signin', 'events', 'event-enter', 'my-entries', 'results', 'club-inbox', 'club-entries', 'club-tournament', 'club-desk', 'club-scorers', 'club-results-dupr', 'club-dupr', 'demo', 'events-post', 'club-player', 'club-score'];
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

/** While a RallyQ admin is in a support session, every screen says so, with one tap to end it. */
function SupportBanner({ route }: { route: RouteName }) {
  const [list, setList] = useState<SupportSession[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => { const f = () => setTick((n) => n + 1); window.addEventListener('pq-support-changed', f); return () => window.removeEventListener('pq-support-changed', f); }, []);
  useEffect(() => { let on = true; eventsBackend().supportSessions().then((x) => { if (on) setList(x); }, () => undefined); return () => { on = false; }; }, [route, tick]);
  if (!list.length || NO_ACCOUNT.includes(route)) return null;
  return (
    <>
      {list.map((x) => (
        <div key={x.clubId} className="pq-support" role="status" aria-label="RallyQ support session">
          <span style={{ flex: 1, minWidth: 0 }}><b>RallyQ support</b> in {x.club} until {new Date(x.until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. Every change is logged.</span>
          <button type="button" className="link-btn" onClick={async () => { await eventsBackend().endSupport(x.clubId).catch(() => undefined); setTick((n) => n + 1); }}>End support</button>
        </div>
      ))}
    </>
  );
}

/** Routes that belong to the personal RallyQ app: not part of RallyQ, so they open My club instead. */
const PERSONAL: RouteName[] = ['matches', 'train', 'stats', 'coach', 'log', 'backfill', 'edit', 'details', 'match', 'trash', 'settings', 'backup', 'ratings', 'coach-task', 'conversation', 'coach-settings', 'report', 'help', 'privacy', 'tournaments', 'tournament-new', 'tournament-edit', 'tournament', 'clips', 'goals', 'session-new', 'session', 'club-sharing'];

// Opened from a sign-in email (…/?code=…): show the sign-in screen, which finishes it.
if (/[?&](code|error_description)=/.test(window.location.search) && !window.location.hash.startsWith('#/club-signin')) {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/club-signin`);
}

export default function ClubApp() {
  const [route, go, back] = useRoute();
  if (route.name === 'overlay') return <ScoreOverlay key={route.id} courtPath={route.id} />;
  return <ClubAppWithShell route={route} go={go} back={back} />;
}

function ClubAppWithShell({ route, go, back }: { route: Route; go: Go; back: () => void }) {
  // RallyQ admins see every club on this tab, so it's called Clubs for them; organisers see their own, My clubs.
  const [admin, setAdmin] = useState(false);
  useEffect(() => { let on = true; eventsBackend().isPlatformAdmin().then((a) => { if (on) setAdmin(a); }, () => undefined); return () => { on = false; }; }, [route.name]);
  const personal = route.name === 'home' || PERSONAL.includes(route.name);
  useEffect(() => { if (personal && route.name !== 'home') go('club', undefined, { replace: true }); }, [personal, route.name, go]);
  const name: RouteName = personal ? 'club' : route.name;
  // A club's own page counts as My club, so the tabs stay there too.
  const tab = name === 'club-view' ? 'club' : (TABS.map((t) => t.id) as RouteName[]).includes(name) ? (name as ClubTab) : null;
  // Top-level "back" in RallyQ goes to the events board, never to the personal app.
  const clubGo: Go = (n, id, opts) => go(n === 'home' ? 'club' : n, id, opts);
  // Desktop keeps the side menu on every signed-in screen (not on referee, desk or public pages); phones show tabs on tab screens only.
  const showNav = !!tab || !NO_ACCOUNT.includes(name);
  const current = tab ?? (name === 'club-claim' ? 'club-player-studio' : name.startsWith('admin') ? 'club' : name === 'event' || name === 'my-entries' ? 'events' : 'club');
  // rallyq.in itself: the public home page for visitors (it sends signed-in people on to My clubs).
  if (route.name === 'home') return <><StagingStrip /><UpdatePrompt offlineNotice={false} inline /><RallyHome go={go} /></>;
  if (route.name === 'live') return <><StagingStrip /><UpdatePrompt offlineNotice={false} inline /><RallyLive go={go} slug={route.id} /></>;
  if (route.name === 'public-player') return <><StagingStrip /><UpdatePrompt offlineNotice={false} inline /><PublicProfile playerId={route.id} go={go} /></>;
  if (route.name === 'club-social' && route.id) return <><StagingStrip /><UpdatePrompt offlineNotice={false} inline /><RallySocial slug={route.id} go={go} /></>;
  if (route.name === 'club-tv' && !route.id) return <TvPicker go={go} />;
  if (route.name === 'club-social' && !route.id) return <><StagingStrip /><SocialPicker go={go} /></>;
  if (route.name === 'club-tv' && route.id) return <><UpdatePrompt offlineNotice={false} inline /><RallyTV slug={route.id} go={go} /></>;
  if (route.name === 'event' && route.id) return <><StagingStrip /><UpdatePrompt offlineNotice={false} inline /><RallyEvent slug={route.id} go={go} /></>;
  // My Player Studio has its own header and feature tabs (prototype), so no old Studio side menu.
  if (route.name === 'club-player-studio' && ((route.id ?? '').includes('privacy') || (route.id !== 'profile' && !(route.id ?? '').startsWith('profile')))) return <><StagingStrip /><UpdatePrompt offlineNotice={false} inline /><MyStudio key={route.id} section={route.id} go={clubGo} /></>;
  // The Player Studio profile page (DUPR connect, Not me, download my data) has its own Studio header: no app bars on top of it (UX-08).
  if (route.name === 'club-player-studio') return <><StagingStrip /><UpdatePrompt offlineNotice={false} inline /><div className="app pq-brand pq-studio-wrap"><PlayerStudio section={route.id ?? 'profile'} go={clubGo} /></div></>;
  // v1.2 screens render bare: their own shell is the header, menu and footer. A support session still says so on top.
  if (BARE.includes(name)) return <><StagingStrip /><UpdatePrompt offlineNotice={false} inline /><SupportBanner route={name} /><ClubRoutes route={{ ...route, name }} go={clubGo} back={back} /></>;
  // Admin, club and Player Studio screens get their own workspace menu (Phase 3 prototypes 01–03).
  const ws = showNav && !NO_ACCOUNT.includes(name) ? workspaceOf({ ...route, name }) : null;
  return (
    <div className={`app pq-brand${showNav ? ' has-side' : ''}${ws ? ` pq-ws pq-ws-${ws}` : ''}`}>
      {/* At the top of the page, never floating over the sign-in form or the main buttons; no "works offline" popup. */}
      <StagingStrip />
      <UpdatePrompt offlineNotice={false} inline />
      <AccountStrip route={name} go={clubGo} />
      <SupportBanner route={name} />
      {!ws && showNav && <div className="pq-app-preferences" aria-label="App settings"><ThemeControls /></div>}
      {ws && <WorkspaceNav kind={ws} route={{ ...route, name }} go={clubGo} admin={admin} />}
      <ClubRoutes route={{ ...route, name }} go={clubGo} back={back} />
      {name === 'club' && <p className="small muted" style={{ margin: '0 16px 96px' }}>RallyQ {appVersion} · build {buildId}</p>}
      {showNav && (
        <nav className={`nav pq-glass${tab ? '' : ' nav-sub'}${ws ? ' nav-ws' : ''}`} aria-label="Main">
          <div className="nav-brand" aria-hidden="true"><span className="nav-brand-tile"><BrandMark size={30} /></span><span><b>RallyQ</b><small>{admin ? 'Platform admin' : 'For clubs'}</small></span></div>
          {TABS.map((t) => (
            <button key={t.id} type="button" className="nav-btn" aria-label={t.id === 'club' && admin ? 'Clubs' : t.label} title={t.id === 'club' && admin ? 'Clubs' : t.label} aria-current={current === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <Icon name={t.icon} />
              <span>{t.id === 'club' && admin ? 'Clubs' : t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

/** The staging site (VITE_STAGING=on) says so on every screen, so it's never mistaken for the live site. */
function StagingStrip() {
  return import.meta.env.VITE_STAGING === 'on' ? <p className="pq-staging" role="note">Staging site: test data only. Nothing here is real or live.</p> : null;
}
