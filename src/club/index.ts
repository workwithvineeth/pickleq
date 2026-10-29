import type { ClubBackend } from './backend';
import { clubMode, clubServerConfig } from './config';
import { DemoBackend } from './demo';
import { ServerBackend } from './server';

let demo: DemoBackend | null = null;
let server: ServerBackend | null = null;

export function demoBackend(): DemoBackend {
  if (!demo) demo = new DemoBackend();
  return demo;
}

export function serverBackend(): ServerBackend | null {
  const cfg = clubServerConfig();
  if (!cfg) return null;
  if (!server) server = new ServerBackend(cfg.url, cfg.key);
  return server;
}

/** The backend in use: the demo on this phone, or the club server once you've signed in. */
export function backend(): ClubBackend | null {
  const m = clubMode();
  if (m === 'demo') return demoBackend();
  if (m === 'server') return serverBackend();
  return null;
}

/** For tests: start from a clean demo. */
export function resetClubBackendsForTests() { demo = null; server = null; }

/**
 * Where to look up a public link (results or scorer link): the real club server first, then the demo on this phone.
 * A link never depends on which mode this phone was last left in.
 */
export function publicSources(): ClubBackend[] {
  const s = serverBackend();
  return s ? [s, demoBackend()] : [demoBackend()];
}

/** Where the Events tab reads the board: the demo when this phone is in demo mode, otherwise the real club server. */
export function eventsBackend(): ClubBackend {
  return clubMode() === 'demo' ? demoBackend() : serverBackend() ?? demoBackend();
}

const RETURN_KEY = 'pq-club-return';
/**
 * Remembers a screen to come back to after signing in. Kept in localStorage (not sessionStorage) because the
 * email's sign-in link opens in a new tab.
 */
export function rememberReturn(hash: string | null) {
  try { if (hash) localStorage.setItem(RETURN_KEY, hash); else localStorage.removeItem(RETURN_KEY); } catch { /* private mode */ }
}
export function takeReturn(): string | null {
  try { const v = localStorage.getItem(RETURN_KEY); localStorage.removeItem(RETURN_KEY); return v; } catch { return null; }
}
