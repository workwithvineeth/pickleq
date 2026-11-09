import { expect, test } from '@playwright/test';
import { assertContrast } from './contrast';
test.use({ actionTimeout: 15000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pq-skin","maroon");
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  });
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
});
async function demo(page: import('@playwright/test').Page) {
  await page.goto('#/demo'); await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  await expect(page.getByRole('banner', { name: 'Where you are' }).locator('strong')).toHaveText('PQ Demo Club');
}

test('shell matrix: themes, scroll strip, WCAG contrast and twenty screenshots', async ({ page }) => {
  // Twenty full-page renders need a separate Windows WebKit budget; interactions still use 15 seconds.
  test.setTimeout(600_000);
  const cspErrors: string[] = [];
  page.on('console', msg => { if (/Refused to execute inline script|Content Security Policy.*script/.test(msg.text())) cspErrors.push(msg.text()); });
  await demo(page);
  for (const width of [320, 390, 870, 1100, 1440]) for (const mode of ['Auto-light', 'Auto-dark', 'Light', 'Dark'] as const) {
    const device = mode === 'Auto-dark' || mode === 'Light' ? 'dark' : 'light';
    const choice = mode.startsWith('Auto') ? 'auto' : mode.toLowerCase();
    const expected = mode === 'Auto-dark' || mode === 'Dark' ? 'rgb(18, 7, 9)' : 'rgb(243, 235, 221)';
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: device, reducedMotion: 'no-preference' });
    const header = page.getByRole('banner', { name: 'Where you are' });
    if(width<600)await header.locator('.pq-account-menu').evaluate(el=>el.setAttribute('open',''));
    if (width < 870) { await header.locator('.pq-theme-settings').evaluate(el => el.setAttribute('open', '')); }
    await header.getByRole('button', { name: choice === 'auto' ? 'Auto' : mode, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', choice);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(expected);
    expect(await page.locator('meta[name="theme-color"]').first().getAttribute('content')).toBe(expected === 'rgb(18, 7, 9)' ? '#120709' : '#F3EBDD');
    await assertContrast(header.locator('.pq-theme-switch button:visible'));
    await assertContrast(header.locator('.pq-theme-switch button[aria-pressed="true"]:visible'), 'border');
    if (width < 870) await header.locator('.pq-theme-settings').evaluate(el => el.removeAttribute('open'));
    const rail = page.getByRole('navigation', { name: 'Club / Organiser menu' });
    await expect(rail).toBeVisible({ visible: width >= 870 });
    if(width<600)await header.getByLabel('Account menu').click();
    if (width >= 870) {
      expect(await rail.evaluate(el => el.getBoundingClientRect().width)).toBe(width < 1100 ? 88 : 248);
      await assertContrast(rail.locator('.pq-ws-item:not(:disabled):visible, .pq-ws-glabel:visible, .pq-ws-brand b:visible'));
      await assertContrast(rail.locator('[aria-current="page"]'), 'border');
    } else {
      const strip = page.getByRole('navigation', { name: 'Club / Organiser sections' });
      const metrics = await strip.evaluate(el => ({ overflow: getComputedStyle(el).overflowX, contain: getComputedStyle(el).getPropertyValue('overscroll-behavior-x'), supportsContain: CSS.supports('overscroll-behavior-x','contain'), width: el.clientWidth, scroll: el.scrollWidth }));
      expect(metrics.overflow).toBe('auto'); if(metrics.supportsContain)expect(metrics.contain).toBe('contain'); expect(metrics.scroll).toBeGreaterThan(metrics.width);
      const last = strip.getByRole('button', { name: 'Day-of guide' });
      await last.focus(); expect(await strip.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      expect(await last.evaluate(el => ({ whiteSpace: getComputedStyle(el).whiteSpace, clipped: el.scrollWidth > el.clientWidth + 1 }))).toEqual({ whiteSpace: 'nowrap', clipped: false });
      await page.keyboard.press('Enter'); await expect(page).toHaveURL(/\.guide/); await expect(page.getByRole('heading', { name: 'Match day, step by step' })).toBeVisible();
      await strip.getByRole('button', { name: 'Overview', exact: true }).click();
      await strip.evaluate(el => { el.scrollLeft = 0; });
      await assertContrast(strip.locator('[aria-current="page"]'));
      await assertContrast(page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button'));
    }
    await assertContrast(header.locator('.pq-ws-identity strong, .pq-ws-product, .pq-ws-crumb, .pq-shell-live:visible'));
    const live = header.locator('.pq-shell-live');
    if (await live.count()) { await expect(live).toContainText(/court.*live/i); await assertContrast(live.locator('.pq-live-dot'), 'signal'); }
    await assertContrast(page.locator('.pill:visible, .badge:visible, .pq-tag:visible'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth), width + ' ' + mode).toBeLessThanOrEqual(width);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ timeout: 60_000, animations: 'disabled', path: test.info().outputPath('T14-' + width + '-' + mode + '.png'), fullPage: true });
  }
  expect(cspErrors).toEqual([]);
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('rail, switch and visible focus follow keyboard order', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 }); await demo(page);
  const rail = page.getByRole('navigation', { name: 'Club / Organiser menu' });
  await rail.getByRole('button', { name: 'Overview', exact: true }).focus(); await page.keyboard.press('Tab');
  await expect(rail.getByRole('button', { name: 'My tournaments', exact: true })).toBeFocused();
  await rail.getByRole('button', { name: 'Events board', exact: true }).focus(); await page.keyboard.press('Tab');
  const header = page.getByRole('banner', { name: 'Where you are' });
  if (await header.locator('.pq-shell-live:focus').count()) await page.keyboard.press('Tab');
  const auto = header.getByRole('button', { name: 'Auto', exact: true }); await expect(auto).toBeFocused(); await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); const light = header.getByRole('button', { name: 'Light', exact: true }); await expect(light).toBeFocused();
  expect(await light.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none'); await assertContrast(light, 'outline');
  await page.keyboard.press('Enter'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Tab'); const dark = header.getByRole('button', { name: 'Dark', exact: true }); await expect(dark).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('saved theme runs before app JavaScript and obeys CSP', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('pq-theme', 'dark'));
  await page.route('**/assets/*.js', route => route.abort());
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(18, 7, 9)');
});

