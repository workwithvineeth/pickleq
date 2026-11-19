import { describe, expect, it, vi } from 'vitest';
import { initMonitoring, posthogOptions, sentryOptions, track, trackPageview } from './monitoring';

const TOKEN = 'k7Qx9TnB2mVwL4pRzA8cYd3FhJ6sUe1G';

describe('monitoring is off unless keys are set', () => {
  it('loads nothing and reports nothing without keys', async () => {
    const sentry = vi.fn(), posthog = vi.fn();
    const r = await initMonitoring({}, { sentry, posthog });
    expect(r).toEqual({ sentry: false, posthog: false });
    expect(sentry).not.toHaveBeenCalled();
    expect(posthog).not.toHaveBeenCalled();
    expect(() => track('anything')).not.toThrow();
    expect(() => trackPageview()).not.toThrow();
  });

  it('treats blank keys as unset', async () => {
    const sentry = vi.fn(), posthog = vi.fn();
    expect(await initMonitoring({ sentryDsn: '  ', posthogKey: '' }, { sentry, posthog })).toEqual({ sentry: false, posthog: false });
  });

  it('starts only the tool that has a key, and a failing tool never breaks the app', async () => {
    const init = vi.fn();
    const r = await initMonitoring({ sentryDsn: 'https://k@o.ingest.sentry.io/1', posthogKey: 'phc_x' }, {
      sentry: async () => ({ init, captureMessage: vi.fn() }),
      posthog: async () => { throw new Error('blocked by an ad blocker'); },
    });
    expect(r).toEqual({ sentry: true, posthog: false });
    expect(init).toHaveBeenCalledTimes(1);
  });
});

describe('privacy settings', () => {
  it('Sentry: no personal data, no replay, no tracing, scrubbed events', () => {
    const o = sentryOptions({ sentryDsn: 'https://k@o.ingest.sentry.io/1', release: 'abc' });
    expect(o.sendDefaultPii).toBe(false);
    expect(o.tracesSampleRate).toBe(0);
    expect(o.replaysSessionSampleRate ?? 0).toBe(0);
    expect(o.replaysOnErrorSampleRate ?? 0).toBe(0);
    expect(JSON.stringify(o.integrations ?? [])).not.toMatch(/replay/i);
    const ev = o.beforeSend!({ request: { url: `https://paddleq.in/#/court/${TOKEN}` }, user: { email: 'a@b.in' } } as never, {} as never) as { request: { url: string }; user?: unknown };
    expect(ev.request.url).toBe('https://paddleq.in/#/court/[token]');
    expect(ev.user).toBeUndefined();
    const crumb = o.beforeBreadcrumb!({ category: 'navigation', data: { to: `/#/court/${TOKEN}` } } as never, undefined) as { data: { to: string } };
    expect(crumb.data.to).toBe('/#/court/[token]');
  });

  it('PostHog: session recording off, no autocapture, anonymous, no IP, scrubbed addresses', () => {
    const o = posthogOptions({ posthogKey: 'phc_x' });
    expect(o.disable_session_recording).toBe(true);
    expect(o.autocapture).toBe(false);
    expect(o.capture_pageview).toBe(false);
    expect(o.person_profiles).toBe('identified_only');
    expect(o.ip).toBe(false);
    expect(o.respect_dnt).toBe(true);
    expect(o.disable_surveys).toBe(true);
    const p = o.sanitize_properties!({ $current_url: `https://paddleq.in/#/court/${TOKEN}`, $referrer: `https://paddleq.in/#/desk/${TOKEN}`, $pathname: `/#/court/${TOKEN}`, other: 1 }, 'x');
    expect(JSON.stringify(p)).not.toContain(TOKEN);
    const ev = o.before_send!({ event: '$pageview', properties: { $current_url: `https://paddleq.in/#/court/${TOKEN}?pin=1234` } } as never) as { properties: { $current_url: string } };
    expect(ev.properties.$current_url).toBe('https://paddleq.in/#/court/[token]?pin=[removed]');
  });

  it('PostHog host defaults to the US cloud and can be changed', () => {
    expect(posthogOptions({ posthogKey: 'k' }).api_host).toBe('https://us.i.posthog.com');
    expect(posthogOptions({ posthogKey: 'k', posthogHost: 'https://eu.i.posthog.com' }).api_host).toBe('https://eu.i.posthog.com');
  });
});
