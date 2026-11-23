import { expect, test } from '@playwright/test';
import { assertContrast } from './contrast';

/** v1.2 shell on the organiser pages: Night by default, Day v3 by the mode button, saved, readable and no sideways scroll. */
test('v1.2 club pages: Night default, Day switch saved, readable, fit 320 and 1440', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('https://*.supabase.co/**', (r) => r.fulfill({ json: [] }));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Organiser menu' })).toHaveCount(1);
  await expect(page.locator('.rallyq-prototype .rq').first()).not.toHaveClass(/\bday\b/);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await assertContrast(page.locator('.rallyq-prototype .btn:visible').first());
  }
  await page.getByRole('button', { name: 'Switch to day mode' }).first().click();
  await expect(page.locator('.rallyq-prototype .rq').first()).toHaveClass(/\bday\b/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  await expect(page.locator('.rallyq-prototype .rq').first()).toHaveClass(/\bday\b/);
  await page.getByRole('button', { name: 'Switch to night mode' }).first().click();
  await expect(page.locator('.rallyq-prototype .rq').first()).not.toHaveClass(/\bday\b/);
});

/** The referee picks how they score; side-out calls the score and only the serving side scores. */
test('referee can score side-out: who serves, 0-0-2, rallies', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('https://*.supabase.co/**', (r) => r.fulfill({ json: [] }));
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  const id = await page.evaluate(() => (JSON.parse(localStorage.getItem('pq-club-demo-v1') ?? '{}').tournaments as { id: string; name: string }[]).find((t) => t.name === 'PQ Demo Open')!.id);
  await page.goto(`#/club-desk/${id}`);
  // The desk opens on a court with a booked semi-final: score it from the desk.
  await page.getByRole('button', { name: 'Score', exact: true }).first().click();
  const choice = page.getByRole('group', { name: 'How are you scoring?' });
  await expect(choice).toBeVisible();
  await choice.getByRole('button', { name: 'Side-out scoring' }).click();
  await page.getByRole('region', { name: 'First serve' }).getByRole('button').first().click();
  await expect(page.getByLabel(/Score call 0-0-2/)).toBeVisible();
  await page.getByRole('button', { name: /^Rally to / }).first().click();
  await expect(page.getByLabel(/Score call 1-0-2/)).toBeVisible();
  await page.getByRole('button', { name: /^Rally to / }).nth(1).click();
  await expect(page.getByLabel(/Score call 0-1-1/)).toBeVisible();
});

test('live scores say when they are only a sample; TV board has no desk link', async ({ page }) => {
  await page.goto('#/live');
  await expect(page.getByText(/^Sample scores · /).first()).toBeVisible();
  await expect(page.getByText('Nothing is live right now. These are sample scores', { exact: false })).toBeVisible();
  await page.goto('#/club-tv/no-such-event');
  await expect(page.getByText('The board opens when the draw is made')).toBeVisible();
  await expect(page.getByRole('link', { name: '← Desk' })).toHaveCount(0);
});

test('venue TV square fit places the live QR below the full-width board', async ({ page }) => {
  await page.route('https://*.supabase.co/**', (r) => r.fulfill({ json: [] }));
  await page.setViewportSize({ width: 1080, height: 1080 });
  const tv = '#/club-tv/pq-demo-central-s8';
  const qr = page.getByRole('img', { name: 'QR code: watch live on rallyq.in' });
  await page.goto(tv);
  await expect(page.getByText('Cedar Club Season 8', { exact: true })).toBeVisible();
  await expect(qr).toHaveCount(0);

  await page.goto(`${tv}?fit=square`);
  await expect(qr).toBeVisible();
  await expect(page.getByText('Watch live on rallyq.in', { exact: true })).toBeVisible();
  await expect(page.getByText('Cedar Club Season 8', { exact: true })).toBeVisible();
  expect(await qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  for (const width of [1080, 320]) {
    await page.setViewportSize({ width, height: width });
    const board = (await page.locator('.rallyq-screen-tv > .rq').boundingBox())!;
    expect(board.width).toBe(width);
    expect(board.height).toBeCloseTo(width * 9 / 16, 0);
    expect((await qr.boundingBox())!.y).toBeGreaterThan(board.y + board.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('organiser menu has My Player Studio and Sign out', async ({ page }) => {
  await page.goto('#/demo'); await page.getByLabel('Your name in the demo').fill('Robot Organiser');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  // My clubs: the next-tournament card keeps PINs hidden until asked.
  await page.goto('#/club');
  await expect(page.getByLabel('Referee PIN hidden')).toBeVisible();
  await page.getByRole('button', { name: 'Show referee pin' }).click();
  await expect(page.getByLabel(/^Referee PIN \d{4}$/)).toBeVisible();
  await page.getByRole('button', { name: 'PQ Demo Club', exact: false }).first().click();
  const menu = page.getByRole('complementary', { name: 'Organiser menu' });
  await expect(menu.getByRole('link', { name: 'My Player Studio' })).toBeVisible();
  await menu.getByRole('link', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/#\/club-signin/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});
