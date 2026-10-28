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
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com https://s.ytimg.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.anthropic.com",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const cspPlugin = {
  name: 'pickleq-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const channel = env.VITE_CHANNEL === 'live' ? 'live' : 'preview';
  const isLive = channel === 'live';
  const base = env.VITE_BASE || '/';

  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [
      react(),
      cspPlugin,
      VitePWA({
        registerType: 'prompt',
        includeAssets: [`icons/${channel}-apple-180.png`],
        manifest: {
          id: base,
          name: isLive ? 'PICKLEQ' : 'PICKLEQ Preview',
          short_name: isLive ? 'PICKLEQ' : 'PQ Preview',
          description: 'Personal pickleball tracker and AI coach',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#F3EBDD',
          theme_color: isLive ? '#7A1F2B' : '#9A6B1E',
          icons: [
            { src: `icons/${channel}-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `icons/${channel}-512.png`, sizes: '512x512', type: 'image/png' },
            { src: `icons/${channel}-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
          globIgnores: ['icons/*.svg', `icons/${isLive ? 'preview' : 'live'}-*`],
          // The live app sits at /pickleq/; never let it answer for the separate Preview app below it.
          navigateFallbackDenylist: isLive ? [/\/preview\//] : [],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // GitHub's machines are slower than a laptop; give screen tests room so a slow run isn't a failure.
      testTimeout: 20_000,
      // On GitHub, failures also appear as annotations on the run, readable without the raw log.
      reporters: process.env.GITHUB_ACTIONS ? ['default', 'github-actions', ['junit', { outputFile: 'test-results/junit.xml' }]] : ['default'],
      alias: { 'virtual:pwa-register/react': new URL('./src/test/pwaRegisterMock.ts', import.meta.url).pathname },
    },
  };
});
