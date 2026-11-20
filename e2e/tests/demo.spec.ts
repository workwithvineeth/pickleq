import { expect, test, type Page } from '@playwright/test';

// Local demo checks must not depend on the production server's availability.
test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) return;
  await page.route('https://*.supabase.co/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith('/desk_open') ? { error: 'This desk link isn’t valid.' } : path.endsWith('/desk_label') ? null : false });
  });
});

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
  test('new tournament: the event name follows Singles/Doubles; a custom name stays', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await page.getByRole('region', { name: 'Your tournaments' }).getByRole('button', { name: 'Create tournament', exact: true }).click();
    const name = page.getByLabel('Event 1 name');
    await expect(name).toHaveValue('Open Singles');
    await page.getByRole('group', { name: 'Event 1 type' }).getByRole('button', { name: 'Doubles' }).click();
    await expect(name).toHaveValue('Open Doubles');
    await name.fill('Company Cup');
    await page.getByRole('group', { name: 'Event 1 type' }).getByRole('button', { name: 'Singles' }).click();
    await expect(name).toHaveValue('Company Cup');
  });

  test('tournament page: ready-for-the-day check first, Mark as finished last, friendly dates, fits 320 px', async ({ page }) => {
    await openDemoEvent(page);
    const check = page.getByRole('region', { name: 'Ready for the day?' });
    await expect(check).toBeVisible();
    await expect(check.getByText(/Referee links not created/)).toBeVisible();
    const run = page.getByRole('navigation', { name: 'Run the tournament' });
    await expect(run.getByRole('button').first()).toHaveText('Desk view');
    await expect(page.getByRole('region', { name: 'When it’s over' }).getByRole('button', { name: 'Mark as finished' })).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 760 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `tournament page at ${w}`).toBeLessThanOrEqual(w);
    }
    await check.getByRole('button', { name: 'Create referee links' }).click();
    await expect(page.getByRole('heading', { name: 'Referee links' })).toBeVisible();
  });

  test('referee PIN and desk access: both PINs, set my own, and the desk link opens only with the desk PIN', async ({ page }) => {
    await openDemoEvent(page);
    await page.getByRole('button', { name: 'Referee links', exact: true }).click();
    const ref = page.getByRole('region', { name: 'Referee PIN' });
    const desk = page.getByRole('region', { name: 'Desk access' });
    // PINs stay hidden until the organiser asks to see them.
    await expect(ref.getByLabel('Referee PIN hidden')).toBeVisible();
    await ref.getByRole('button', { name: 'Show referee PIN' }).click();
    await desk.getByRole('button', { name: 'Show desk PIN' }).click();
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
    await page.getByRole('tab', { name: 'Walkover or retired' }).click();
    const wo = page.getByRole('region', { name: 'Walkover or retired' });
    await wo.getByRole('button', { name: /Didn’t turn up or retired/ }).first().click();
    await wo.getByRole('button', { name: /go through$/ }).click();
    await wo.getByRole('group', { name: 'Confirm walkover' }).getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/win by walkover|the other side retired/)).toBeVisible();
    await page.getByRole('button', { name: 'Leave the desk on this phone' }).click();
    await expect(page.getByLabel('Desk PIN')).toBeVisible();
  });

  test('desk view: court board, up next, and entering a final score', async ({ page }) => {
    await openDemoEvent(page);
    await page.getByRole('button', { name: 'Desk view' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Open · Desk' })).toBeVisible();
    await page.getByRole('button', { name: /Results, walkovers and court changes/ }).click();
    for (const c of [1, 2, 3]) await expect(page.getByLabel(`Court ${c}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();
    await page.getByRole('tab', { name: 'Enter a result' }).click();
    const form = page.getByRole('region', { name: 'Final scores' });
    const inputs = form.getByRole('textbox');
    const scores = (await inputs.count()) >= 4 ? ['11', '5', '11', '6'] : ['11', '5'];
    for (const [i, v] of scores.entries()) await inputs.nth(i).fill(v);
    await form.getByRole('button', { name: 'Save result' }).click();
    await expect(page.getByText('Result saved')).toBeVisible();
  });

  test('opens an entrant’s actual pool matches from the standings', async ({ page }) => {
    await openDemoEvent(page);
    await page.getByRole('button', { name: 'Pools', exact: true }).click();
    const table = page.getByRole('table', { name: 'Pool A', exact: true });
    const entrant = table.getByRole('button').first();
    await entrant.click();
    await expect(entrant).toHaveAttribute('aria-expanded', 'true');
    await expect(table.getByText(/^vs /).first()).toBeVisible();
    await entrant.click();
    await expect(entrant).toHaveAttribute('aria-expanded', 'false');
  });

  test('entries: walk-in player, withdraw a team, and late entry refused once knockouts start', async ({ page }) => {
    await openDemoEvent(page);
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Entries' })).toBeVisible();
    await page.getByRole('button', { name: 'Open Doubles' }).click();
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    await page.getByRole('button', { name: 'New player' }).click();
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

  test('+ Add team asks for every player detail, like online entry (audit 21 Nov, K1)', async ({ page }) => {
    await openDemoEvent(page);
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    await page.getByRole('button', { name: 'Open Doubles' }).click();
    await page.getByRole('button', { name: '+ Add team' }).click();
    const form = page.getByRole('region', { name: 'Add a team' });
    for (const f of ['name', 'phone', 'email', 'DUPR rating', 'DUPR ID', 'age']) await expect(form.getByLabel(`Player 1 ${f}`)).toBeVisible();
    await expect(form.getByLabel('Team or player name')).toHaveCount(0);
    await form.getByLabel('Player 1 name').fill('Robot Late One');
    await form.getByRole('button', { name: 'Add team' }).click();
    // The same entry rules as online entry: the next missing detail is named.
    await expect(page.getByRole('alert')).toContainText(/choose a gender|enter their age|needs two players|Player 2/);
  });
});

