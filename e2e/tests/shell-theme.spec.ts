import { expect, test, type Page } from '@playwright/test';
import { assertContrast } from './contrast';
test.use({ actionTimeout: 15000 });

test.beforeEach(async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
});
async function demo(page: Page) {
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Organiser menu' })).toBeVisible();
}
async function chooseMode(page: Page, day: boolean) {
  const rq = page.locator('.rallyq-prototype .rq').first();
  if ((await rq.getAttribute('class'))?.split(' ').includes('day') !== day) {
    await page.getByRole('button', { name: day ? 'Switch to day mode' : 'Switch to night mode' }).first().click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', day ? 'light' : 'dark');
}

test('shell matrix: current Day and Night modes, contrast and responsive layout', async ({ page }) => {
  test.setTimeout(300000);
  const cspErrors: string[] = [];
  page.on('console', msg => { if (/Refused to execute inline script|Content Security Policy.*script/.test(msg.text())) cspErrors.push(msg.text()); });
  await demo(page);
  for (const width of [320, 390, 870, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ['light', 'dark'] as const) for (const day of [false, true]) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await chooseMode(page, day);
      await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', day ? '#2B6E4B' : '#06140D');
      const menu = page.getByRole('complementary', { name: 'Organiser menu' });
      await assertContrast(menu.locator('a:visible'));
      await assertContrast(page.locator('.rallyq-prototype .btn:visible').first());
      expect(await page.evaluate(() => document.documentElement.scrollWidth), width + ' ' + colorScheme + ' ' + day).toBeLessThanOrEqual(width);
    }
  }
  await page.reload();
  await expect(page.locator('.rallyq-prototype .rq').first()).toHaveClass(/\bday\b/);
  expect(cspErrors).toEqual([]);
});

test('organiser links and mode switch work in keyboard order with visible focus', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await demo(page);
  const mode = page.getByRole('button', { name: 'Switch to day mode' }).first();
  await mode.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Switch to night mode' }).first()).toBeFocused();
  const menu = page.getByRole('complementary', { name: 'Organiser menu' });
  await menu.getByRole('link', { name: 'Home', exact: true }).focus();
  await page.keyboard.press('Tab');
  const tournaments = menu.getByRole('link', { name: 'Tournaments', exact: true });
  await expect(tournaments).toBeFocused();
  expect(await tournaments.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await assertContrast(tournaments, 'outline');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/club-tournaments/);
});

test('saved theme runs before app JavaScript and obeys CSP', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('pq-theme', 'dark'));
  await page.route('**/assets/*.js', route => route.abort());
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(6, 20, 13)');
});

test('live status labels are readable and demo results announce score updates', async ({ page }) => {
  await demo(page);
  await page.goto('#/live');
  await expect(page.getByText(/^Sample scores · /).first()).toBeVisible();
  for (const day of [false, true]) {
    await chooseMode(page, day);
    // Sample boards say Sample, never Live (20/10): no live chips on the sample, and the Sample chips stay readable.
    await expect(page.locator('.rallyq-prototype .chip.live:visible')).toHaveCount(0);
    await expect(page.locator('.rallyq-prototype .chip:visible', { hasText: /^Sample$/ }).first()).toBeVisible();
  }
  await page.goto('#/results/pq-demo-open');
  await expect(page.getByRole('heading', { name: 'PQ Demo Open', exact: true })).toBeVisible();
  await expect(page.locator('[data-score-announcement]')).toHaveAttribute('aria-live', 'polite');
});

test('phone menu and Day/Night settings work with the keyboard at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await demo(page);
  await page.goto('#/events');
  await expect(page.getByRole('heading', { name: 'Find your next main event.' })).toBeVisible();
  const mode = page.getByRole('button', { name: 'Switch to day mode' }).first();
  await mode.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Tab');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await expect(menu).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  const live = page.getByRole('navigation', { name: 'Menu', exact: true }).getByRole('link', { name: 'Live scores' });
  await expect(live).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/live/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
