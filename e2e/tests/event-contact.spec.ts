import { expect, test } from '@playwright/test';

test('public event keeps contact links disabled while entries are closed', async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  const slug = await page.evaluate(() => {
    const key = 'pq-club-demo-v1';
    const state = JSON.parse(localStorage.getItem(key)!);
    const event = state.tournaments.find((t: { publicSlug?: string }) => t.publicSlug === 'pq-demo-social');
    event.contact = '90000 00000';
    event.status = 'draft';
    event.registrationOpen = false;
    localStorage.setItem(key, JSON.stringify(state));
    return event.publicSlug;
  });
  await page.goto(`#/event/${slug}`);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entries closed', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Message the club/ })).toHaveCount(0);
  await expect(page.locator('a[href*="wa.me"], a[href^="mailto:"]')).toHaveCount(0);
});
