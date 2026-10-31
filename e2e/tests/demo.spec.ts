import { expect, test, type Page } from '@playwright/test';

/** The demo club runs on the phone, so this checks the organiser screens (desk and entries) without an account. */
async function openDemoEvent(page: Page) {
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Robot');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();
  await page.getByRole('button', { name: /PQ Demo Open/ }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Open' })).toBeVisible();
}

test.describe('Organiser screens (demo club)', () => {
  test('referee PIN and desk access: both PINs, set my own, and the desk link opens only with the desk PIN', async ({ page }) => {
    await openDemoEvent(page);
    await page.getByRole('button', { name: 'Referee links' }).click();
    const ref = page.getByRole('region', { name: 'Referee PIN' });
    const desk = page.getByRole('region', { name: 'Desk access' });
    await expect(ref.getByLabel(/^Referee PIN \d{4}$/)).toBeVisible();
    await expect(desk.getByLabel(/^Desk PIN \d{6}$/)).toBeVisible();
    await ref.getByRole('button', { name: 'Set my own' }).click();
    await ref.getByLabel('Your referee PIN').fill('1234');
    await ref.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('too easy to guess');
    await ref.getByLabel('Your referee PIN').fill('4826');
    await ref.getByRole('button', { name: 'Save' }).click();
    await expect(ref.getByLabel('Referee PIN 4826')).toBeVisible();
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 760 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `Referee links at ${w}`).toBeLessThanOrEqual(w);
    }
    const { token, pin } = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('pq-club-demo-v1') ?? '{}');
      const t = s.tournaments.find((x: { name: string }) => x.name === 'PQ Demo Open');
      return s.desks[t.id] as { token: string; pin: string };
    });
    await page.goto(`#/desk/${token}`);
    await expect(page.getByRole('heading', { name: 'PQ Demo Club Desk' })).toBeVisible();
    await page.getByLabel('Desk PIN').fill('4826');
    await page.getByRole('button', { name: 'Open the desk' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong desk PIN');
    await page.getByLabel('Desk PIN').fill(pin);
    await page.getByRole('button', { name: 'Open the desk' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Open · Desk' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Referee links' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'desk at 320').toBeLessThanOrEqual(320);
    await page.getByRole('button', { name: 'Walkover…' }).first().click();
    await page.getByRole('region', { name: 'Walkover or retired' }).getByRole('button', { name: /go through$/ }).first().click();
    await expect(page.getByText(/win by walkover|the other side retired/)).toBeVisible();
    await page.getByRole('button', { name: 'Leave the desk on this phone' }).click();
    await expect(page.getByLabel('Desk PIN')).toBeVisible();
  });

  test('desk view: court board, up next, and entering a final score', async ({ page }) => {
    await openDemoEvent(page);
    await page.getByRole('button', { name: 'Desk view' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Open · Desk' })).toBeVisible();
    for (const c of [1, 2, 3]) await expect(page.getByLabel(`Court ${c}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Up next' })).toBeVisible();
    await page.getByRole('button', { name: 'Enter result' }).first().click();
    const form = page.getByRole('region', { name: 'Final scores' });
    const inputs = form.getByRole('textbox');
    const scores = (await inputs.count()) >= 4 ? ['11', '5', '11', '6'] : ['11', '5'];
    for (const [i, v] of scores.entries()) await inputs.nth(i).fill(v);
    await form.getByRole('button', { name: 'Save result' }).click();
    await expect(page.getByText('Result saved')).toBeVisible();
  });

  test('entries: walk-in player, withdraw a team, and late entry refused once knockouts start', async ({ page }) => {
    await openDemoEvent(page);
    await page.getByRole('button', { name: 'Entries' }).click();
    await expect(page.getByRole('heading', { name: 'Entries' })).toBeVisible();
    await page.getByRole('button', { name: 'Open Doubles' }).click();
    await page.getByLabel('Walk-in player name').fill('Robot Walkin');
    await page.getByLabel('Walk-in player DUPR').fill('3.5');
    await page.getByRole('button', { name: 'Add player' }).click();
    await expect(page.getByText('Robot Walkin added to the club')).toBeVisible();

    await page.getByRole('button', { name: 'Change' }).first().click();
    await page.getByRole('button', { name: 'Withdraw…' }).click();
    await page.getByRole('button', { name: 'Yes, withdraw' }).click();
    await expect(page.getByText(/withdrawn\. \d+ match/)).toBeVisible();
    await expect(page.getByText('Withdrawn', { exact: true }).first()).toBeVisible();

    const pick = page.getByLabel('Late entry player');
    const value = await pick.locator('option', { hasText: 'Robot Walkin' }).getAttribute('value');
    await pick.selectOption(value ?? '');
    await page.getByLabel('Late entry partner').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Add to the event' }).click();
    await expect(page.getByText('Knockouts have started, so new entries can’t join')).toBeVisible();
  });
});
