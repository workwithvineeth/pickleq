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
