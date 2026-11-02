import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('organiser results: saved ratings under names, knockout scores, CSV/PDF, phone widths', async ({ page }, info) => {
  // This test never contacts production services.
  await page.route('https://*.supabase.co/**', (route) => route.fulfill({ json: [] }));
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Fixture Organiser');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();
  const id = await page.evaluate(() => {
    const key = 'pq-club-demo-v1';
    const s = JSON.parse(localStorage.getItem(key)!);
    const t = s.tournaments.find((t: { name: string }) => t.name === 'PQ Demo Open');
    const m = s.matches.find((m: { tournamentId: string; stage: string }) => m.tournamentId === t.id && m.stage === 'pool');
    s.matches.push({ ...m, id: 'fixture-final', stage: 'final', status: 'done', winner: 'A', games: [{ a: 11, b: 7, points: '' }, { a: 11, b: 9, points: '' }] });
    localStorage.setItem(key, JSON.stringify(s)); return t.id as string;
  });
  await page.goto(`#/club-results-dupr/${id}`); await page.reload();
  await expect(page.getByRole('heading', { name: 'Results and DUPR' })).toBeVisible();
  await expect(page.getByText(/11–7, 11–9/)).toBeVisible();
  await expect(page.locator('.pq-results-table .pq-result-player').first().locator('span').nth(1)).toContainText('DUPR');
  for (const colorScheme of ['light', 'dark'] as const) for (const width of [390, 320]) {
    await page.emulateMedia({ colorScheme }); await page.setViewportSize({ width, height: 760 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${colorScheme} ${width}`).toBeLessThanOrEqual(width);
  }
  const rating = page.getByLabel(/DUPR singles rating/).first(); await rating.fill('3.456');
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save DUPR details' }).click();
  await expect(page.getByText('Saved. PaddleQ can see the new DUPR details now.')).toBeVisible();
  await page.reload(); await expect(page.getByLabel(/DUPR singles rating/).first()).toHaveValue('3.456');
  for (const [label, extension] of [['Download results (CSV)', 'csv'], ['Download PDF', 'pdf']]) {
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: label, exact: true }).click();
    const download = await pending; const path = info.outputPath(`results.${extension}`); await download.saveAs(path);
    const bytes = await readFile(path);
    expect(bytes.length).toBeGreaterThan(100);
    if (extension === 'pdf') { expect(bytes.subarray(0, 5).toString()).toBe('%PDF-'); expect(bytes.toString('latin1')).toContain('DUPR'); }
    else { expect(bytes.toString()).toContain('Final'); expect(bytes.toString()).toContain('3.456'); }
  }
});

test('fresh results link offers sign-in and retains destination', async ({ page }) => {
  await page.route('https://*.supabase.co/**', (route) => route.fulfill({ json: [] }));
  await page.goto('#/club-results-dupr/34288ff7-04a9-4745-896e-ac3a156c3100');
  await page.getByRole('button', { name: 'Sign in to view results' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pq-club-return'))).toBe('#/club-results-dupr/34288ff7-04a9-4745-896e-ac3a156c3100');
});

test('new-account onboarding UI through confirmation, hosting request, admin approval and organiser dashboard (isolated transport)', async ({ page }) => {
  test.setTimeout(45_000);
  const uid = 'ab000000-0000-4000-8000-000000000001';
  const cid = 'ab000000-0000-4000-8000-000000000010';
  let created = false; let admin = false; const calls: string[] = [];
  const club = { id: cid, name: 'Fixture Club', city: 'Test City', invite_code: 'fixture', settings: {}, hosting: 'pending', is_test: false, verified: false };
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [{ id: uid, user_id: uid, provider: 'email', identity_data: { email: 'fixture@example.test' } }], created_at: new Date().toISOString() };
  const session = { access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user };
  await page.route('https://api.pwnedpasswords.com/**', (route) => route.fulfill({ body: '' }));
  await page.route('https://*.supabase.co/**', async (route) => {
    const url = new URL(route.request().url()); const path = url.pathname; calls.push(path);
    const body = route.request().postDataJSON() ?? {};
    let result: unknown = [];
    if (path.endsWith('/signup')) result = { user, session: null };
    else if (path.endsWith('/verify')) result = session;
    else if (path.endsWith('/token')) { admin = String(body.email).startsWith('admin'); result = session; }
    else if (path.endsWith('/user')) result = user;
    else if (path.endsWith('/logout')) result = {};
    else if (path.endsWith('/rpc/claim_pending')) result = {};
    else if (path.endsWith('/rpc/is_platform_admin')) result = admin;
    else if (path.endsWith('/rpc/create_club')) { created = true; result = cid; }
    else if (path.endsWith('/rpc/request_hosting')) result = { ok: true };
    else if (path.endsWith('/rpc/admin_set_club_hosting')) { club.hosting = 'approved'; result = { ok: true }; }
    else if (path.endsWith('/rpc/admin_clubs')) result = [{ ...club, owners: ['fixture@example.test'], members: 1, tournaments: 0, hosting_phone: '+91 9876543210' }];
    else if (path.endsWith('/rpc/admin_overview')) result = { weeks: [], clubs: 1 };
    else if (path.endsWith('/clubs')) result = club;
    else if (path.endsWith('/club_members')) result = created ? (url.searchParams.get('select')?.includes('clubs(') ? [{ role: 'owner', clubs: club }] : [{ user_id: uid, role: 'owner' }]) : [];
    else if (path.endsWith('/profiles')) result = [{ id: uid, display_name: 'Fixture Owner' }];
    else if (path.endsWith('/club_contacts')) result = [{ phone: '+91 9876543210', note: '' }];
    await route.fulfill({ json: result });
  });
  await page.goto('#/club-signin');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
  await page.getByLabel('Choose a password').fill('FixturePassword982');
  await page.getByLabel('Password again', { exact: true }).fill('FixturePassword982');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('6-digit code').fill('654321');
  await page.getByRole('button', { name: 'Confirm and sign in' }).click();
  await page.getByRole('button', { name: 'Create a club', exact: true }).click();
  await page.getByLabel('Club name', { exact: true }).fill('Fixture Club');
  await page.getByLabel('Your name', { exact: true }).fill('Fixture Owner');
  await page.getByLabel('Phone number', { exact: true }).fill('9876543210');
  await page.getByRole('button', { name: 'Create club and ask to host' }).click();
  await expect(page.getByRole('heading', { name: 'Fixture Club', exact: true })).toBeVisible();
  expect(calls).toContain('/rest/v1/rpc/request_hosting');
  // Switch accounts via the normal sign-in form; SQL tests separately verify authorization.
  await page.goto('#/admin-login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.test'); await page.getByLabel('Password', { exact: true }).fill('FixturePassword982');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('group', { name: 'Admin sections' }).getByRole('button', { name: 'Clubs', exact: true }).click();
  await page.getByRole('button', { name: 'Approve to host' }).click();
  await expect(page.getByText('Fixture Club can now host tournaments')).toBeVisible();
  await page.goto('#/club-signin');
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test'); await page.getByLabel('Password', { exact: true }).fill('FixturePassword982');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create a club', exact: true })).toBeVisible();
  await page.goto(`#/club-view/${cid}`);
  await expect(page.getByRole('heading', { name: 'Fixture Club', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New tournament', exact: true })).toBeVisible();
  expect(calls).toContain('/auth/v1/signup'); expect(calls).toContain('/auth/v1/verify'); expect(calls).toContain('/auth/v1/token');
});
