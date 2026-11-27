import { expect, test } from '@playwright/test';

test('an organiser can link, show and hide a YouTube stream', async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ body: '<title>Embed fixture</title>', contentType: 'text/html' }));
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  const tournamentId = await page.evaluate(() => {
    const { tournaments } = JSON.parse(localStorage.getItem('pq-club-demo-v1') ?? '{}');
    return tournaments.find((tournament: { publicSlug: string }) => tournament.publicSlug === 'pq-demo-open').id as string;
  });

  await page.setViewportSize({ width: 320, height: 820 });
  await page.goto(`#/club-tournament/${tournamentId}`);
  await page.getByRole('link', { name: 'Live streams' }).click();
  await expect(page.getByRole('heading', { name: 'Live streams', exact: true })).toBeVisible();

  const court = page.getByRole('region', { name: 'Court 1' });
  const link = court.getByLabel('YouTube link for Court 1');
  await link.fill('https://youtube.com.evil.in/watch?v=Ab3dEfG_h-1');
  await court.getByRole('button', { name: 'Save' }).click();
  await expect(court.getByRole('alert')).toContainText("Paste the link from YouTube's Share button.");
  await expect(court.getByRole('button', { name: 'Show to fans' })).toBeDisabled();

  await link.fill('https://youtu.be/Ab3dEfG_h-1');
  await court.getByRole('button', { name: 'Save' }).click();
  await expect(court.getByText('Stream linked')).toBeVisible();
  await court.getByRole('button', { name: 'Show to fans' }).click();
  const consent = page.getByRole('dialog');
  await expect(consent).toContainText('Put up the filming notice at the venue');
  await consent.getByRole('button', { name: "I've told them — show it" }).click();
  await expect(court.getByRole('button', { name: 'Showing to fans' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.goto('#/live/pq-demo-open');
  const frame = page.getByTitle('YouTube court video');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/Ab3dEfG_h-1/);
  await expect(page.getByRole('switch', { name: 'Synced to video' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(frame).toBeVisible();
  const video = await frame.boundingBox();
  const board = await page.getByRole('region', { name: 'Court 1 scoreboard' }).boundingBox();
  expect(board!.x).toBeGreaterThan(video!.x + video!.width);
  expect(video!.width / video!.height).toBeCloseTo(16 / 9, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  // Day mode: the court page follows the green day page, not a night-black card.
  const night = await page.locator('.court-watch').evaluate(e => getComputedStyle(e).backgroundColor);
  expect(night).toBe('rgb(6, 20, 13)');
  await page.getByRole('button', { name: 'Switch to day mode' }).first().click();
  await expect(page.locator('.court-watch')).toHaveCSS('background-color', 'rgb(36, 95, 64)');
  await expect(page.locator('.watch-team').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Switch to night mode' }).first().click();

  await page.goto(`#/club-streams/${tournamentId}`);
  await court.getByRole('button', { name: 'Showing to fans' }).click();
  await expect(court.getByText('Stream hidden')).toBeVisible();
  await page.goto('#/live/pq-demo-open');
  await expect(page).toHaveURL(/#\/results\/pq-demo-open$/);
  await expect(frame).toHaveCount(0);
});
