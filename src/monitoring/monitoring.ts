import { scrubSentryEvent, scrubText, scrubUrl } from './scrub';

/** Keys come from build-time env vars. Blank or missing means that tool is off and its code is never even downloaded. */
export interface MonitoringEnv { sentryDsn?: string; posthogKey?: string; posthogHost?: string; release?: string; channel?: string }

const set = (v?: string) => (v && v.trim() ? v.trim() : undefined);
const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com';

/** Sentry: errors only. No user details, no tracing, no session replay; every event is scrubbed before it is sent. */
export function sentryOptions(env: MonitoringEnv) {
  return {
    dsn: set(env.sentryDsn),
    release: env.release,
    environment: env.channel,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [] as unknown[],
    beforeSend: (event: Parameters<typeof scrubSentryEvent>[0]) => scrubSentryEvent(event),
    beforeBreadcrumb: (crumb: object) => scrubSentryEvent({ ...crumb } as never) as object,
  } as {
    dsn?: string; release?: string; environment?: string; sendDefaultPii: boolean; tracesSampleRate: number;
    replaysSessionSampleRate: number; replaysOnErrorSampleRate: number; integrations: unknown[];
    beforeSend: (e: never, h: never) => unknown; beforeBreadcrumb: (c: never, h: unknown) => unknown;
  };
}

type Props = Record<string, unknown>;
const URL_PROPS = ['$current_url', '$referrer', '$pathname', '$initial_referrer', '$initial_current_url', '$referring_domain'];
const cleanProps = (p: Props): Props => {
  const out: Props = { ...p };
  for (const k of URL_PROPS) if (typeof out[k] === 'string') out[k] = scrubUrl(out[k] as string);
  return out;
};

/** PostHog: anonymous page views and a few named events. No recording, no autocapture, no profiles, no IP. */
export function posthogOptions(env: MonitoringEnv) {
  return {
    api_host: set(env.posthogHost) ?? POSTHOG_DEFAULT_HOST,
    disable_session_recording: true,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    person_profiles: 'identified_only' as const,
    ip: false,
    respect_dnt: true,
    disable_surveys: true,
    // Never pull extra scripts from PostHog's servers: the page's security policy would block them, and nothing here needs them.
    disable_external_dependency_loading: true,
    sanitize_properties: (props: Props, _event: string) => cleanProps(props),
    before_send: (cap: { properties?: Props } | null) => (cap ? { ...cap, properties: cap.properties ? cleanProps(cap.properties) : cap.properties } : cap),
  };
}

interface SentryLib { init(o: unknown): void; captureMessage(m: string, level?: string): unknown }
interface PosthogLib { init(key: string, o: unknown): void; capture(e: string, p?: Props): void }
export interface MonitoringLoaders { sentry: () => Promise<SentryLib | unknown>; posthog: () => Promise<PosthogLib | unknown> }

let sentry: SentryLib | null = null;
let posthog: PosthogLib | null = null;

/** Starts whichever tools have a key. Never throws: monitoring must not be able to break the app or a match. */
export async function initMonitoring(env: MonitoringEnv, loaders: MonitoringLoaders = defaultLoaders): Promise<{ sentry: boolean; posthog: boolean }> {
  let s = false, p = false;
  if (set(env.sentryDsn)) {
    try { const lib = await loaders.sentry() as SentryLib; lib.init(sentryOptions(env)); sentry = lib; s = true; } catch { /* blocked or offline: carry on */ }
  }
  if (set(env.posthogKey)) {
    try {
      const mod = await loaders.posthog() as { default?: PosthogLib } & Partial<PosthogLib>;
      const lib = (mod.default ?? mod) as PosthogLib;
      lib.init(set(env.posthogKey)!, posthogOptions(env)); posthog = lib; p = true;
    } catch { /* blocked or offline: carry on */ }
  }
  return { sentry: s, posthog: p };
}

const defaultLoaders: MonitoringLoaders = { sentry: () => import('@sentry/browser'), posthog: () => import('posthog-js') };

/** A named event with no personal details. Does nothing when monitoring is off. */
export function track(event: string, props: Props = {}): void {
  try { posthog?.capture(event, cleanProps(props)); } catch { /* ignore */ }
}
/** Tells Sentry about a problem that is not an exception (for example a refused score). Text is scrubbed. */
export function report(message: string): void {
  try { sentry?.captureMessage(scrubText(message), 'warning'); } catch { /* ignore */ }
}
/** One page view, with the address scrubbed (court, desk and claim tokens and PINs removed). */
export function trackPageview(): void {
  if (typeof window === 'undefined') return;
  track('$pageview', { $current_url: window.location.href, $pathname: window.location.pathname + window.location.hash });
}
/** Counts page views as the hash route changes. */
export function watchPageviews(): void {
  if (typeof window === 'undefined') return;
  trackPageview();
  window.addEventListener('hashchange', trackPageview);
}
