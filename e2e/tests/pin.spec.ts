import { expect, test } from '@playwright/test';
import { canUseServer, resetSandbox, rest, rpc, TEST, wrongPin, type Sandbox } from './helpers';

// Referees and the desk have separate access on the real server (club_mode_18): court links use the referee PIN; the desk has its
// own link and desk PIN (no account) that opens only its tournament. Organisers sign in with email + password.
test.describe('Referee PIN and desk access (real server)', () => {
  test.skip(!canUseServer, 'Needs the real server sandbox');
  let box: Sandbox;
  test.beforeAll(async () => { box = await resetSandbox(); });

  test('every court link shares the referee PIN; the desk PIN is different', async () => {
    expect(box.links.court1.pin).toMatch(/^\d{4}$/);
    expect(box.links.court2.pin).toBe(box.links.court1.pin);
    expect(box.links.lockout.pin).toBe(box.links.court1.pin);
    expect(box.desk.pin).toMatch(/^\d{6}$/);
    expect(box.desk.pin).not.toBe(box.links.court1.pin);
  });

  test('the desk link refuses the referee PIN and opens the desk with the desk PIN', async ({ page }) => {
    await page.goto(`#/desk/${box.desk.token}`);
    await expect(page.getByRole('heading', { name: `${TEST.club} Desk` })).toBeVisible();
    await expect(page.getByText(TEST.event)).toBeVisible();
    await page.getByLabel('Desk PIN').fill(box.links.court1.pin);
    await page.getByRole('button', { name: 'Open the desk' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong desk PIN');
    await page.getByLabel('Desk PIN').fill(box.desk.pin);
    await page.getByRole('button', { name: 'Open the desk' }).click();
    await expect(page.getByRole('heading', { name: `${TEST.event} · Desk` })).toBeVisible();
    await expect(page.getByLabel('Court 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Referee links' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Entries' }).click();
    await expect(page.getByRole('heading', { name: 'Entries' })).toBeVisible();
    await expect(page.getByText('Asha Test')).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide).toBeLessThanOrEqual(page.viewportSize()?.width ?? 420);
  });

  test('the desk API: names and scores only, its own tournament only, and the referee PIN never opens it', async () => {
    const wrong = await rpc('desk_open', { p_token: box.desk.token, p_pin: box.links.court1.pin });
    expect((wrong.body as { error?: string }).error).toBe('Wrong desk PIN');
    const r = await rpc('desk_open', { p_token: box.desk.token, p_pin: box.desk.pin });
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.body);
    expect(text).toContain(TEST.event);
    expect(text).not.toMatch(/phone|email|user_id|invite_code|claim_code|hosting|contact|upi|updated_by|"pin"/);
    // A court link doesn't open with the desk PIN.
    const court = await rpc('scorer_open', { p_token: box.links.court1.token, p_pin: box.desk.pin });
    expect((court.body as { error?: string }).error).toBe('Wrong PIN');
    // A match id that isn't in the desk's tournament is refused.
    const other = await rpc('desk_save_score', { p_token: box.desk.token, p_pin: box.desk.pin, p_match: '00000000-0000-4000-8000-000000000000', p_games: [], p_status: 'live', p_winner: null, p_played_on: null });
    expect((other.body as { error?: string }).error).toMatch(/isn.t in your tournament/);
  });

  test('the old desk sign-in link explains the new desk link and makes no account', async ({ page }) => {
    await page.goto(`#/helper/${TEST.slug}`);
    await expect(page.getByText('The desk now has its own link and its own desk PIN.')).toBeVisible();
  });

  test('an organiser with a wrong email or password is refused with a clear message', async ({ page }) => {
    await page.goto('#/club-signin');
    await page.getByLabel('Email').fill('nobody-robot@example.com');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/That email and password don.t match/);
    await expect(page.getByRole('button', { name: /Create an account/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  });

  test('the admin sign-in page refuses a wrong password and offers no sign-up', async ({ page }) => {
    await page.goto('#/admin-login');
    await expect(page.getByRole('heading', { name: 'PaddleQ admin' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create an account/ })).toHaveCount(0);
    await page.getByLabel('Email').fill('nobody-robot@example.com');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/That email and password don.t match/);
  });

  test('visitors can’t read PINs or desk links, or call the PIN checks and organiser functions', async () => {
    for (const table of ['tournament_pins?select=pin', 'tournament_desks?select=pin,token', 'registrations?select=players']) {
      const r = await rest(table);
      expect(r.status === 200 ? (r.body as unknown[]).length : 0, table).toBe(0);
    }
    for (const [fn, args] of [
      ['helper_pin_check', { p_slug: TEST.slug, p_pin: box.links.court1.pin }],
      ['pin_login_check', { p_email: 'nobody@example.com', p_pin: '4826' }],
      ['helper_join', { p_tournament: '00000000-0000-0000-0000-000000000000', p_user: '00000000-0000-0000-0000-000000000000', p_name: 'x' }],
      ['desk_check', { p_token: box.desk.token, p_pin: box.desk.pin }],
      ['tournament_access', { p_tournament: '00000000-0000-0000-0000-000000000000' }],
      ['set_desk_pin', { p_tournament: '00000000-0000-0000-0000-000000000000', p_pin: '602817' }],
    ] as const) {
      const r = await rpc(fn, args);
      expect(r.status, fn).toBeGreaterThanOrEqual(401);
    }
  });

  test('five wrong desk PINs lock the desk link (last test: it stays locked until the next reset)', async () => {
    for (let i = 0; i < 5; i++) await rpc('desk_open', { p_token: box.desk.token, p_pin: wrongPin(box.desk.pin) === '0000' ? '000000' : '111111' });
    const r = await rpc('desk_open', { p_token: box.desk.token, p_pin: box.desk.pin });
    expect((r.body as { error?: string }).error).toMatch(/Too many wrong PINs/);
  });
});
