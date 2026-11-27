import { expect, test } from '@playwright/test';

// LED wall: 4 court videos in a 2×2 grid, 16:9 each, no scroll, at any screen shape.
test('LED wall: four 16:9 courts fill the screen without scrolling', async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ body: '<title>Embed fixture</title>', contentType: 'text/html' }));
  await page.goto('#/wall?v=VztQ5w9JVlI,yE6r5EObL6c,Bj4iCpYgVPo');
  for (const [width, height] of [[1920, 1080], [1280, 640], [768, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const court of [1, 2, 3]) await expect(page.getByTitle(`Court ${court} video`)).toHaveAttribute('src', /autoplay=1&mute=1/);
    await expect(page.getByRole('region', { name: 'Court 4' })).toContainText('Court 4 · no stream yet');
    const boxes = await page.locator('.led-box').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON() as DOMRect));
    expect(boxes).toHaveLength(4);
    for (const b of boxes) {
      expect(b.width / b.height).toBeCloseTo(16 / 9, 1);
      expect(b.right).toBeLessThanOrEqual(width + 1); expect(b.bottom).toBeLessThanOrEqual(height + 1);
    }
    // A quarter takes the full width or the full height of its half.
    expect(Math.max(boxes[0].width / (width / 2), boxes[0].height / (height / 2))).toBeGreaterThan(0.97);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.getByRole('button')).toHaveCount(0);
});
