import { expect, test } from '@playwright/test';
import { canUseServer, openCourt, resetSandbox, rpc, tap, wrongPin, type Sandbox } from './helpers';

test.describe('Court scorer link (no account)', () => {
  test.skip(!canUseServer, 'Needs the real server sandbox');
  let box: Sandbox;
  test.beforeAll(async () => { box = await resetSandbox(); });

  test('a wrong PIN is refused; the right PIN shows only this court', async ({ page }) => {
    const { token, pin } = box.links.court1;
    await page.goto(`#/court/${token}`);
    await page.getByLabel('PIN').fill(wrongPin(pin));
    await page.getByRole('button', { name: 'Start scoring' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong PIN');
    await page.getByLabel('PIN').fill(pin);
    await page.getByRole('button', { name: 'Start scoring' }).click();
    await expect(page.getByRole('heading', { name: 'Court 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: /against/ })).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Asha Test against Meera Test/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ravi Test against Kiran Test/ })).toHaveCount(0);
    await expect(page.getByLabel('Finished')).toContainText('10–11');
  });

  test('scores point by point to a golden point; the comeback is spotted and saved to the server', async ({ page }) => {
    const { token, pin } = box.links.court1;
    await openCourt(page, token, pin);
    await page.getByRole('button', { name: /Asha Test against Meera Test/ }).click();
    await expect(page.getByText(/golden point at 10–10/).first()).toBeVisible();
    await tap(page, 'Asha Test', 'Meera Test', 'AAABAAAAB'); // 7–2
    await tap(page, 'Asha Test', 'Meera Test', 'BBBBBBBB'); // 7–10
    await tap(page, 'Asha Test', 'Meera Test', 'AAA'); // 10–10
    await expect(page.getByText('Golden point · next point wins')).toBeVisible();
    await tap(page, 'Asha Test', 'Meera Test', 'B'); // 10–11
    await expect(page.getByText(/Meera Test came back from \d+–\d+/)).toBeVisible();
    await page.getByRole('button', { name: 'Save result' }).click();
    await expect(page.getByLabel('Finished')).toContainText('10–11');
    await expect(page.getByLabel('Finished').getByText('Meera Test')).toHaveCount(2);

    const view = (await rpc('scorer_open', { p_token: token, p_pin: pin })).body as { matches: { id: string; status: string; winner: string; games: { a: number; b: number; points: string }[] }[] };
    const saved = view.matches.find((m) => m.id.endsWith('503'));
    expect(saved?.status).toBe('done');
    expect(saved?.winner).toBe('B');
    expect(saved?.games[0]).toMatchObject({ a: 10, b: 11, points: 'AAABAAAABBBBBBBBBAAAB' });
  });

  test('with no signal, points are kept on the phone and sent when it comes back', async ({ page, context }) => {
    const { token, pin } = box.links.court1;
    await openCourt(page, token, pin);
    await page.getByRole('button', { name: /Asha Test against Kiran Test/ }).click();
    await tap(page, 'Asha Test', 'Kiran Test', 'AA');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await context.setOffline(true);
    await tap(page, 'Asha Test', 'Kiran Test', 'ABA');
    await expect(page.getByText('Not sent yet · retrying')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 30_000 });
    const view = (await rpc('scorer_open', { p_token: token, p_pin: pin })).body as { matches: { id: string; status: string; games: { points: string }[] }[] };
    const m = view.matches.find((x) => x.id.endsWith('505'));
    expect(m?.status).toBe('live');
    expect(m?.games[0].points).toBe('AAABA');
  });
});
