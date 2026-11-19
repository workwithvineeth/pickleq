import { describe, expect, it } from 'vitest';
import { holes } from './holes';

describe('prototype holes', () => {
  it('throws in tests when a replacement no longer matches the prototype', () => {
    expect(holes('Hello Cedar', [['Cedar', '{{club}}']])).toBe('Hello {{club}}');
    expect(() => holes('Hello Cedar', [['Banyan', '{{club}}']])).toThrow(/prototype text not found: Banyan/);
  });
  // Each screen fills its prototype when the module loads, so importing it is enough to catch a stale replacement.
  it.each([
    ['admin', () => import('./admin/RallyAdmin')],
    ['event', () => import('./event/RallyEvent')],
    ['overview', () => import('./organiser/RallyOverview')],
    ['social', () => import('./social/RallySocial')],
    ['my studio', () => import('./studio/MyStudio')],
    ['public profile', () => import('./studio/PublicProfile')],
    ['tv', () => import('./tv/RallyTV')],
  ])('%s screen matches its prototype', async (_name, load) => {
    await expect(load()).resolves.toBeTruthy();
  });
});
