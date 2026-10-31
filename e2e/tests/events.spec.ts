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
    const men = page.getByRole('region', { name: "Men's Doubles 3.5" });
    await expect(men.getByText('Men · Doubles · DUPR 3.5 and under · ₹800')).toBeVisible();
    await expect(men.getByText('16 of 16 left')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Open Singles 35+' }).getByText('Singles · 35+ · ₹500')).toBeVisible();
    await men.getByRole('button', { name: "Enter Men's Doubles 3.5" }).click();
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
    // Posters: anyone can view them, but visitors can't upload.
    const { SUPABASE_URL, SUPABASE_KEY } = await import('./helpers');
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/posters/robot/robot.jpg`, { method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'image/jpeg' }, body: new Uint8Array([255, 216, 255]) });
    expect(up.status).toBeGreaterThanOrEqual(400);
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

test.describe('Board with posters (demo club on the phone)', () => {
  test('posters on the board, recent results open, and approving a listing puts it and its poster on the board', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();
    await page.goto('#/events');
    for (const name of ['PQ Demo Night', 'PQ Demo Sunday Social', 'PQ Demo Women’s Open']) {
      await expect(page.getByRole('button', { name, exact: true }).getByRole('img', { name: `Poster for ${name}` })).toBeVisible();
    }
    // Posters really render (not a broken picture).
    const w = await page.getByRole('img', { name: 'Poster for PQ Demo Night' }).first().evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(w).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'PQ Demo Ladder Cup', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'PQ Demo Diwali Doubles results' }).click();
    await expect(page.getByRole('table', { name: 'Pool A' })).toBeVisible();
    await page.goto('#/admin-listings');
    const ladder = page.getByRole('region', { name: 'PQ Demo Ladder Cup' });
    await expect(ladder.getByRole('img', { name: 'Poster for PQ Demo Ladder Cup' })).toBeVisible();
    await ladder.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('PQ Demo Ladder Cup is on the board. PQ Demo New Club is now verified.')).toBeVisible();
    await page.goto('#/events');
    await expect(page.getByRole('button', { name: 'PQ Demo Ladder Cup', exact: true }).getByRole('img', { name: 'Poster for PQ Demo Ladder Cup' })).toBeVisible();
  });
});

test.describe('Registration to draw (demo club on the phone)', () => {
  test('a player enters; the organiser accepts and makes the draw', async ({ page }) => {
    await page.goto('#/demo');
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
    await page.getByRole('region', { name: 'Your clubs' }).getByRole('button', { name: /PQ Demo Club/ }).click();
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

test.describe('PaddleQ admin dashboard (demo club on the phone)', () => {
  test('overview, clubs, reopening a tournament and the last-admin rule; fits a small phone', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();
    await page.goto('#/events');
    await page.getByRole('button', { name: /listings to review/ }).click();
    await page.getByRole('group', { name: 'Admin sections' }).getByRole('button', { name: 'Listings' }).click();
    await expect(page.getByRole('heading', { name: 'Review listings' })).toBeVisible();
    const sections = page.getByRole('group', { name: 'Admin sections' });

    await sections.getByRole('button', { name: 'Overview' }).click();
    await expect(page.getByRole('region', { name: 'Matches scored this week' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Matches scored per week' }).getByRole('listitem')).toHaveCount(8);

    await sections.getByRole('button', { name: 'Clubs' }).click();
    const demo = page.getByRole('region', { name: 'PQ Demo Club' });
    await expect(demo).toContainText('Owner: demo (on this phone)');
    await demo.getByRole('button', { name: 'People and events' }).click();
    await expect(page.getByRole('region', { name: 'Tournaments' })).toContainText('PQ Demo Open');
    await page.getByRole('button', { name: 'Back' }).click();

    await page.getByRole('group', { name: 'Admin sections' }).getByRole('button', { name: 'Events' }).click();
    const diwali = page.getByRole('region', { name: 'PQ Demo Diwali Doubles' });
    await diwali.getByRole('button', { name: 'Reopen' }).click();
    await diwali.getByRole('button', { name: 'Yes, reopen it' }).click();
    await expect(page.getByText('PQ Demo Diwali Doubles is live again')).toBeVisible();
    await diwali.getByRole('button', { name: 'Mark finished' }).click();
    await diwali.getByRole('button', { name: 'Yes, mark it finished' }).click();
    await expect(page.getByText('PQ Demo Diwali Doubles is finished')).toBeVisible();

    await page.getByRole('group', { name: 'Admin sections' }).getByRole('button', { name: 'Admins' }).click();
    await page.getByRole('button', { name: 'Remove demo (on this phone)' }).click();
    await page.getByRole('button', { name: 'Yes, remove' }).click();
    await expect(page.getByText('You can’t remove the last admin')).toBeVisible();

    // Nothing wider than a 320 px phone.
    await page.setViewportSize({ width: 320, height: 640 });
    for (const s of ['Overview', 'Clubs', 'Events', 'Listings', 'Admins', 'Desk team']) {
      await page.getByRole('group', { name: 'Admin sections' }).getByRole('button', { name: s, exact: true }).click();
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(wide, s).toBeLessThanOrEqual(320);
    }
  });
});

test.describe('New clubs wait for PaddleQ approval (demo club on the phone)', () => {
  test('a new club asks to host, can’t post until approved, then can; fits a small phone', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('#/club-new');
    await page.getByLabel('Club name').fill('Robot Smash Yard');
    await page.getByLabel('Your name').fill('Robot');
    await expect(page.getByLabel('Country code')).toHaveValue('+91');
    await page.getByLabel('Phone number').fill('98765 43210');
    await expect(page.getByLabel('Phone number')).toHaveValue('9876543210');
    await page.getByLabel('About your club').fill('Two courts');
    await page.getByRole('button', { name: 'Create club and ask to host' }).click();
    const card = page.getByRole('region', { name: 'Hosting tournaments' });
    await expect(card).toContainText(/waiting for paddleq/i);
    await expect(page.getByRole('button', { name: 'New tournament' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    await page.goto('#/events');
    await page.getByRole('button', { name: /2 clubs to approve/ }).click();
    const req = page.getByRole('region', { name: 'Robot Smash Yard' });
    await expect(req).toContainText('Wants to host');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await req.getByRole('button', { name: 'Approve to host' }).click();
    await expect(page.getByText('Robot Smash Yard can now host tournaments')).toBeVisible();
    await req.getByRole('button', { name: 'People and events' }).click();
    await expect(page.getByRole('heading', { name: 'Robot Smash Yard' })).toBeVisible();
  });
});

test.describe('Sign-in pages (no account needed)', () => {
  test('password sign-in, create account and admin pages fit a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('#/club-signin');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('button', { name: /Create an account/ }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByLabel('Email').fill('robot@example.com');
    await page.getByLabel('Choose a password').fill('short');
    await page.getByLabel('Password again').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toHaveText('Use at least 8 characters');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.goto('#/admin-login');
    await expect(page.getByRole('heading', { name: 'PaddleQ admin' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('Club logos and the new demo events (demo club on the phone)', () => {
  test('a Bengaluru event shows its poster and organiser logo; the club page shows the logo big, with a change button', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    const hero = page.getByRole('region', { name: 'PQ Demo Club club' });
    await expect(hero.getByRole('img', { name: 'PQ Demo Club logo' })).toBeVisible();
    await expect(hero.getByRole('button', { name: 'Change logo' })).toBeVisible();
    await page.goto('#/event/pq-demo-smash');
    await expect(page.getByRole('heading', { name: 'PQ Demo Smash Fest' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Poster for PQ Demo Smash Fest' })).toBeVisible();
    const org = page.getByRole('region', { name: 'Organised by' });
    await expect(org).toContainText('PQ Demo Riverside Club');
    await expect(org.getByRole('img', { name: 'PQ Demo Riverside Club logo' })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('Admin home in the demo (demo club on the phone)', () => {
  test('admins see Clubs: a demo tour, a club waiting, and every club with its logo', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await page.goto('#/club');
    await expect(page.getByRole('heading', { name: 'Clubs', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Clubs' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Demo tour' })).toBeVisible();
    await expect(page.getByRole('button', { name: /1 club waiting for your approval/ })).toBeVisible();
    const all = page.getByRole('region', { name: 'All clubs on PaddleQ' });
    await expect(all.getByRole('img', { name: 'PQ Demo Courtyard Club logo' })).toBeVisible();
    await expect(all.getByRole('button', { name: /PQ Demo Courtyard Club/ })).toContainText(/wants to host/i);
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByRole('region', { name: 'Demo tour' }).getByRole('button', { name: /A new club asks to host/ }).click();
    await expect(page.getByRole('region', { name: 'PQ Demo Courtyard Club' }).getByRole('img', { name: 'PQ Demo Courtyard Club logo' })).toBeVisible();
  });
});
