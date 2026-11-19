import { defineConfig, devices } from '@playwright/test';

const base = process.env.PQ_BASE ?? 'https://paddleq.in/';

/** The PQ Club test robot. Runs against the deployed Club test site and the real club server. */
export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }], ['json', { outputFile: 'results.json' }]] : [['list']],
  use: {
    baseURL: base,
    // The demo club is for PaddleQ admins; the robot isn't signed in, so it sets the demo switch for its own browser.
    storageState: { cookies: [], origins: [{ origin: new URL(base).origin, localStorage: [{ name: 'pq-demo-robot', value: '1' }] }] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
});
