import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'UTC' });

test('the demo court overlay shows both scores on a transparent OBS canvas', async ({ page }) => {
  // The sample's in-progress slot depends on time of day. Always use the local sample viewer.
  await page.clock.setFixedTime(new Date('2026-11-24T12:00:00Z'));
  await page.route('https://*.supabase.co/rest/v1/rpc/public_tournament**', route => route.fulfill({ json: null }));
  const url = '#/overlay/pq-demo-central-s8/1';
  const overlay = page.getByRole('main', { name: 'Score overlay, Court 1' });

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    for (const query of ['', '?scale=1.25', '?bar=top&scale=1.25']) {
      await page.goto(url + query);
      await expect(overlay.getByText('Cedar Club Season 8 · Court 1')).toBeVisible();
      await expect(overlay.getByRole('group', { name: 'Nikhil Pillai, 7 points' }).getByText('7', { exact: true })).toBeVisible();
      await expect(overlay.getByRole('group', { name: 'Meera Bose, 3 points' }).getByText('3', { exact: true })).toBeVisible();
      await expect(overlay.getByText('LIVE', { exact: true })).toBeVisible();
      await expect(overlay.getByRole('group', { name: 'Nikhil Pillai, 7 points' })
        .getByRole('img', { name: 'DUPR 4.52' })).toBeVisible();
      await expect(overlay.getByText('WIN CHANCE · ESTIMATE')).toBeVisible();
      await expect(page.locator('#root > *')).toHaveCount(1);
      for (const element of ['html', 'body', '#root']) {
        await expect(page.locator(element)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(page.locator(element)).toHaveCSS('overflow', 'hidden');
      }
      await expect(overlay.locator(query.includes('bar=top') ? '.overlay-bar-top' : '.overlay-bar-bottom')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const clipped = await overlay.locator('.overlay-panels *').evaluateAll((elements, { width, height }) =>
        elements.filter(el => {
          const { left, top, right, bottom } = el.getBoundingClientRect();
          return left < 0 || top < 0 || right > width + 0.5 || bottom > height + 0.5;
        }).map(el => el.outerHTML), viewport);
      expect(clipped, `${viewport.width}×${viewport.height}${query}`).toEqual([]);
    }
  }
});
