import { expect, test, type Page } from '@playwright/test';
import { SUPABASE_URL } from './helpers';

/**
 * Private Player Studio, Log a session. The server is stubbed in the browser (no account, nothing written): we sign in with a
 * made-up local session and answer the few calls the Studio makes, then check what the form sends.
 */
const OWNER = '11111111-1111-4111-8111-111111111111';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: OWNER, role: 'authenticated', exp: 4102444800 })}.sig`;

async function stubbedStudio(page: Page) {
  const saved: Record<string, unknown>[] = [];
  const host = new URL(SUPABASE_URL).host;
  const session = { access_token: jwt, refresh_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: OWNER, aud: 'authenticated', role: 'authenticated', email: 'player@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
  await page.addInitScript((s) => { try { localStorage.setItem('pq-club-auth', JSON.stringify(s)); localStorage.setItem('pq-club-mode', 'server'); } catch { /* ignore */ } }, session);
  await page.route(`**://${host}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() === 'POST' && url.pathname.endsWith('/practice_sessions')) { saved.push(req.postDataJSON() as Record<string, unknown>); return json({ id: 'robot-1' }, 201); }
    if (url.pathname.includes('/rpc/')) return json([]);
    if (url.pathname.includes('/rest/v1/')) return json([]);
    return json({});
  });
  return saved;
}

test.describe('Player Studio, Log a session (stubbed server)', () => {
  test('real shot tags, opponent and strength, game by game, no "How did it feel?", Drill and Training merged', async ({ page }) => {
    const saved = await stubbedStudio(page);
    await page.goto('#/club-player-studio/log');
    await expect(page.getByText('Log a session', { exact: true })).toBeVisible();
    await expect(page.getByText('How did it feel?')).toHaveCount(0);
    for (const tag of ['Backhand drive', 'Forehand drive', 'Third-shot drop']) await expect(page.getByRole('button', { name: tag, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drill or training' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drill', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Training', exact: true })).toHaveCount(0);
    // No sideways scroll on a phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await page.getByLabel('Opponent name').fill('Ravi');
    await page.getByRole('button', { name: 'Stronger than me' }).click();
    await expect(page.getByRole('button', { name: 'Stronger than me' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Game 1: your points').fill('11');
    await page.getByLabel('Game 1: opponent points').fill('7');
    await page.getByRole('button', { name: 'Add another game' }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add a point for you in game 2' }).click();
    await expect(page.getByLabel('Game 2: your points')).toHaveValue('3');
    for (let i = 0; i < 11; i++) await page.getByRole('button', { name: 'Add a point for the opponent in game 2' }).click();
    await page.getByRole('button', { name: 'Backhand drive', exact: true }).click();
    await page.getByRole('button', { name: 'Save to diary' }).click();
    await expect(page.getByRole('button', { name: 'Saved to diary ✓' })).toBeVisible();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: 'practice_match', score_text: '11–7, 3–11', focus_tags: ['Backhand drive'], opponents: 'Ravi (stronger)', player: OWNER });
    expect(saved[0].feel).toBeNull();
  });

  test('quick result and a drill', async ({ page }) => {
    const saved = await stubbedStudio(page);
    await page.goto('#/club-player-studio/log');
    await page.getByRole('button', { name: 'Quick result' }).click();
    await page.getByRole('button', { name: 'Save to diary' }).click();
    await expect(page.getByRole('alert')).toContainText('Choose Won or Lost.');
    await page.getByRole('button', { name: 'Lost', exact: true }).click();
    await page.getByLabel('Opponent DUPR rating').fill('3.85');
    await page.getByLabel('Score, optional').fill('Lost 11–7');
    await page.getByRole('button', { name: 'Save to diary' }).click();
    await expect(page.getByRole('alert')).toContainText('reads as a win');
    expect(saved).toHaveLength(0);
    await page.getByLabel('Score, optional').fill('11–11');
    await page.getByRole('button', { name: 'Save to diary' }).click();
    await expect(page.getByRole('alert')).toContainText('cannot end level');
    expect(saved).toHaveLength(0);
    await page.getByLabel('Score, optional').fill('');
    await page.getByRole('button', { name: 'Save to diary' }).click();
    await expect(page.getByRole('button', { name: 'Saved to diary ✓' })).toBeVisible();
    expect(saved[0]).toMatchObject({ kind: 'practice_match', score_text: 'Lost', opponents: 'Opponent (DUPR 3.85)' });
    await page.getByRole('button', { name: 'Drill or training' }).click();
    await page.getByLabel('Minutes').fill('45');
    await page.getByRole('button', { name: 'Third-shot drop', exact: true }).click();
    await page.getByRole('button', { name: 'Save to diary' }).click();
    await expect.poll(() => saved.length).toBe(2);
    expect(saved[1]).toMatchObject({ kind: 'training', minutes: 45, focus_tags: ['Third-shot drop'] });
  });
});

test('Player Studio fits phone and desktop widths, with readable inputs and usable targets', async ({ page }) => {
  await stubbedStudio(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('#/club-player-studio/log');
  for (const theme of ['light', 'dark']) for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate((value) => localStorage.setItem('pq-theme', value), theme);
    await page.reload();
    await expect(page.getByText('Log a session', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${theme} at ${width}px`).toBeLessThanOrEqual(width);
    const portrait = page.locator('section.photo.ph-woman');
    await expect(portrait.getByText('Illustration', { exact: true })).toBeVisible();
    expect(await portrait.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('meera.jpg');
    expect(await portrait.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    for (const button of await page.locator('.rallyq-screen-mystudio button:visible').all()) {
      expect(await button.evaluate(el => el.getBoundingClientRect().height), await button.textContent()).toBeGreaterThanOrEqual(44);
    }
    for (const input of await page.locator('.rallyq-screen-mystudio input:visible').all()) {
      expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    }
  }
});
