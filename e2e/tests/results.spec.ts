import { expect, test } from '@playwright/test';
import { canUseServer, resetSandbox, TEST } from './helpers';

test.describe('Public results link (no login)', () => {
  test.skip(!canUseServer, 'Needs the real server sandbox');
  test.beforeAll(async () => { await resetSandbox(); });

  test('shows the live table and scores, and nothing private', async ({ page }) => {
    await page.goto(`#/results/${TEST.slug}`);
    await expect(page.getByRole('heading', { name: TEST.event })).toBeVisible();
    await expect(page.getByText(`${TEST.club} ·`)).toBeVisible();
    await expect(page.getByText(/Live, updates every 20 seconds/)).toBeVisible();
    const table = page.getByRole('table', { name: 'Pool A' });
    await expect(table.getByRole('row')).toHaveCount(5);
    await expect(table).toContainText('Ravi Test');
    await page.getByRole('button', { name: 'Matches' }).click();
    await expect(page.getByText('10–11')).toBeVisible();
    const text = await page.locator('main').innerText();
    for (const rating of ['4.1', '3.9', '3.6', '3.3']) expect(text).not.toContain(rating);
    expect(text).not.toMatch(/@/);
  });

  test('an unknown results link says so', async ({ page }) => {
    await page.goto('#/results/doesnotexist1');
    await expect(page.getByText(/These results aren’t available/)).toBeVisible();
  });
});
