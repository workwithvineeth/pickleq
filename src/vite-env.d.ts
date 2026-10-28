/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_CHANNEL?: string;
  readonly VITE_CLUB?: string;
  readonly VITE_DB_NAME?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
