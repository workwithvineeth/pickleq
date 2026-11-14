/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_CHANNEL?: string;
  readonly VITE_CLUB?: string;
  readonly VITE_CLUB_APP?: string;
  readonly VITE_DB_NAME?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  /** 'on' for the staging site (paddleq-staging database, fictional data): shows a strip so it's never mistaken for live. */
  readonly VITE_STAGING?: string;
  /** Sentry project key for error reports; blank or unset turns Sentry off. */
  readonly VITE_SENTRY_DSN?: string;
  /** PostHog project key for anonymous usage numbers; blank or unset turns PostHog off. */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog host; default is the US cloud, set https://eu.i.posthog.com for the EU cloud. */
  readonly VITE_POSTHOG_HOST?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Staging home samples only; production defaults OFF. */
declare const __HOME_SHOWCASE__: boolean;
