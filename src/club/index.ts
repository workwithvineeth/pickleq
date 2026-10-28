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
