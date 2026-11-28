import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'UTC' });

test('the stream overlay shows the same win chance as the venue TV for Court 1', async ({ page }) => {
  // Same fixed sample moment as the overlay check, so both screens read the same score.
  await page.clock.setFixedTime(new Date('2026-11-24T12:00:00Z'));
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: null }));
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto('#/club-tv/pq-demo-central-s8');
  const court1 = page.locator('text=Court 1').first();
  await expect(court1).toBeVisible();
  const tvLine = await page.getByText(/^Nikhil \d+% · /).first().innerText();
  const tvPercent = tvLine.match(/^Nikhil (\d+)%/)![1];

  await page.goto('#/overlay/pq-demo-central-s8/1');
  const overlay = page.getByRole('main', { name: 'Score overlay, Court 1' });
  await expect(overlay.getByText('WIN CHANCE · ESTIMATE')).toBeVisible();
  await expect(overlay.locator('.overlay-meter-a')).toContainText(`${tvPercent}%`);
  await expect(overlay.locator('.overlay-meter-b')).toContainText(`${100 - Number(tvPercent)}%`);
});

test('footer links are at least 44 px tall on phones', async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.setViewportSize({ width: 320, height: 700 });
  for (const [route, name] of [['#/live/pq-demo-central-s8', 'Privacy'], ['#/events', 'Privacy']] as const) {
    await page.goto(route);
    const link = page.getByRole('link', { name, exact: true }).last();
    await expect(link).toBeVisible();
    const box = (await link.boundingBox())!;
    expect(box.height, `${name} on ${route}`).toBeGreaterThanOrEqual(44);
  }
  await page.goto('./');
  for (const name of ['Events', 'Live scores', 'Player Studio']) {
    const link = page.locator('footer.foot').getByRole('link', { name, exact: true });
    if (!(await link.count())) continue;
    await link.scrollIntoViewIfNeeded();
    expect((await link.boundingBox())!.height, `${name} in the home footer`).toBeGreaterThanOrEqual(44);
  }
});
