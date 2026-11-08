import { describe, expect, it } from 'vitest';
import { needsPlainGlass } from './displayEffects';
describe('glass performance preference', () => {
  it('preserves glass when device hints are missing or capable', () => {
    expect(needsPlainGlass({})).toBe(false); expect(needsPlainGlass({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false);
    expect(needsPlainGlass({ deviceMemory: 0, hardwareConcurrency: 0 })).toBe(false);
  });
  it('offers plain glass only for a low-memory or low-core device', () => {
    expect(needsPlainGlass({ deviceMemory: 2, hardwareConcurrency: 8 })).toBe(true);
    expect(needsPlainGlass({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe(true);
  });
});
