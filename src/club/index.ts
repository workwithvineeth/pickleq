import type { ClubBackend } from './backend';
import { clubMode, clubServerConfig, isClubApp } from './config';
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
  // A standalone club app can restore a valid Supabase session without an old mode flag.
  if (isClubApp()) return serverBackend();
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

let viewer: Promise<DemoBackend> | null = null;
/**
 * A demo's sample events (slugs starting pq-demo-) are made on each phone, so a shared link opened somewhere else
 * (another phone, or Instagram's or WhatsApp's own browser) has no demo to read. This builds the same sample set in
 * memory, for reading only; nothing is saved on that phone.
 */
export function isSampleSlug(slug: string): boolean { return /^pq-demo-/.test(slug); }
export function sampleViewer(): Promise<DemoBackend> {
  if (!viewer) viewer = (async () => { const v = new DemoBackend(null); await v.start('Guest'); return v; })();
  return viewer;
}
/** Where to look up a shared event or results link, adding the sample viewer for demo links. */
export async function publicSourcesFor(slug: string): Promise<ClubBackend[]> {
  const list = publicSources();
  return isSampleSlug(slug) ? [...list, await sampleViewer()] : list;
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
  try { if (hash) localStorage.setItem(RETURN_KEY, JSON.stringify({ h: hash, t: Date.now() })); else localStorage.removeItem(RETURN_KEY); } catch { /* private mode */ }
}
export function takeReturn(): string | null {
  // Only a recent request counts (30 min), so an old one never hijacks a later sign-in.
  try {
    const v = localStorage.getItem(RETURN_KEY); localStorage.removeItem(RETURN_KEY);
    if (!v) return null;
    const r = JSON.parse(v) as { h?: unknown; t?: unknown };
    return typeof r.h === 'string' && typeof r.t === 'number' && Date.now() - r.t < 30 * 60 * 1000 ? r.h : null;
  } catch { return null; }
}
