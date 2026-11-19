import { expect, test } from '@playwright/test';

// Audit 19 Nov: a visitor who isn't signed in never sees signed-in pieces (club avatar, Sign out, "Signed in · …").
test('signed-out visitors see the public shell on Tournaments, Results and a missing player profile', async ({ page }) => {
  for (const hash of ['#/club-tournaments', '#/club-results', '#/public-player/not-a-player']) {
    await page.goto(hash);
    await expect(page.getByRole('link', { name: 'RallyQ home' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign out' })).toHaveCount(0);
    await expect(page.getByText(/Signed in ·/)).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Organiser menu' })).toHaveCount(0);
  }
});
