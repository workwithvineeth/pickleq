import { beforeEach, describe, expect, it } from 'vitest';
import { checkNewPin, failState, pinEnabled, removePin, setPin, tryPin, waitAfter } from './pin';

beforeEach(() => localStorage.clear());

describe('app lock PIN', () => {
  it('rejects weak or mismatched PINs', () => {
    expect(checkNewPin('12', '12')).toBe('Use 4 to 6 digits');
    expect(checkNewPin('1111', '1111')).toMatch(/less easy/);
    expect(checkNewPin('1234', '1234')).toMatch(/less easy/);
    expect(checkNewPin('4821', '4812')).toBe('The two PINs don’t match');
    expect(checkNewPin('4821', '4821')).toBeNull();
  });

  it('stores only a salted hash and checks it', async () => {
    await setPin('4821', 1000);
    expect(pinEnabled()).toBe(true);
    const stored = Object.values({ ...localStorage }).join(' ');
    expect(stored).not.toContain('4821');
    expect(await tryPin('4821')).toEqual({ ok: true });
    expect((await tryPin('0000')).ok).toBe(false);
    removePin();
    expect(pinEnabled()).toBe(false);
  });

  it('makes you wait after five wrong PINs, and the wait grows', async () => {
    await setPin('4821', 1000);
    const t = 1_000_000;
    for (let i = 1; i <= 4; i++) expect(await tryPin('0000', t)).toEqual({ ok: false, waitMs: 0, fails: i });
    expect(await tryPin('0000', t)).toEqual({ ok: false, waitMs: 30_000, fails: 5 });
    // Even the right PIN is refused during the wait.
    expect((await tryPin('4821', t + 10_000)).ok).toBe(false);
    expect(await tryPin('4821', t + 31_000)).toEqual({ ok: true });
    expect(failState().count).toBe(0);
    expect(waitAfter(6)).toBe(60_000);
    expect(waitAfter(20)).toBe(15 * 60_000);
  });
});
