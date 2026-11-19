import { describe, expect, it } from 'vitest';
import { friendlyDate, friendlyDateTime, friendlyTime, relativeDate } from './dates';

const now = new Date(2026, 9, 31, 10, 0);

describe('friendly dates', () => {
  it('shows "Sat, 31 Oct" this year and adds the year otherwise; never 2026-10-31', () => {
    expect(friendlyDate('2026-10-31', now)).toBe('Sat, 31 Oct');
    expect(friendlyDate('2026-11-01T09:00:00Z', now)).toMatch(/^Sun, 1 Nov$/);
    expect(friendlyDate('2025-12-25', now)).toBe('Thu, 25 Dec 2025');
    expect(friendlyDate(undefined, now)).toBe('–');
    expect(friendlyDate('2026-10-31', now)).not.toMatch(/\d{4}-\d{2}/);
  });
  it('shows times as "2:30 pm"', () => {
    expect(friendlyTime('14:30')).toBe('2:30 pm');
    expect(friendlyTime('08:00:00')).toBe('8:00 am');
  });
  it('says Today and Tomorrow', () => {
    expect(relativeDate('2026-10-31', now)).toBe('Today');
    expect(relativeDate('2026-11-01', now)).toBe('Tomorrow');
    expect(relativeDate('2026-11-07', now)).toBe('Sat, 7 Nov');
  });
  it('shows a timestamp with its time', () => {
    expect(friendlyDateTime(new Date(2026, 9, 30, 21, 5).toISOString(), now)).toBe('Fri, 30 Oct, 9:05 pm');
  });
});
