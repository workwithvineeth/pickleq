import { lazy, Suspense, useEffect, useState } from 'react';
import { LockScreen } from './lock/LockScreen';
import { lockAfter, pinEnabled } from './lock/pin';
import { BottomNav } from './components/BottomNav';
import { Icon } from './components/Icon';
import { UpdatePrompt } from './components/UpdatePrompt';
import { requestPersistentStorage } from './backup/status';
import { purgeOldTrash } from './db/matches';
import { purgeOldSessions } from './db/training';
import { TABS, useRoute, type Tab } from './navigation';
import { Backup } from './screens/Backup';
import { Clips } from './screens/Clips';
import { Coach } from './screens/Coach';
import { Help, Privacy } from './screens/Help';
import { CoachSettings, CoachTask, ConversationView, Report } from './screens/CoachScreens';
import { Goals } from './screens/Goals';
import { Home } from './screens/Home';
import { LogSession } from './screens/LogSession';
import { LogMatch } from './screens/LogMatch';
import { MatchDetails } from './screens/MatchDetails';
import { Matches } from './screens/Matches';
import { MatchView } from './screens/MatchView';
import { Ratings } from './screens/Ratings';
import { Settings } from './screens/Settings';
import { Train } from './screens/Train';
import { Trash } from './screens/Trash';
import { TournamentForm, TournamentList, TournamentView } from './screens/Tournaments';
import { purgeOldTournaments } from './db/tournaments';
import { decodeLink } from './domain/tournaments';

// Charts are large; load the Stats screen only when it's opened.
const Stats = lazy(() => import('./screens/Stats').then((m) => ({ default: m.Stats })));

export default function App() {
  const [route, go, back] = useRoute();
  const isTab = (TABS as string[]).includes(route.name);
  const [locked, setLocked] = useState(() => pinEnabled());

  // Lock again when you come back after the chosen time away (a few seconds' grace so the share sheet doesn't lock you out).
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && pinEnabled() && Date.now() - hiddenAt >= Math.max(3000, lockAfter())) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    purgeOldTrash().catch(() => {});
    purgeOldSessions().catch(() => {});
    purgeOldTournaments().catch(() => {});
    requestPersistentStorage().catch(() => {});
  }, []);

  if (locked) return <div className="app"><LockScreen onUnlock={() => setLocked(false)} /></div>;

  return (
    <div className="app">
      {route.name === 'home' && <Home go={go} />}
      {route.name === 'matches' && <Matches go={go} key={route.id ?? 'all'} initialFilter={route.id === 'incomplete' ? 'incomplete' : 'all'} />}
      {route.name === 'train' && <Train go={go} />}
      {route.name === 'stats' && <Suspense fallback={<main className="screen"><h1 className="screen-title">Stats</h1></main>}><Stats go={go} /></Suspense>}
      {route.name === 'coach' && <Coach go={go} />}
      {route.name === 'log' && <LogMatch key={`log-${route.id ?? ''}`} mode="new" link={decodeLink(route.id)} go={go} onClose={back} />}
      {route.name === 'backfill' && <LogMatch key="backfill" mode="backfill" go={go} onClose={back} />}
      {route.name === 'edit' && route.id && <LogMatch key={`edit-${route.id}`} mode="edit" matchId={route.id} go={go} onClose={back} />}
      {route.name === 'details' && route.id && <MatchDetails key={route.id} matchId={route.id} go={go} onClose={back} />}
      {route.name === 'match' && route.id && <MatchView key={route.id} matchId={route.id} go={go} onBack={back} />}
      {route.name === 'trash' && <Trash onBack={back} />}
      {route.name === 'settings' && <Settings onBack={back} go={go} />}
      {route.name === 'backup' && <Backup onBack={back} />}
      {route.name === 'ratings' && <Ratings onBack={back} />}
      {route.name === 'coach-task' && route.id && <CoachTask key={route.id} task={route.id} go={go} onBack={back} />}
      {route.name === 'conversation' && route.id && <ConversationView key={route.id} id={route.id} go={go} onBack={back} />}
      {route.name === 'coach-settings' && <CoachSettings onBack={back} />}
      {route.name === 'report' && <Report go={go} onBack={back} />}
      {route.name === 'help' && <Help go={go} onBack={back} />}
      {route.name === 'privacy' && <Privacy onBack={back} />}
      {route.name === 'tournaments' && <TournamentList go={go} onBack={back} />}
      {route.name === 'tournament-new' && <TournamentForm key="new-t" go={go} onClose={back} />}
      {route.name === 'tournament-edit' && route.id && <TournamentForm key={`edit-${route.id}`} id={route.id} go={go} onClose={back} />}
      {route.name === 'tournament' && route.id && <TournamentView key={route.id} id={route.id} go={go} onBack={back} />}
      {route.name === 'clips' && <Clips key={route.id ?? 'index'} slug={route.id} go={go} onBack={back} />}
      {route.name === 'goals' && <Goals onBack={back} />}
      {route.name === 'session-new' && <LogSession key="new-session" go={go} onClose={back} />}
      {route.name === 'session' && route.id && <LogSession key={route.id} sessionId={route.id} go={go} onClose={back} />}

      {isTab && (
        <>
          <button type="button" className="fab" aria-label="Log a match" onClick={() => go('log')}>
            <Icon name="plus" size={28} strokeWidth={2.4} />
          </button>
          <BottomNav active={route.name as Tab} onSelect={(t) => go(t)} />
        </>
      )}
      <UpdatePrompt />
    </div>
  );
}
