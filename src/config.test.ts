import { describe, expect, it } from 'vitest';
import { databaseName, resolveChannel } from './config';
import { parseRoute } from './navigation';

describe('Preview and Live separation', () => {
  it('gives Preview and Live different databases', () => {
    expect(databaseName('live')).not.toBe(databaseName('preview'));
  });
  it('treats anything other than "preview" as Live', () => {
    expect(resolveChannel('preview')).toBe('preview');
    expect(resolveChannel('live')).toBe('live');
    expect(resolveChannel(undefined)).toBe('live');
  });
});

describe('routes', () => {
  it('maps hashes to screens and falls back to Home', () => {
    expect(parseRoute('#/stats')).toEqual({ name: 'stats' });
    expect(parseRoute('#/log')).toEqual({ name: 'log' });
    expect(parseRoute('#/match/abc-123')).toEqual({ name: 'match', id: 'abc-123' });
    expect(parseRoute('#/matches/incomplete')).toEqual({ name: 'matches', id: 'incomplete' });
    expect(parseRoute('#/match')).toEqual({ name: 'home' });
    expect(parseRoute('#/nonsense')).toEqual({ name: 'home' });
    expect(parseRoute('')).toEqual({ name: 'home' });
  });
});
