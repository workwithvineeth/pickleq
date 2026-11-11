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
