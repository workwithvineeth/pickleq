import { expect, test } from '@playwright/test';

// DPDP: every public page links the privacy notice; the notice names the grievance contact and leads to the data controls.
test.describe('Privacy notice (no account)', () => {
  test('the footer opens the notice, which says who to complain to and where to manage data', async ({ page }) => {
    await page.goto('#/events');
    await expect(page.getByRole('heading', { name: 'Find your next main event.' })).toBeVisible();
    await page.getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your data on RallyQ.' })).toBeVisible();
    for (const name of ['What we collect and why', 'Who sees it', 'How long we keep it', 'Your rights', 'Complaints']) {
      await expect(page.getByRole('region', { name })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'hello@rallyq.in' })).toHaveAttribute('href', 'mailto:hello@rallyq.in');
    await expect(page.getByRole('button', { name: 'Manage my data' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
