import { expect, test, type Page } from '@playwright/test';

// Design pass step 1: phones never zoom into text boxes, every button answers a tap, and reduced motion is respected.
const fontSizes = (page: Page) => page.locator('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]), select, textarea').evaluateAll((els) =>
  els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => parseFloat(getComputedStyle(e).fontSize)));

test.describe('Design baseline on phones', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('text boxes on sign-in are at least 16 px, so iPhones do not zoom in', async ({ page }) => {
    await page.goto('#/club-signin');
    await expect(page.getByLabel('Email').first()).toBeVisible();
    const sizes = await fontSizes(page);
    expect(sizes.length).toBeGreaterThan(1);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
  });

  test('buttons carry the shared press feedback and motion tokens', async ({ page }) => {
    await page.goto('#/club-signin');
    const btn = page.getByRole('button', { name: 'Sign in', exact: true }).last();
    await expect(btn).toBeVisible();
    const t = await btn.evaluate((e) => ({ prop: getComputedStyle(e).transitionProperty, touch: getComputedStyle(e).touchAction, ease: getComputedStyle(document.documentElement).getPropertyValue('--rq-ease').trim() }));
    expect(t.ease).toContain('cubic-bezier');
    expect(t.prop).toMatch(/transform|all/);
    expect(t.touch).toBe('manipulation');
  });

  test('reduced motion keeps transitions short and drops movement', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto((process.env.PQ_BASE ?? '') + '#/events');
    await expect(page.getByRole('heading', { name: 'Find your next main event.' })).toBeVisible();
    const durations = await page.locator('.btn, .tab').evaluateAll((els) => els.slice(0, 10).map((e) => getComputedStyle(e).transitionDuration.split(',').map((d) => parseFloat(d))));
    expect(durations.length).toBeGreaterThan(0);
    for (const list of durations) for (const d of list) expect(d).toBeLessThanOrEqual(0.15);
    // Hold a button down: with reduced motion it must not shrink.
    const btn = page.locator('.btn').first();
    const box = (await btn.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await btn.evaluate((e) => getComputedStyle(e).transform)).toBe('none');
    await page.mouse.up();
    await ctx.close();
  });
});

test.describe('Sign-in on phones', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the form comes before the slogan panel', async ({ page }) => {
    await page.goto('#/club-signin');
    const form = await page.getByRole('region', { name: 'Account' }).boundingBox();
    const intro = await page.getByRole('region', { name: 'For clubs and players' }).boundingBox();
    expect(form && intro && form.y < intro.y).toBe(true);
    expect(form!.y).toBeLessThan(300);
  });
});
