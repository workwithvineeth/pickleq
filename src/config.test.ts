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
    expect(parseRoute('#/stats')).toBe('stats');
    expect(parseRoute('#/log')).toBe('log');
    expect(parseRoute('#/nonsense')).toBe('home');
    expect(parseRoute('')).toBe('home');
  });
});
