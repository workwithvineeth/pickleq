export type Channel = 'live' | 'preview';

export function resolveChannel(value: string | undefined): Channel {
  return value === 'preview' ? 'preview' : 'live';
}

export const channel: Channel = resolveChannel(import.meta.env.VITE_CHANNEL);

/** Each channel keeps its own on-phone database so Preview can never touch Live data. */
export function databaseName(ch: Channel, override: string | undefined = import.meta.env.VITE_DB_NAME): string {
  // The Club test site keeps its own database, so it can never touch Preview or Live data.
  if (override) return override;
  return ch === 'preview' ? 'pickleq-preview' : 'pickleq-live';
}

export const appVersion: string = __APP_VERSION__;
