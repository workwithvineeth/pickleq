import { expect, test, type Page } from '@playwright/test';
import { canUseServer, resetSandbox, rest, rpc } from './helpers';

const EVENT = 'pqe2ereg01';

test.describe('Events board and registration (real server, no account)', () => {
  test.skip(!canUseServer, 'Needs the real server sandbox');
  test.beforeAll(async () => { await resetSandbox(); });

  test('the board lists the test event; its page shows the rules; entering asks you to sign in', async ({ page }) => {
    await page.goto('#/events/robot');
    await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
    await page.getByRole('button', { name: 'E2E Test Open' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Test Open' })).toBeVisible();
    await expect(page.getByText('Robotville')).toBeVisible();
    const men = page.getByRole('region', { name: 'Men’s Doubles 3.5' });
    await expect(men.getByText('Men · Doubles · DUPR 3.5 and under · ₹800')).toBeVisible();
    await expect(men.getByText('16 of 16 left')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Open Singles 35+' }).getByText('Singles · 35+ · ₹500')).toBeVisible();
    await men.getByRole('button', { name: 'Enter Men’s Doubles 3.5' }).click();
    await expect(page.getByRole('button', { name: 'Sign in to enter' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in to enter' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pq-club-return'))).toBe(`#/event-enter/${encodeURIComponent(`${EVENT}~e2e00000-0000-4000-8000-000000000311`)}`);
  });

  test('a link to an event opens it in the app, with preview tags for chat apps', async ({ page, request }) => {
    const res = await request.get(`e/${EVENT}/`);
    const html = await res.text();
    expect(html).toContain('og:title');
    expect(html).toContain('og:image');
    await page.goto(`e/${EVENT}/`);
    await expect(page).toHaveURL(new RegExp(`#/event/${EVENT}$`));
    await expect(page.getByRole('heading', { name: 'E2E Test Open' })).toBeVisible();
  });

  test('server rules: visitors can’t register or read entries; the test club stays off the public board', async () => {
    test.skip(test.info().project.name !== 'android', 'API checks run once');
    const reg = await rpc('register_entry', { p_division: 'e2e00000-0000-4000-8000-000000000311', p_players: [], p_payment: 'unpaid', p_payment_ref: null });
    expect(reg.status).toBeGreaterThanOrEqual(400);
    for (const fn of ['listing_queue', 'my_entries', 'is_platform_admin', 'entered_phones', 'robot_reset_events', 'robot_reset_courts']) {
      expect((await rpc(fn, fn === 'entered_phones' ? { div: 'e2e00000-0000-4000-8000-000000000311', except_reg: null } : {})).status, fn).toBeGreaterThanOrEqual(400);
    }
    for (const t of ['registrations', 'platform_admins']) {
      const r = await rest(`${t}?select=*&limit=5`);
      if (r.status === 200) expect(r.body, t).toEqual([]);
      else expect(r.status, t).toBeGreaterThanOrEqual(400);
    }
    const ins = await rest('registrations', { method: 'POST', body: JSON.stringify({ tournament_id: 'e2e00000-0000-4000-8000-000000000211', division_id: 'e2e00000-0000-4000-8000-000000000312', club_id: 'e2e00000-0000-4000-8000-000000000001', source: 'offline', players: [] }) });
    expect(ins.status).toBeGreaterThanOrEqual(400);
    const board = JSON.stringify((await rpc('public_events', { p_include_test: false })).body);
    expect(board).not.toContain('E2E Test');
    expect(JSON.stringify((await rpc('share_events')).body)).not.toContain('E2E Test');
    const ev = JSON.stringify((await rpc('public_event', { p_slug: EVENT })).body);
    expect(ev).toContain('E2E Test Open');
    for (const secret of ['phone', 'user_id', 'email', 'players', 'created_by']) expect(ev, secret).not.toContain(secret);
  });
});

async function fillPerson(page: Page, label: string, p: { name: string; phone: string; dupr: string; age: string }) {
  const box = page.getByRole('group', { name: label, exact: true });
  await box.getByLabel(`${label} name`).fill(p.name);
  await box.getByLabel(`${label} phone`).fill(p.phone);
  await box.getByLabel(`${label} DUPR rating`).fill(p.dupr);
  await box.getByLabel(`${label} age`).fill(p.age);
  await box.getByRole('group', { name: `${label} gender` }).getByRole('button', { name: 'Man', exact: true }).click();
}

test.describe('Registration to draw (demo club on the phone)', () => {
  test('a player enters; the organiser accepts and makes the draw', async ({ page }) => {
    await page.goto('#/club');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();

    await page.goto('#/events');
    await page.getByRole('button', { name: 'PQ Demo Night' }).click();
    await page.getByRole('button', { name: 'Enter Men’s Doubles 3.5' }).click();
    await fillPerson(page, 'You', { name: 'Robot Player', phone: '98111 11111', dupr: '3.42', age: '30' });
    await fillPerson(page, 'Partner', { name: 'Robot Partner', phone: '98111 11112', dupr: '3.1', age: '17' });
    await page.getByRole('button', { name: 'Send my entry' }).click();
    await expect(page.getByRole('alert')).toContainText('18 or over');
    await page.getByRole('group', { name: 'Partner', exact: true }).getByLabel('Partner age').fill('27');
    await page.getByRole('button', { name: 'Send my entry' }).click();
    await expect(page.getByText(/You’re entered in Men’s Doubles 3.5/)).toBeVisible();

    await page.goto('#/club');
    await page.getByRole('button', { name: /PQ Demo Club/ }).click();
    await page.getByRole('button', { name: /PQ Demo Night/ }).click();
    await page.getByRole('button', { name: 'Entries inbox and draw' }).click();
    const robot = page.getByRole('region', { name: 'Robot Player / Robot Partner' });
    await robot.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('Robot Player / Robot Partner: accepted')).toBeVisible();
    const draw = page.getByRole('region', { name: 'Draw' });
    await expect(draw.getByText('Men’s Doubles 3.5 · 4 teams')).toBeVisible();
    await draw.getByRole('button', { name: 'Make the draw' }).click();
    await draw.getByRole('button', { name: 'Yes, make the draw' }).click();
    await expect(page.getByText('Draw made. Pools and the schedule are ready.')).toBeVisible();
    await page.getByRole('button', { name: 'Desk view' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Night · Desk' })).toBeVisible();
    await expect(page.getByText(/0 of 6 matches played/)).toBeVisible();
  });
});
