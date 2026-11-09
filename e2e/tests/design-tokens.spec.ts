import { expect, test } from '@playwright/test';

test('T1 fonts, targets, phone glass and screenshot evidence', async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    localStorage.setItem('pq-theme','auto');
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  });
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  for (const colorScheme of ['light', 'dark'] as const) for (const width of [320, 390, 870, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme, reducedMotion: 'no-preference' });
    await page.goto('./'); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: test.info().outputPath(`T1-landing-${width}-${colorScheme}.png`), fullPage: true });
    await page.goto('#/demo'); await page.getByLabel('Your name in the demo').fill('Alex');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const element of await page.locator('.pq-mini-btn:visible, .pq-ws-signout:visible, .pq-ws-item:visible, .chip:is(button,a):visible, .seg button:visible, .link-btn:visible').all()) expect(await element.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const styles = await page.evaluate(() => {
      const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:-10000px;top:0';
      probe.innerHTML = '<div class="score-tap"><b class="big">11</b></div><div class="score-box"><b class="big">11</b></div><div class="kpi"><b class="v">11</b></div><b class="pq-kpi-value">11</b><b class="pq-big-number">11</b><div class="pq-tile-stat"><b>11</b></div><div class="stepper"><div class="val"><b>11</b></div></div><div class="pq-glass">Glass</div>';
      document.body.append(probe);
      const numbers = [...probe.querySelectorAll('b')].map(el => { const s = getComputedStyle(el); return { font:s.fontFamily, weight:s.fontWeight, stretch:s.fontStretch, nums:s.fontVariantNumeric }; });
      const blur = getComputedStyle(probe.querySelector('.pq-glass')!).backdropFilter;
      const effects = document.documentElement.dataset.pqEffects;
      probe.remove(); return { numbers, blur, effects };
    });
    expect(styles.effects).toBeUndefined(); expect(styles.blur).toContain('blur(26px)');
    for (const number of styles.numbers) { expect(number.font).toContain('Archivo'); expect(number.weight).toBe('800'); expect(number.stretch).toBe('68%'); expect(number.nums).toContain('tabular-nums'); }
    await page.screenshot({ path: test.info().outputPath(`T1-club-${width}-${colorScheme}.png`), fullPage: true });
    await page.getByRole('button', { name: /PQ Demo Open/ }).first().click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Open', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: test.info().outputPath(`T1-tournament-${width}-${colorScheme}.png`), fullPage: true });
  }
});

test('T1 low-memory devices explicitly use plain glass', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 }));
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-pq-effects', 'off');
});
