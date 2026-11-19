import { describe, expect, it } from 'vitest';
import { connectSrc, monitoringHosts } from './hosts';

describe('monitoring in the Content-Security-Policy', () => {
  const club = ' https://x.supabase.co wss://x.supabase.co';
  it('adds nothing when no key is set, so the policy stays as tight as before', () => {
    expect(monitoringHosts({})).toEqual([]);
    expect(monitoringHosts({ VITE_SENTRY_DSN: ' ', VITE_POSTHOG_KEY: '' })).toEqual([]);
    expect(connectSrc(club, [])).toBe("connect-src 'self' https://api.anthropic.com" + club);
  });
  it('allows only the Sentry and PostHog addresses that are in use, never the key', () => {
    const hosts = monitoringHosts({ VITE_SENTRY_DSN: 'https://abc123@o99.ingest.sentry.io/42', VITE_POSTHOG_KEY: 'phc_x' });
    expect(hosts).toEqual(['https://o99.ingest.sentry.io', 'https://us.i.posthog.com']);
    const line = connectSrc(club, hosts);
    expect(line).toContain('https://o99.ingest.sentry.io');
    expect(line).toContain('https://us.i.posthog.com');
    expect(line).not.toContain('abc123');
  });
  it('follows a custom PostHog host', () => {
    expect(monitoringHosts({ VITE_POSTHOG_KEY: 'k', VITE_POSTHOG_HOST: 'https://eu.i.posthog.com/' })).toEqual(['https://eu.i.posthog.com']);
  });
});
