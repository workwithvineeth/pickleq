import { expect, test } from '@playwright/test';

test('point feedback keeps the 320px pad layout fixed and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    (window as unknown as { vibrations: number[] }).vibrations = [];
    Object.defineProperty(navigator, 'vibrate', { value: (ms: number) => {
      (window as unknown as { vibrations: number[] }).vibrations.push(ms);
      return true;
    } });
  });
  await page.route('https://*.supabase.co/**', r => r.fulfill({ json: [] }));
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('pq-club-demo-v1')!).tournaments.find((t: { name: string }) => t.name === 'PQ Demo Open').id);
  await page.goto(`#/club-desk/${id}`);
  await page.getByRole('button', { name: 'Score', exact: true }).first().click();
  await page.getByRole('button', { name: 'Rally scoring', exact: true }).click();
  const pad = page.getByRole('button', { name: /^Point to / }).first();
  const layout = () => pad.evaluate(el => ({ width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight, page: document.documentElement.scrollWidth }));
  const before = await layout();
  expect(before.page).toBeLessThanOrEqual(320);
  expect(before.width).toBeGreaterThanOrEqual(44);
  expect(before.height).toBeGreaterThanOrEqual(44);
  await pad.click();
  expect(await page.evaluate(() => (window as unknown as { vibrations: number[] }).vibrations)).toEqual([10]);
  expect(await layout()).toEqual(before);
  await expect(pad).toHaveCSS('touch-action', 'manipulation');
  await expect(pad).toHaveCSS('user-select', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pad.click();
  expect(await page.evaluate(() => (window as unknown as { vibrations: number[] }).vibrations)).toEqual([10]);
  await expect(pad).toHaveCSS('transition-duration', '0s');
  expect(await layout()).toEqual(before);
});
