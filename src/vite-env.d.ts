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
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Staging home samples only; production defaults OFF. */
declare const __HOME_SHOWCASE__: boolean;
