import { expect, test, type Page } from '@playwright/test';
import type { ClubMatch } from '../../src/club/types';

/** Two local demo matches: no real accounts, PINs, or tournament writes. */
async function openCourt(page: Page) {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: { error: 'This referee link isn’t valid.' } }));
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Robot Referee');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const key = 'pq-club-demo-v1';
    const state = JSON.parse(localStorage.getItem(key)!);
    const tournament = state.tournaments.find((t: { name: string }) => t.name === 'PQ Demo Open');
    const source = state.matches.filter((m: ClubMatch) => m.tournamentId === tournament.id && m.sideA.length && m.sideB.length).slice(0, 2);
    state.matches = state.matches.filter((m: ClubMatch) => m.tournamentId !== tournament.id);
    source.forEach((m: ClubMatch, i: number) => state.matches.push({ ...m, id: `robot-match-${i}`, court: 1, slot: i, games: [], status: 'scheduled', winner: undefined, format: { bestOf: 1, pointsTo: 11, golden: false, scoring: 'rally' } }));
    tournament.status = 'live';
    state.scorerLinks.push({ id: 'robot-link', tournamentId: tournament.id, clubId: tournament.clubId, court: 1, token: 'robot-court', pin: '4826', revoked: false, failed: 0 });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto('#/court/robot-court');
  await page.reload();
  await page.getByLabel('PIN', { exact: true }).fill('4826');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Court 1 · Match queue', exact: true })).toBeVisible();
}

async function fitsPhone(page: Page) {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `width ${width}`).toBeLessThanOrEqual(width);
  }
}

test('saving a referee result offers the next match on the court list', async ({ page }) => {
  await openCourt(page);
  await page.getByRole('button', { name: /^Score match:/ }).click();
  const point = page.getByRole('button', { name: /^Point to / }).first();
  for (let i = 0; i < 11; i++) await point.click();
  await page.getByRole('button', { name: 'Confirm final score', exact: true }).click();
  await expect(page.getByText('Final score saved.', { exact: true })).toBeVisible();
  const next = page.getByRole('button', { name: /^Start next:/ });
  await expect(next).toBeVisible();
  expect(await next.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await fitsPhone(page);
  await next.click();
  await expect(page.getByRole('button', { name: /^Point to / }).first()).toBeVisible();
  await expect(page.getByText('Final score saved.', { exact: true })).toHaveCount(0);
});

test('the referee sees an offline banner after losing signal, which clears on reconnect', async ({ page, context }) => {
  await openCourt(page);
  await page.getByRole('button', { name: /^Score match:/ }).click();
  const banner = page.getByRole('status', { name: 'Connection', exact: true });
  await expect(banner).toHaveCount(0);
  await context.setOffline(true);
  await expect(banner).toContainText('No connection.', { timeout: 10_000 });
  await expect(banner).toContainText('Keep scoring');
  await fitsPhone(page);
  await context.setOffline(false);
  await expect(banner).toHaveCount(0);
});
