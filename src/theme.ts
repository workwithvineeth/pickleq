export type ThemeChoice = 'auto' | 'light' | 'dark';
export const THEME_KEY = 'pq-theme';
const valid = (v: unknown): v is ThemeChoice => v === 'auto' || v === 'light' || v === 'dark';
export function readTheme(storage: Pick<Storage, 'getItem'>): ThemeChoice {
  try { const value = storage.getItem(THEME_KEY); return valid(value) ? value : 'auto'; } catch { return 'auto'; }
}
export function persistTheme(value: ThemeChoice, storage: Pick<Storage, 'setItem'>): ThemeChoice {
  try { storage.setItem(THEME_KEY, value); return value; } catch { return 'auto'; }
}
export function effectiveTheme(choice: ThemeChoice, dark: boolean): 'light' | 'dark' {
  return choice === 'auto' ? dark ? 'dark' : 'light' : choice;
}
function storedTheme(): ThemeChoice {
  try { return readTheme(window.localStorage); } catch { return 'auto'; }
}
export function currentTheme(): ThemeChoice {
  const value = document.documentElement.dataset.theme;
  return valid(value) ? value : storedTheme();
}
export function applyTheme(choice: ThemeChoice) {
  const effective = effectiveTheme(choice, window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = choice;
  document.documentElement.style.colorScheme = effective;
  document.documentElement.style.backgroundColor = effective === 'dark' ? '#120709' : '#F3EBDD';
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => { meta.content = effective === 'dark' ? '#120709' : '#F3EBDD'; });
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
  applyTheme(storedTheme());
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onDeviceChange = () => applyTheme(currentTheme());
  const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY || e.key === null) applyTheme(storedTheme()); };
  query.addEventListener?.('change', onDeviceChange);
  window.addEventListener('storage', onStorage);
  return () => { query.removeEventListener?.('change', onDeviceChange); window.removeEventListener('storage', onStorage); };
}
