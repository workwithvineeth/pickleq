import { describe, expect, it } from 'vitest';
import { isInstalled } from './install';

function fakeWindow(matching: string | null, iosStandalone?: boolean): Window {
  return {
    matchMedia: (q: string) => ({ matches: matching !== null && q.includes(matching) }),
    navigator: { standalone: iosStandalone },
  } as unknown as Window;
}

describe('isInstalled', () => {
  it('is false in a normal browser tab', () => {
    expect(isInstalled(fakeWindow(null))).toBe(false);
  });
  it('is true for an installed Android app (standalone display mode)', () => {
    expect(isInstalled(fakeWindow('standalone'))).toBe(true);
  });
  it('is true on iPhone when only the older standalone flag is set', () => {
    expect(isInstalled(fakeWindow(null, true))).toBe(true);
  });
  it('accepts other app-like display modes', () => {
    expect(isInstalled(fakeWindow('minimal-ui'))).toBe(true);
  });
});
