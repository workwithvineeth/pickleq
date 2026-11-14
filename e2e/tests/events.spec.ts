import { expect, test, type Page } from '@playwright/test';
import { canUseServer, resetSandbox, rest, rpc } from './helpers';

const EVENT = 'pqe2ereg01';

test.describe('Events board and registration (real server, no account)', () => {
  test.skip(!canUseServer, 'Needs the real server sandbox');
  test.beforeAll(async () => { await resetSandbox(); });

  test('the board lists the test event; its page shows the rules; entering asks you to sign in', async ({ page }) => {
    await page.goto('#/events/robot');
    await expect(page.getByRole('heading', { name: 'Find your next main event.' })).toBeVisible();
    await page.getByRole('button', { name: 'E2E Test Open' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Test Open' })).toBeVisible();
    await page.getByRole('tab', { name: 'Info', exact: true }).click();
    await expect(page.getByText(/Robotville/)).toBeVisible();
    await page.getByRole('tab', { name: 'Entries', exact: true }).click();
    await expect(page.getByRole('cell', { name: "Men's Doubles 3.5", exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Open Singles 35+', exact: true })).toBeVisible();
    // The entry fee is shown on the page (₹800 doubles, ₹500 singles).
    await expect(page.getByText('From ₹500 per entry')).toBeVisible();
    // Category rules remain in the public data contract; the prototype uses one entry CTA.
    const event = (await rpc('public_event', { p_slug: EVENT })).body as {divisions: {name:string;kind:string;fee:number;cap:number;max_dupr:number;min_age:number;taken:number}[]};
    expect(event.divisions.find(d=>d.name==="Men's Doubles 3.5")).toMatchObject({kind:'doubles',fee:800,cap:16,max_dupr:3.5,taken:0});
    expect(event.divisions.find(d=>d.name==='Open Singles 35+')).toMatchObject({kind:'singles',fee:500,min_age:35});
    await page.getByRole('button', { name: 'Enter the event', exact: true }).click();
    // RallyQ entry: pick the category card (its name carries the rules line), then Continue.
    await page.getByRole('group', { name: 'Event categories' }).getByRole('button', { name: /^Men's Doubles 3\.5/ }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in to enter' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in to enter' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pq-club-return') ?? '{}').h)).toBe(`#/event-enter/${encodeURIComponent(`${EVENT}~e2e00000-0000-4000-8000-000000000311`)}`);
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
    // Posters really render (not a broken picture). They load lazily, so bring the first one on screen
    // (on a 390 px iPhone it now sits below the fold, and WebKit doesn't load off-screen lazy images).
    await page.getByRole('img', { name: 'Poster for PQ Demo Night' }).first().scrollIntoViewIfNeeded();
    await expect.poll(()=>page.getByRole('img', { name: 'Poster for PQ Demo Night' }).first().evaluate((img: HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'PQ Demo Ladder Cup', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'PQ Demo Diwali Doubles results' }).click();
    await expect(page.getByRole('table', { name: 'Pool A' })).toBeVisible();
    await page.goto('#/admin-listings');
    await expect(page.getByRole('heading', { name: 'Tournament approvals' })).toBeVisible();
    const ladder = page.getByRole('region', { name: 'PQ Demo Ladder Cup approval' });
    await ladder.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('PQ Demo Ladder Cup is approved. PQ Demo New Club can now make the draw and share links.')).toBeVisible();
    await page.goto('#/events');
    await expect(page.getByRole('button', { name: 'PQ Demo Ladder Cup', exact: true }).getByRole('img', { name: 'Poster for PQ Demo Ladder Cup' })).toBeVisible();
  });
});

test.describe('Registration to draw (demo club on the phone)', () => {
  test('a player enters; the organiser accepts and makes the draw', async ({ page }) => {
    // This is the on-phone demo; staging deliberately has the same sample slug.
    await page.route('https://*.supabase.co/**', route=>route.fulfill({json:null}));
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();

    await page.goto('#/events');
    await page.getByRole('button', { name: 'PQ Demo Night' }).click();
    await page.getByRole('button', { name: 'Enter the event', exact: true }).click();
    await page.getByRole('group', { name: 'Event categories' }).getByRole('button', { name: /^Men’s Doubles 3\.5/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await fillPerson(page, 'You', { name: 'Robot Player', phone: '98111 11111', dupr: '3.42', age: '30' });
    await fillPerson(page, 'Partner', { name: 'Robot Partner', phone: '98111 11112', dupr: '3.1', age: '17' });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText('18 or over');
    await page.getByRole('group', { name: 'Partner', exact: true }).getByLabel('Partner age').fill('27');
    // Emails are optional, but a typo is caught before sending.
    await page.getByRole('group', { name: 'Partner', exact: true }).getByLabel('Partner email').fill('robot.partner@');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText('Robot Partner: check the email address');
    await page.getByRole('group', { name: 'Partner', exact: true }).getByLabel('Partner email').fill('robot.partner@example.test');
    // The partner's details need the partner's OK first.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText('Tick the box to confirm your partner agrees');
    await page.getByRole('checkbox', { name: /My partner agrees/ }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Pay the club.' })).toBeVisible();
    await page.getByRole('button', { name: 'Send my entry' }).click();
    await expect(page.getByText(/Your request for Men’s Doubles 3.5 has been sent/)).toBeVisible();

    await page.goto('#/club');
    await page.getByRole('region', { name: 'Your clubs' }).getByRole('button', { name: /PQ Demo Club/ }).click();
    await page.getByRole('button', { name: /PQ Demo Night/ }).click();
    await page.getByRole('button', { name: /^Entries( and draw)?$/ }).click();
    // One Entries screen: one "+ Add" with every way of adding entries.
    await expect(page.getByRole('heading', { name: 'Entries & UPI', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    const modes = page.getByRole('group', { name: 'What are you adding?' });
    await expect(modes.getByRole('button', { name: 'Person or team' })).toBeVisible();
    await expect(modes.getByRole('button', { name: 'Import a sheet' })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    const robot = page.getByRole('row', { name: 'Robot Player / Robot Partner' });
    await robot.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('Robot Player / Robot Partner: accepted')).toBeVisible();
    const draw = page.getByRole('region', { name: 'Draw' });
    await expect(draw.getByText('Men’s Doubles 3.5 · 4 teams')).toBeVisible();
    await draw.getByRole('button', { name: 'Make the draw' }).click();
    await draw.getByRole('button', { name: 'Yes, make the draw' }).click();
    await expect(page.getByText('Draw made. Pools and the schedule are ready.')).toBeVisible();
    await page.getByRole('button', { name: 'Desk view' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Night · Desk' })).toBeVisible();
    await expect(page.getByText('Played', { exact: true }).locator('..').getByText('0', { exact: true })).toBeVisible();
    await expect(page.getByText('of 6 matches', { exact: true })).toBeVisible();
  });
});

test.describe('RallyQ admin dashboard (demo club on the phone)', () => {
  test('overview, clubs, reopening a tournament and the last-admin rule; fits a small phone', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();
    await page.goto('#/events');
    await page.getByRole('button', { name: /tournaments to approve/ }).click();
    await expect(page.getByRole('heading', { name: 'Tournament approvals' })).toBeVisible();
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
    for (const s of ['Overview', 'Approvals', 'Clubs', 'Events', 'Testimonials', 'Admins', 'Desk access']) {
      await page.getByRole('group', { name: 'Admin sections' }).getByRole('button', { name: s, exact: true }).click();
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(wide, s).toBeLessThanOrEqual(320);
    }
  });
});

test.describe('Create freely, go live with approval (demo club on the phone)', () => {
  test('a new club sets up a tournament and submits it; the admin rejects with a reason, then approves; trust switch; fits a small phone', async ({ page }) => {
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
    await page.getByRole('button', { name: 'Create club' }).click();
    await page.getByRole('region',{name:'Your tournaments'}).getByRole('button', { name: 'Create tournament',exact:true }).click();
    await expect(page.getByRole('group', { name: 'How do players enter?' }).getByRole('button', { name: 'I add the players' })).toHaveCount(0);
    await page.getByLabel('Tournament name').fill('Robot Yard Open');
    await page.getByLabel('City').fill('Pune');
    await page.getByLabel('Venue').fill('Yard Courts');
    await page.getByLabel('Your UPI ID').fill('yard@bank');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('heading', { name: 'Robot Yard Open' })).toBeVisible();
    const card = page.getByRole('region', { name: 'RallyQ approval' });
    await expect(card).toContainText('Submit at least 24 hours before your event.');
    await expect(page.getByRole('button', { name: 'Referee links' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Desk view' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await card.getByLabel('Expected players').fill('20');
    await card.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByRole('region', { name: 'RallyQ approval' })).toContainText('Waiting for RallyQ');
    const tournamentUrl = page.url();

    await page.goto('#/admin/approvals');
    const req = page.getByRole('region', { name: 'Robot Yard Open approval' });
    await expect(req).toContainText('yard@bank');
    await expect(req).toContainText('about 20 expected');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await req.getByRole('button', { name: 'Reject…' }).click();
    await req.getByLabel('Reason for rejecting').fill('Add the start time');
    await req.getByRole('button', { name: 'Reject with this reason' }).click();
    await expect(page.getByText('Robot Yard Open: the club was told why')).toBeVisible();

    await page.goto(tournamentUrl);
    const back = page.getByRole('region', { name: 'RallyQ approval' });
    await expect(back).toContainText('RallyQ’s note: Add the start time');
    await back.getByRole('button', { name: 'Submit again' }).click();
    await expect(page.getByRole('region', { name: 'RallyQ approval' })).toContainText('Waiting for RallyQ');

    await page.goto('#/admin/approvals');
    await page.getByRole('region', { name: 'Robot Yard Open approval' }).getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Robot Yard Open is approved/)).toBeVisible();
    await page.goto(tournamentUrl);
    await expect(page.getByRole('button', { name: 'Referee links', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'RallyQ approval' })).toHaveCount(0);

    await page.goto('#/admin/clubs');
    await page.getByRole('button', { name: 'Make trusted: Robot Smash Yard' }).click();
    await expect(page.getByText(/Robot Smash Yard is trusted: its tournaments skip approval/)).toBeVisible();
    await page.getByRole('button', { name: 'Remove trust: Robot Smash Yard' }).click();
    await expect(page.getByText(/Robot Smash Yard is no longer trusted/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('Club testimonials (demo club on the phone)', () => {
  test('the club shares one (tick box required), the admin approves and features it, the club withdraws; fits a small phone', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 640 });
    await page.getByText('Rate RallyQ', { exact: true }).click();
    const card = page.getByRole('region', { name: 'Share your experience' });
    await card.getByRole('button', { name: '5 stars' }).click();
    await card.getByLabel('Your words').fill('Our referees picked it up in five minutes. Players loved the live results.');
    await card.getByLabel('Your name').fill('Robot Owner');
    await card.getByLabel('Role').fill('Owner, PQ Demo Club');
    await card.getByRole('button', { name: 'Send to RallyQ' }).click();
    await expect(card.getByRole('status')).toContainText('Tick the box');
    await card.getByLabel('RallyQ may use this on its website and social media').check();
    await card.getByRole('button', { name: 'Send to RallyQ' }).click();
    await expect(card.getByText('Thank you! RallyQ will check it soon.')).toBeVisible();
    await expect(card.getByRole('region', { name: 'Testimonial from Robot Owner' })).toContainText('Pending');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const clubUrl = page.url();

    await page.goto('#/admin/testimonials');
    const t = page.getByRole('region', { name: 'Testimonial from PQ Demo Club' });
    await expect(t).toContainText('Our referees picked it up');
    await expect(t).not.toContainText('@');
    await t.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible();
    await page.getByRole('region', { name: 'Testimonial from PQ Demo Club' }).getByRole('button', { name: '☆ Feature' }).click();
    await expect(page.getByRole('region', { name: 'Testimonial from PQ Demo Club' })).toContainText('★ Featured');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    await page.goto(clubUrl);
    await page.getByText('Rate RallyQ', { exact: true }).click();
    const mine = page.getByRole('region', { name: 'Testimonial from Robot Owner' });
    await expect(mine).toContainText('Approved · ★ Featured');
    await mine.getByRole('button', { name: 'Withdraw' }).click();
    await mine.getByRole('button', { name: 'Yes, withdraw it' }).click();
    await expect(page.getByText('Withdrawn. RallyQ won’t use it.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Testimonial from Robot Owner' })).toHaveCount(0);
  });
});

test.describe('Sign-in pages (no account needed)', () => {
  test('password sign-in, create account and admin pages fit a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('#/club-signin');
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    await page.getByRole('tab', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Start on RallyQ.' })).toBeVisible();
    await page.getByLabel('Email').fill('robot@example.com');
    await page.getByLabel('Choose a password').fill('short');
    await page.getByLabel('Password again').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toHaveText('Use at least 8 characters');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.goto('#/admin-login');
    await expect(page.getByRole('heading', { name: 'RallyQ admin' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('the demo is for RallyQ admins: a visitor opening #/demo is told so', async ({ page }) => {
    await page.route('https://*.supabase.co/**', route=>route.fulfill({json:null}));
    await page.goto('#/events');
    await page.evaluate(() => localStorage.removeItem('pq-demo-robot'));
    await page.goto('#/demo');
    await expect(page.getByText('The demo club is for RallyQ admins.')).toBeVisible();
    await expect(page.getByLabel('Your name in the demo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('no "works offline" popup covers the sign-in form', async ({ page }) => {
    await page.goto('#/club-signin');
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    await expect(page.getByText(/now works offline/)).toHaveCount(0);
    await expect(page.locator('.toast:not(.toast-inline)')).toHaveCount(0);
  });
});

test.describe('Club logos and the new demo events (demo club on the phone)', () => {
  test('a Bengaluru event shows its RallyQ photo hero and host logo; the club profile keeps its change button', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await page.getByRole('group', { name: 'Club sections' }).getByRole('button', { name: 'Club profile' }).click();
    const hero = page.getByRole('region', { name: 'PQ Demo Club club' });
    await expect(hero.getByRole('img', { name: 'PQ Demo Club logo' })).toBeVisible();
    await expect(hero.getByRole('button', { name: 'Change logo' })).toBeVisible();
    await page.goto('#/event/pq-demo-smash');
    await expect(page.getByRole('heading', { name: 'PQ Demo Smash Fest' })).toBeVisible();
    await expect(page.locator('.rallyq-screen-event .photo')).toBeVisible();
    await expect(page.getByText('Hosted by', { exact: true })).toBeVisible();
    await expect(page.getByText('PQ Demo Riverside Club', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('img', { name: 'PQ Demo Riverside Club logo' })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('Admin home in the demo (demo club on the phone)', () => {
  test('admins see Clubs: a demo tour, tournaments waiting, and every club with its logo', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await page.goto('#/club');
    await expect(page.getByRole('heading', { name: 'Clubs', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Demo tour' })).toBeVisible();
    await expect(page.getByRole('button', { name: /3 tournaments waiting for your approval/ })).toBeVisible();
    const all = page.getByRole('region', { name: 'All clubs on RallyQ' });
    await expect(all.getByRole('img', { name: 'PQ Demo Courtyard Club logo' })).toBeVisible();
    await expect(all.getByRole('button', { name: /PQ Demo Club/ }).first()).toContainText(/trusted/i);
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByRole('region', { name: 'Demo tour' }).getByRole('button', { name: /A club submits a tournament/ }).click();
    await expect(page.getByRole('region', { name: 'PQ Demo Courtyard Doubles Night approval' })).toBeVisible();
  });
});

test.describe('My matches on the results link (demo club on the phone)', () => {
  test('a player types their name and sees their next match with court and time; fits a small phone', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await page.goto('#/results/pq-demo-central-s8');
    const mine = page.getByRole('region', { name: 'My matches' });
    await mine.getByLabel('Your name').fill('zzzq');
    await expect(mine).toContainText('No matches for');
    const first = (await page.getByRole('table').first().getByRole('row').nth(1).getByRole('cell').nth(1).innerText()).split('\n')[0].split(' / ')[0].trim();
    await mine.getByLabel('Your name').fill(first);
    await expect(mine.getByText(/^vs /).first()).toBeVisible();
    await expect(mine).not.toContainText('No matches for');
    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
