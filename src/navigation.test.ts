import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from './navigation';

describe('overlay navigation', () => {
  it('keeps the full court path and leaves hash options out of the ID', () => {
    const route = parseRoute('#/overlay/sample%2Dopen/2?bar=top&scale=1.1');
    expect(route).toEqual({ name: 'overlay', id: 'sample-open/2' });
    expect(routeHash(route)).toBe('#/overlay/sample-open/2');
  });

  it('keeps existing routes on their first ID segment', () => {
    expect(parseRoute('#/live/sample-open/2')).toEqual({ name: 'live', id: 'sample-open' });
  });
});
