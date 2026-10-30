import { expect, test } from '@playwright/test';
import { canUseServer, resetSandbox, rest, rpc, TEST, wrongPin, type Sandbox } from './helpers';

// PIN sign-in on the real server: desk helpers use the tournament's helper link and the event PIN (the same PIN as
// the court scorers); organisers use email + their own PIN. Android only: the good path makes a helper account.
test.describe('PIN sign-in (helpers and organisers)', () => {
  test.skip(!canUseServer, 'Needs the real server sandbox');
  test.skip(({ browserName }) => browserName !== 'chromium', 'Runs once (makes a helper account)');
  let box: Sandbox;
  test.beforeAll(async () => { box = await resetSandbox(); });

  test('every court link shares the event PIN', async () => {
    expect(box.links.court1.pin).toMatch(/^\d{4}$/);
    expect(box.links.court2.pin).toBe(box.links.court1.pin);
    expect(box.links.lockout.pin).toBe(box.links.court1.pin);
  });

  test('a helper with a wrong PIN is refused; with the event PIN they get the tournament desk', async ({ page }) => {
    const pin = box.links.court1.pin;
    await page.goto(`#/helper/${TEST.slug}`);
    await expect(page.getByRole('heading', { name: `${TEST.club} Desk` })).toBeVisible();
    await expect(page.getByText(`Run by ${TEST.club} on PaddleQ`)).toBeVisible();
    await page.getByLabel('Your name').fill('Robot Helper');
    await page.getByLabel('Event PIN').fill(wrongPin(pin));
    await page.getByRole('button', { name: 'Sign in to the desk' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong PIN');
    await page.getByLabel('Event PIN').fill(pin);
    await page.getByRole('button', { name: 'Sign in to the desk' }).click();
    await expect(page.getByRole('heading', { name: TEST.event })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Desk view' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Referee links' })).toBeVisible();
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

  test('visitors can’t read event PINs or call the PIN checks directly', async () => {
    const pins = await rest('tournament_pins?select=pin');
    expect(pins.status === 200 ? (pins.body as unknown[]).length : 0).toBe(0);
    for (const [fn, args] of [
      ['helper_pin_check', { p_slug: TEST.slug, p_pin: box.links.court1.pin }],
      ['pin_login_check', { p_email: 'nobody@example.com', p_pin: '4826' }],
      ['helper_join', { p_tournament: '00000000-0000-0000-0000-000000000000', p_user: '00000000-0000-0000-0000-000000000000', p_name: 'x' }],
    ] as const) {
      const r = await rpc(fn, args);
      expect(r.status, fn).toBeGreaterThanOrEqual(401);
    }
  });
});
