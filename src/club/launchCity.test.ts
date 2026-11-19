import { describe, expect, it } from 'vitest';
import { inLaunchCity, LAUNCH_CITY } from './config';

describe('Hyderabad-only launch', () => {
  it('keeps Hyderabad (any case or spacing) and events with no city; drops other cities', () => {
    expect(LAUNCH_CITY).toBe('Hyderabad');
    for (const c of ['Hyderabad', ' hyderabad ', 'HYDERABAD', 'Secunderabad', undefined, null, '']) expect(inLaunchCity(c)).toBe(true);
    for (const c of ['Bengaluru', 'Pune', 'Mumbai']) expect(inLaunchCity(c)).toBe(false);
  });
});
