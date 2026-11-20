import { describe, expect, it } from 'vitest';
import { count } from './count';
import { renameForKind } from './screens/Tournament';

describe('count', () => {
  it('uses the right word for 1 and many', () => {
    expect(count(1, 'match', 'matches')).toBe('1 match');
    expect(count(3, 'match', 'matches')).toBe('3 matches');
    expect(count(1, 'court')).toBe('1 court');
    expect(count(0, 'court')).toBe('0 courts');
  });
});

describe('event name follows Singles/Doubles', () => {
  it('renames a default name and keeps a custom one', () => {
    expect(renameForKind('Open Singles', 'doubles')).toBe('Open Doubles');
    expect(renameForKind('Open Doubles', 'singles')).toBe('Open Singles');
    expect(renameForKind("Men's Singles 35+", 'doubles')).toBe("Men's Doubles 35+");
    expect(renameForKind('Company Cup', 'doubles')).toBe('Company Cup');
  });
});
