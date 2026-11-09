import { currentSkin, readSkin, SKINS, SKIN_KEY, type SkinChoice } from './skin';
export type ThemeChoice = 'auto' | 'light' | 'dark';
export const THEME_KEY = 'pq-theme';
const valid = (v: unknown): v is ThemeChoice => v === 'auto' || v === 'light' || v === 'dark';
export function readTheme(storage: Pick<Storage, 'getItem'>, fallback:ThemeChoice='auto'): ThemeChoice {
  try { const value = storage.getItem(THEME_KEY); return valid(value) ? value : fallback; } catch { return fallback; }
}
export function persistTheme(value: ThemeChoice, storage: Pick<Storage, 'setItem'>): ThemeChoice {
  try { storage.setItem(THEME_KEY, value); return value; } catch { return 'auto'; }
}
export function effectiveTheme(choice: ThemeChoice, dark: boolean): 'light' | 'dark' {
  return choice === 'auto' ? dark ? 'dark' : 'light' : choice;
}
function storedTheme(): ThemeChoice {
  const fallback=currentSkin()==='axis'?'dark':'auto';
  try { return readTheme(window.localStorage,fallback); } catch { return fallback; }
}
export function currentTheme(): ThemeChoice {
  const value = document.documentElement.dataset.theme;
  return valid(value) ? value : storedTheme();
}
export function applyTheme(choice: ThemeChoice) {
  const effective = effectiveTheme(choice, window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = choice;
  const skin=currentSkin(); document.documentElement.dataset.skin=skin; const palette=SKINS[skin];
  document.documentElement.style.colorScheme = effective;
  document.documentElement.style.backgroundColor = effective === 'dark' ? palette.darkMeta : palette.lightMeta;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => { meta.content = effective === 'dark' ? palette.darkMeta : palette.lightMeta; });
  window.dispatchEvent(new Event('pq-theme-change'));
}
export function chooseTheme(choice: ThemeChoice) {
  let saved: ThemeChoice = 'auto';
  try { saved = persistTheme(choice, window.localStorage); } catch { /* storage getter blocked */ }
  applyTheme(saved);
}
export function subscribeTheme(listener: () => void) {
  window.addEventListener('pq-theme-change', listener);
  return () => window.removeEventListener('pq-theme-change', listener);
}
/** Installed once by the entrypoint, not once per visible switch. */
export function initializeTheme() {
  try { document.documentElement.dataset.skin=readSkin(window.localStorage); } catch { document.documentElement.dataset.skin="axis"; }
  applyTheme(storedTheme());
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onDeviceChange = () => applyTheme(currentTheme());
  const onStorage = (e: StorageEvent) => { if (e.key === SKIN_KEY || e.key === null) { try { document.documentElement.dataset.skin=readSkin(window.localStorage); } catch { document.documentElement.dataset.skin='axis'; } } if (e.key === THEME_KEY || e.key === SKIN_KEY || e.key === null) applyTheme(storedTheme()); };
  query.addEventListener?.('change', onDeviceChange);
  window.addEventListener('storage', onStorage);
  return () => { query.removeEventListener?.('change', onDeviceChange); window.removeEventListener('storage', onStorage); };
}

export function chooseSkin(skin:SkinChoice) { let saved:SkinChoice=skin;try{window.localStorage.setItem(SKIN_KEY,skin);}catch{saved='axis';}document.documentElement.dataset.skin=saved;applyTheme(currentTheme()); }
