import { useSyncExternalStore } from 'react';
import { chooseTheme, currentTheme, subscribeTheme, type ThemeChoice } from '../theme';

export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => 'auto' as const);
  return <div className="pq-theme-switch pq-glass" role="group" aria-label="Theme">
    {(['auto', 'light', 'dark'] as ThemeChoice[]).map(choice =>
      <button key={choice} type="button" aria-pressed={theme === choice} onClick={() => chooseTheme(choice)}>{choice === 'auto' ? 'Auto' : choice === 'light' ? 'Light' : 'Dark'}</button>)}
  </div>;
}

/** The same setting in the top bar on laptops and a Settings disclosure on phones. No new route. */
export function ThemeControls() {
  return <>
    <div className="pq-theme-desktop"><ThemeSwitch /></div>
    <details className="pq-theme-settings">
      <summary>Settings</summary>
      <div className="pq-theme-panel pq-glass"><h2>Theme</h2><ThemeSwitch /><p>Auto follows your device.</p></div>
    </details>
  </>;
}
