/** The web addresses the page may talk to for monitoring, for the build's Content-Security-Policy. Empty when no key is set. */
export function monitoringHosts(env: { VITE_SENTRY_DSN?: string; VITE_POSTHOG_KEY?: string; VITE_POSTHOG_HOST?: string }): string[] {
  const out: string[] = [];
  const dsn = env.VITE_SENTRY_DSN?.trim();
  if (dsn) { try { out.push(new URL(dsn).origin); } catch { /* a bad key just leaves Sentry blocked */ } }
  if (env.VITE_POSTHOG_KEY?.trim()) {
    try { out.push(new URL(env.VITE_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com').origin); } catch { /* ignore */ }
  }
  return [...new Set(out)];
}

/** The connect-src line of the Content-Security-Policy: the app, Claude, the club server (`club`, already prefixed with a space) and monitoring. */
export function connectSrc(club: string, monitoring: string[]): string {
  return `connect-src 'self' https://api.anthropic.com${club}${monitoring.length ? ` ${monitoring.join(' ')}` : ''}`;
}
