import { execSync } from 'node:child_process';
/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Content Security Policy for the built app: code may only load from the app itself, and the network
 * is limited to Claude (when you ask) and YouTube (when you play a clip). Added only to builds, since
 * the dev server needs inline scripts.
 */
export function cspFor(clubServer?: string): string {
  // Club mode talks to its own server (and its live-update socket) only on the Club test site.
  const club = clubServer ? ` ${clubServer} ${clubServer.replace(/^https:/, 'wss:')}` : '';
  return [
    "default-src 'self'",
    "script-src 'self' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://i.ytimg.com${clubServer ? ` ${clubServer}` : ''}`,
    "font-src 'self' data:",
    `connect-src 'self' https://api.anthropic.com${club}`,
    "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}
export const CSP = cspFor();

/** The PQ Club app starts from its own entry (club screens only) instead of the personal app's. */
const clubAppEntry = () => ({
  name: 'pq-club-app-entry',
  // 'pre': before Vite reads the page's script, so the build starts from the club entry.
  transformIndexHtml: { order: 'pre' as const, handler: (html: string) => html.replace('/src/main.tsx', '/src/clubApp/main.tsx') },
});

const cspPlugin = (csp: string) => ({
  name: 'pickleq-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
});

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** The commit being built (the checked-out branch, not the workflow's), or 'local'. */
function buildId(): string {
  try { return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'local'; } catch { return 'local'; }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const channel = env.VITE_CHANNEL === 'live' ? 'live' : 'preview';
  const isLive = channel === 'live';
  const isClub = env.VITE_CLUB === 'on';
  const isClubApp = isClub && env.VITE_CLUB_APP === 'on';
  const base = env.VITE_BASE || '/';
  const icon = env.VITE_ICON || channel;
  const otherIcons = ['live', 'preview', 'club'].filter((x) => x !== icon);

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      // Short build code shown in Settings, so you can tell whether a phone has the latest version.
      __BUILD_ID__: JSON.stringify(buildId()),
    },
    plugins: [
      react(),
      cspPlugin(cspFor(env.VITE_SUPABASE_URL)),
      ...(isClubApp ? [clubAppEntry()] : []),
      VitePWA({
        registerType: 'prompt',
        includeAssets: [`icons/${icon}-apple-180.png`],
        manifest: {
          id: base,
          name: isLive ? 'PICKLEQ' : isClubApp ? 'PQ Club' : isClub ? 'PICKLEQ Club' : 'PICKLEQ Preview',
          short_name: isLive ? 'PICKLEQ' : isClub ? 'PQ Club' : 'PQ Preview',
          description: isClubApp ? 'Run pickleball tournaments: entries, draw, a scorer on every court and live results' : 'Personal pickleball tracker and AI coach',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#F3EBDD',
          theme_color: isLive ? '#7A1F2B' : isClub ? '#2F5D62' : '#9A6B1E',
          icons: [
            { src: `icons/${icon}-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `icons/${icon}-512.png`, sizes: '512x512', type: 'image/png' },
            { src: `icons/${icon}-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
          globIgnores: ['icons/*.svg', ...otherIcons.map((x) => `icons/${x}-*`)],
          // The live app sits at /pickleq/; never let it answer for the separate Preview app below it.
          navigateFallbackDenylist: isLive ? [/\/preview\//] : [],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // The robot (e2e/) runs with Playwright against the deployed site, not here.
      exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
      // GitHub's machines are slower than a laptop; give screen tests room so a slow run isn't a failure.
      testTimeout: 20_000,
      // On GitHub, failures also appear as annotations on the run, readable without the raw log.
      reporters: process.env.GITHUB_ACTIONS ? ['default', 'github-actions', ['junit', { outputFile: 'test-results/junit.xml' }]] : ['default'],
      alias: { 'virtual:pwa-register/react': new URL('./src/test/pwaRegisterMock.ts', import.meta.url).pathname },
    },
  };
});
