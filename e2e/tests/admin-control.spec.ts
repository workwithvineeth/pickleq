import { expect, test, type Page } from '@playwright/test';

// RallyQ admin command centre on the demo backend: Make trusted, delete a club, delete a tournament, assign club roles.
// (Fixing a finished score as an admin is covered by p0-delivery.spec.ts: the demo user is a RallyQ admin.)
test.use({ actionTimeout: 15000 });

async function openAdmin(page: Page, section: string) {
  await page.route('https://*.supabase.co/**', (r) => r.fulfill({ json: [] }));
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.goto(`#/admin/${section}`);
}
const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

test('Make trusted, then delete a club only after typing its exact name', async ({ page }) => {
  await openAdmin(page, 'clubs');
  const club = page.getByRole('region', { name: 'PQ Demo Courtyard Club', exact: true });
  await expect(club.getByText('Not trusted yet')).toBeVisible();
  await club.getByRole('button', { name: 'Make trusted: PQ Demo Courtyard Club' }).click();
  await expect(page.getByText(/PQ Demo Courtyard Club is trusted/)).toBeVisible();
  await expect(club.getByRole('button', { name: 'Remove trust: PQ Demo Courtyard Club' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0);

  await club.getByRole('button', { name: 'Delete club: PQ Demo Courtyard Club' }).click();
  const box = club.getByRole('group', { name: 'Delete club PQ Demo Courtyard Club' });
  const go = box.getByRole('button', { name: 'Yes, delete this club' });
  await expect(go).toBeDisabled();
  await box.getByLabel('Type the club name to confirm').fill('PQ Demo Courtyard');
  await expect(go).toBeDisabled();
  await noSideScroll(page);
  await box.getByLabel('Type the club name to confirm').fill('PQ Demo Courtyard Club');
  await go.click();
  await expect(page.getByRole('region', { name: 'PQ Demo Courtyard Club', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'PQ Demo Club', exact: true })).toBeVisible();
});

test('delete a finished tournament with its exact name; it leaves the list and the audit log has it', async ({ page }) => {
  await openAdmin(page, 'tournaments');
  const t = page.getByRole('region', { name: 'PQ Demo Diwali Doubles', exact: true });
  await expect(t).toBeVisible();
  await t.getByRole('button', { name: 'Delete tournament: PQ Demo Diwali Doubles' }).click();
  const box = t.getByRole('group', { name: 'Delete tournament PQ Demo Diwali Doubles' });
  await expect(box.getByRole('button', { name: 'Yes, delete this tournament' })).toBeDisabled();
  await box.getByLabel('Type the tournament name to confirm').fill('PQ Demo Diwali Doubles');
  await noSideScroll(page);
  await box.getByRole('button', { name: 'Yes, delete this tournament' }).click();
  await expect(page.getByRole('region', { name: 'PQ Demo Diwali Doubles', exact: true })).toHaveCount(0);
  await page.goto('#/admin/audit');
  await expect(page.getByText(/PQ Demo Diwali Doubles/).first()).toBeVisible();
});

test('assign roles: add by email, change the role, remove; the last owner stays', async ({ page }) => {
  await openAdmin(page, 'clubs');
  await page.getByRole('region', { name: 'PQ Demo Club', exact: true }).getByRole('button', { name: 'People and events' }).click();
  const roles = page.getByRole('region', { name: 'Roles' });
  await expect(roles).toBeVisible();
  await roles.getByLabel('Add by email').fill('second.person@example.com');
  await roles.getByLabel('Role', { exact: true }).selectOption('coach');
  await roles.getByRole('button', { name: 'Add person' }).click();
  await expect(roles.getByText('second.person@example.com', { exact: false }).first()).toBeVisible();
  const pick = roles.getByLabel('Role for second.person');
  await expect(pick).toHaveValue('coach');
  await pick.selectOption('admin');
  await expect(roles.getByText(/is now Admin/)).toBeVisible();
  await noSideScroll(page);
  await roles.getByRole('button', { name: /^Remove second\.person/ }).click();
  await expect(roles.getByText(/was removed/)).toBeVisible();
  // The only owner can't be demoted or removed.
  const owner = roles.locator('select').first();
  await owner.selectOption('coach');
  await expect(roles.getByText(/needs an owner/)).toBeVisible();
});
