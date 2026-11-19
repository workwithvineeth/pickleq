import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../index.html?raw';
import { applyTheme, chooseTheme, effectiveTheme, initializeTheme, persistTheme, readTheme, THEME_KEY } from './theme';

let stop: (() => void) | undefined;
beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; delete document.documentElement.dataset.skin; });
afterEach(() => { stop?.(); stop = undefined; vi.restoreAllMocks(); document.documentElement.removeAttribute('data-theme'); document.documentElement.removeAttribute('data-skin'); document.documentElement.removeAttribute('style'); document.querySelectorAll('[data-theme-test]').forEach(el => el.remove()); });
describe('theme preference and pre-paint bootstrap', () => {
  it('uses Auto for missing, invalid or unreadable storage', () => {
    expect(readTheme({ getItem: () => null })).toBe('auto');
    expect(readTheme({ getItem: () => 'old-value' })).toBe('auto');
    expect(readTheme({ getItem: () => { throw Error('blocked'); } })).toBe('auto');
    for (const value of ['auto', 'light', 'dark'] as const) expect(readTheme({ getItem: () => value })).toBe(value);
    expect(persistTheme('dark', { setItem: () => { throw Error('full'); } })).toBe('auto');
  });
  it('honors explicit choices against the opposite device theme', () => {
    expect(effectiveTheme('auto', true)).toBe('dark'); expect(effectiveTheme('auto', false)).toBe('light');
    expect(effectiveTheme('light', true)).toBe('light'); expect(effectiveTheme('dark', false)).toBe('dark');
    chooseTheme('dark'); expect(localStorage.getItem(THEME_KEY)).toBe('dark'); expect(document.documentElement.dataset.theme).toBe('dark');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
    chooseTheme('light'); expect(document.documentElement.dataset.theme).toBe('auto');
  });
  it('reacts to device and cross-tab changes and cleans up its listeners', () => {
    let dark = false;
    let change: (() => void) | undefined;
    const remove = vi.fn();
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ get matches() { return dark; }, addEventListener: (_: string, fn: () => void) => { change = fn; }, removeEventListener: remove } as unknown as MediaQueryList));
    localStorage.setItem(THEME_KEY,'auto');
    stop = initializeTheme(); expect(document.documentElement.style.colorScheme).toBe('light');
    dark = true; change?.(); expect(document.documentElement.style.colorScheme).toBe('dark');
    chooseTheme('light'); change?.(); expect(document.documentElement.style.colorScheme).toBe('light');
    localStorage.setItem(THEME_KEY, 'dark'); window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }));
    expect(document.documentElement.dataset.theme).toBe('dark'); stop(); stop = undefined; expect(remove).toHaveBeenCalledTimes(1);
  });
  it('sets the initial attribute, canvas and meta before the app entrypoint runs', () => {
    const script = indexHtml.match(/<script id="pq-theme-init">([\s\S]*?)<\/script>/)![1];
    const meta = document.createElement('meta'); meta.name = 'theme-color'; meta.dataset.themeTest = '1'; document.head.append(meta);
    const run = new Function('localStorage', 'matchMedia', 'document', script);
    run({ getItem: () => 'light' }, () => ({ matches: true }), document);
    expect(document.documentElement.dataset.theme).toBe('light'); expect(meta.content).toBe('#2B6E4B');
    run({ getItem: () => 'dark' }, () => ({ matches: false }), document);
    expect(document.documentElement.dataset.theme).toBe('dark'); expect(meta.content).toBe('#06140D');
    run({ getItem: () => { throw Error('private mode'); } }, () => ({ matches: true }), document);
    expect(document.documentElement.dataset.theme).toBe('dark'); expect(document.documentElement.style.colorScheme).toBe('dark');
    applyTheme('light'); expect(meta.content).toBe('#2B6E4B');
  });
});
