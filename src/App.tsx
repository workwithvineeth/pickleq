import { useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import { Icon } from './components/Icon';
import { UpdatePrompt } from './components/UpdatePrompt';
import { requestPersistentStorage } from './backup/status';
import { purgeOldTrash } from './db/matches';
import { TABS, useRoute, type Tab } from './navigation';
import { Backup } from './screens/Backup';
import { Coach } from './screens/Coach';
import { Home } from './screens/Home';
import { LogMatch } from './screens/LogMatch';
import { MatchDetails } from './screens/MatchDetails';
import { Matches } from './screens/Matches';
import { MatchView } from './screens/MatchView';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { Train } from './screens/Train';
import { Trash } from './screens/Trash';

export default function App() {
  const [route, go, back] = useRoute();
  const isTab = (TABS as string[]).includes(route.name);

  useEffect(() => {
    purgeOldTrash().catch(() => {});
    requestPersistentStorage().catch(() => {});
  }, []);

  return (
    <div className="app">
      {route.name === 'home' && <Home go={go} />}
      {route.name === 'matches' && <Matches go={go} key={route.id ?? 'all'} initialFilter={route.id === 'incomplete' ? 'incomplete' : 'all'} />}
      {route.name === 'train' && <Train />}
      {route.name === 'stats' && <Stats />}
      {route.name === 'coach' && <Coach />}
      {route.name === 'log' && <LogMatch key="log" mode="new" go={go} onClose={back} />}
      {route.name === 'backfill' && <LogMatch key="backfill" mode="backfill" go={go} onClose={back} />}
      {route.name === 'edit' && route.id && <LogMatch key={`edit-${route.id}`} mode="edit" matchId={route.id} go={go} onClose={back} />}
      {route.name === 'details' && route.id && <MatchDetails key={route.id} matchId={route.id} go={go} onClose={back} />}
      {route.name === 'match' && route.id && <MatchView key={route.id} matchId={route.id} go={go} onBack={back} />}
      {route.name === 'trash' && <Trash onBack={back} />}
      {route.name === 'settings' && <Settings onBack={back} go={go} />}
      {route.name === 'backup' && <Backup onBack={back} />}

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
