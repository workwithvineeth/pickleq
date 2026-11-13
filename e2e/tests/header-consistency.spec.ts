import { expect, test } from '@playwright/test';

// The ☰ menu button must sit in the same place on every public page, and the desktop link row must stay hidden on phones.
const PAGES = ['#/', '#/events', '#/live', '#/results', '#/club-signin', '#/club-player-studio'];

test.describe('Public header is the same on every page (phone)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const hash of PAGES) {
    test(`header on ${hash}`, async ({ page }) => {
      await page.goto(hash);
      const menu = page.getByRole('button', { name: 'Menu', exact: true }).first();
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      expect(box, 'menu button has a box').not.toBeNull();
      expect(box!.y, 'menu button sits in the top bar').toBeLessThan(40);
      expect(box!.x + box!.width, 'menu button sits at the right edge').toBeGreaterThan(375 - 40);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      await expect(page.locator('header nav.nav')).toBeHidden();
    });
  }
});
