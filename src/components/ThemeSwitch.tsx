import { currentSkin, type SkinChoice } from '../skin';
import { useSyncExternalStore } from 'react';
import { chooseSkin, chooseTheme, currentTheme, subscribeTheme, type ThemeChoice } from '../theme';

export function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => 'auto' as const);
  return <div className="pq-theme-switch pq-glass" role="group" aria-label="Theme">
    {(['auto', 'light', 'dark'] as ThemeChoice[]).map(choice =>
      <button key={choice} type="button" aria-pressed={theme === choice} onClick={() => chooseTheme(choice)}>{choice === 'auto' ? 'Auto' : choice === 'light' ? 'Light' : 'Dark'}</button>)}
  </div>;
}

/** The same setting in the top bar on laptops and a Settings disclosure on phones. No new route. */
export function ThemeControls({showSkin=false}:{showSkin?:boolean}) {
  return <>
    <div className="pq-theme-desktop"><ThemeSwitch /></div>
    {showSkin && <details className="pq-skin-settings"><summary>Skin</summary><div className="pq-theme-panel pq-glass"><SkinSwitch /></div></details>}
    <details className="pq-theme-settings">
      <summary>Settings</summary>
      <div className="pq-theme-panel pq-glass"><h2>Theme</h2><ThemeSwitch /><p>Auto follows your device.</p><SkinSwitch /></div>
    </details>
  </>;
}

export function useSkin(){return useSyncExternalStore(subscribeTheme,currentSkin,()=> 'axis' as const);}
function SkinSwitch(){const skin=useSkin();return <label className="pq-skin-control">Colour skin<select aria-label="Colour skin" value={skin} onChange={e=>chooseSkin(e.target.value as SkinChoice)}><option value="axis">AXIS</option><option value="maroon">Maroon &amp; Cream</option></select></label>;}