test('live chip uses public demo courts, has readable labels and opens existing results', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 }); await demo(page);
  const count = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('pq-club-demo-v1')!);
    const event = data.tournaments.find((t: { publicSlug: string }) => t.publicSlug === 'pq-demo-open');
    const match = data.matches.find((m: { tournamentId: string; court?: number; status: string }) => m.tournamentId === event.id && m.court && m.status !== 'void');
    match.status = 'live'; match.games = [{ a: 3, b: 2, points: '' }];
    localStorage.setItem('pq-club-demo-v1', JSON.stringify(data));
    return new Set(data.matches.filter((m: { tournamentId: string; court?: number; status: string }) => m.tournamentId === event.id && m.court && m.status === 'live').map((m: { court: number }) => m.court)).size;
  });
  await page.reload();
  const header = page.getByRole('banner', { name: 'Where you are' }), live = header.locator('.pq-shell-live');
  await expect(live).toHaveText(count + (count === 1 ? ' court live' : ' courts live'));
  for (const choice of ['Light', 'Dark']) {
    await header.getByRole('button', { name: choice, exact: true }).click();
    await assertContrast(live); await assertContrast(live, 'border'); await assertContrast(live.locator('.pq-live-dot'), 'signal');
    await page.screenshot({ timeout: 60_000, animations: 'disabled', path: test.info().outputPath('T14-live-' + choice + '.png'), fullPage: true });
  }
  await live.click(); await expect(page).toHaveURL(/results\/pq-demo-open/);
  await expect(page.getByRole('heading', { name: 'PQ Demo Open', exact: true })).toBeVisible();
  await expect(page.locator('[data-score-announcement]')).toHaveAttribute('aria-live', 'polite');
});

test('phone Settings and its theme choices work with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); await demo(page);
  await page.getByLabel('Account menu').click();
  const settings = page.getByRole('banner', { name: 'Where you are' }).locator('.pq-theme-settings');
  await settings.locator('summary').focus(); await page.keyboard.press('Enter'); await expect(settings).toHaveAttribute('open', '');
  await page.keyboard.press('Tab'); await expect(settings.getByRole('button', { name: 'Auto', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(settings.getByRole('button', { name: 'Light', exact: true })).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await assertContrast(settings.getByRole('button', { name: 'Light', exact: true }), 'outline');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
