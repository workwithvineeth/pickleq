import { BottomNav } from './components/BottomNav';
import { Icon } from './components/Icon';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useRoute, type Tab } from './navigation';
import { Coach } from './screens/Coach';
import { Home } from './screens/Home';
import { LogMatch } from './screens/LogMatch';
import { Matches } from './screens/Matches';
import { Settings } from './screens/Settings';
import { Stats } from './screens/Stats';
import { Train } from './screens/Train';

export default function App() {
  const [route, go, back] = useRoute();
  const isTab = route !== 'log' && route !== 'settings';

  return (
    <div className="app">
      {route === 'home' && <Home go={go} />}
      {route === 'matches' && <Matches go={go} />}
      {route === 'train' && <Train />}
      {route === 'stats' && <Stats />}
      {route === 'coach' && <Coach />}
      {route === 'log' && <LogMatch onClose={back} />}
      {route === 'settings' && <Settings onBack={back} />}

      {isTab && (
        <>
          <button type="button" className="fab" aria-label="Log a match" onClick={() => go('log')}>
            <Icon name="plus" size={28} strokeWidth={2.4} />
          </button>
          <BottomNav active={route as Tab} onSelect={go} />
        </>
      )}
      <UpdatePrompt />
    </div>
  );
}
