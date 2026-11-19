import { expect, test } from '@playwright/test';

test('a run-on-RallyQ event keeps contact links disabled while entries are closed', async ({ page }) => {
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
    event.listing = 'run';
    localStorage.setItem(key, JSON.stringify(state));
    return event.publicSlug;
  });
  await page.goto(`#/event/${slug}`);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entries closed', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Message the club/ })).toHaveCount(0);
  await expect(page.locator('a[href*="wa.me"], a[href^="mailto:"]')).toHaveCount(0);
});

test('a listed-only event says Enter with the organiser, with WhatsApp and Call, and no empty entry bar', async ({ page }) => {
  // The server knows no such event (null), so the page reads the demo's listed event.
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: /\/rpc\/public_event$/.test(new URL(route.request().url()).pathname) ? null : [] }));
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  const slug = await page.evaluate(() => {
    const key = 'pq-club-demo-v1';
    const state = JSON.parse(localStorage.getItem(key)!);
    const event = state.tournaments.find((t: { publicSlug?: string }) => t.publicSlug === 'pq-demo-social');
    Object.assign(event, { contact: '90000 00000', status: 'draft', registrationOpen: false, listing: 'listed', listingStatus: 'approved' });
    localStorage.setItem(key, JSON.stringify(state));
    return event.publicSlug;
  });
  await page.goto(`#/event/${slug}`);
  await page.reload();
  await expect(page.getByRole('button', { name: 'WhatsApp the organiser', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Call the organiser', exact: true })).toBeVisible();
  await expect(page.getByText('Enter with the organiser').first()).toBeVisible();
  await expect(page.getByText('Entries closed', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Spots filled')).toHaveCount(0);
});
