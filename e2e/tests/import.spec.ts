import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * PaddleQ app + importing a Google Form, choosing formats with the time estimate, and making the draw (demo club on the phone).
 * The sample CSV is shaped like a Google Form export: timestamp and email columns first.
 */
const CSV = fileURLToPath(new URL('../fixtures/google-form.csv', import.meta.url));

test.describe('PaddleQ app', () => {
  test('has its own tabs, and no personal-app tabs', async ({ page }) => {
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const t of ['Events', 'My club', 'Tournaments', 'Results']) await expect(nav.getByRole('button', { name: t })).toBeVisible();
    for (const t of ['Home', 'Train', 'Stats', 'Coach']) await expect(nav.getByRole('button', { name: t })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Log a match' })).toHaveCount(0);
    // Signed out, paddleq.in opens on the sign-in page; the demo lives in the admin dashboard, not here.
    await expect(page.getByRole('heading', { name: 'Welcome to PaddleQ' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'PaddleQ logo' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Join a club' })).toBeVisible();
    await expect(page.getByText('Try the demo club')).toHaveCount(0);
    await page.goto('#/stats');
    await expect(page.getByRole('heading', { name: 'Welcome to PaddleQ' })).toBeVisible();
    await nav.getByRole('button', { name: 'Results' }).click();
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  });
});

test.describe('Google Form import to draw (demo club on the phone)', () => {
  test('imports the sheet once, flags problems, re-import adds nobody, then a knockout draw with a time estimate', async ({ page }) => {
    await page.goto('#/demo');
    await page.getByLabel('Your name in the demo').fill('Robot');
    await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
    await expect(page.getByRole('heading', { name: 'PQ Demo Club' })).toBeVisible();

    // A tournament where players register (on a Google Form), with a team-average DUPR cap for doubles.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Tournaments' }).click();
    await page.getByRole('button', { name: 'New tournament at PQ Demo Club' }).click();
    await page.getByRole('group', { name: 'How do players enter?' }).getByRole('button', { name: 'They register' }).click();
    await page.getByLabel('Tournament name').fill('Robot Form Cup');
    await page.getByLabel('City').fill('Hyderabad');
    await page.getByLabel('Venue').fill('Robot Courts');
    await page.getByLabel('Event 1 name').fill('Singles 3.5');
    await page.getByLabel('Event 1 DUPR cap').fill('3.5');
    await page.getByRole('button', { name: 'Add another event' }).click();
    await page.getByLabel('Event 2 name').fill('Doubles 3.5');
    await page.getByRole('group', { name: 'Event 2 type' }).getByRole('button', { name: 'Doubles' }).click();
    await page.getByLabel('Event 2 DUPR cap').fill('3.5');
    await page.getByRole('group', { name: 'Event 2 DUPR cap is for' }).getByRole('button', { name: 'Team average' }).click();
    await page.getByLabel('Show it on the PaddleQ events board').uncheck();
    await page.getByRole('button', { name: 'Create and open entries' }).click();
    await expect(page.getByRole('heading', { name: 'Robot Form Cup' })).toBeVisible();
    await page.getByRole('button', { name: 'Entries inbox and draw' }).click();

    await page.getByRole('button', { name: 'Import entries' }).click();
    const imp = page.getByRole('region', { name: 'Import entries' });
    await imp.getByLabel('Choose CSV file').setInputFiles(CSV);
    const preview = imp.getByRole('region', { name: 'Import preview' });
    // The sheet has no ages: the organiser confirms everyone is 18+ before importing.
    await expect(imp.getByRole('button', { name: 'Confirm the players are 18+ first' })).toBeDisabled();
    await imp.getByLabel('Every player is 18 or over (the sheet has no ages)').check();
    await expect(preview.getByText(/Row 5 .*needs a DUPR rating/)).toBeVisible();
    await expect(preview.getByText(/Row 6 .*above this event’s cap/)).toBeVisible();
    await expect(preview.getByText(/Row 7 .*no partner/)).toBeVisible();
    await expect(preview.getByText(/Row 8 .*Same person as row 2/)).toBeVisible();
    await imp.getByRole('button', { name: 'Import 5 entries' }).click();
    await expect(imp.getByRole('status')).toContainText('Imported 5 entries');
    // Importing the same sheet again (e.g. after new responses) adds nobody: the 5 imported plus the repeat of row 2.
    await expect(preview.getByText('Already entered (skipped)').locator('..').getByText('6')).toBeVisible();
    await expect(imp.getByRole('button', { name: 'Import 0 entries' })).toBeDisabled();
    await imp.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('group', { name: 'Show entries' }).getByRole('button', { name: 'Accepted' }).click();
    await expect(page.getByRole('region', { name: 'Robot Aarav' })).toBeVisible();

    // The draw: knockout only for singles, round robin for doubles, 3 courts, 15 minutes a match.
    const draw = page.getByRole('region', { name: 'Draw' });
    await draw.getByRole('group', { name: 'Draw minutes per match' }).getByRole('button', { name: '15' }).click();
    await draw.getByLabel('Draw courts').fill('3');
    const singles = draw.getByRole('region', { name: 'Format for Singles 3.5' });
    await singles.getByRole('group', { name: 'Singles 3.5 format' }).getByRole('button', { name: 'Knockout only' }).click();
    await expect(singles.getByLabel('Singles 3.5 plan')).toContainText('Knockout only · 1 bye');
    await singles.getByText('Each knockout round: games to and best of').click();
    await singles.getByLabel('Singles 3.5 Final games to').selectOption('15');
    const est = draw.getByRole('region', { name: 'Time estimate' });
    await expect(est).toContainText(/About \d+ matches · finishes around \d+:\d\d (am|pm) on 3 courts/);
    await draw.getByRole('button', { name: 'Make the draw' }).click();
    await draw.getByRole('button', { name: 'Yes, make the draw' }).click();
    await expect(page.getByText('Draw made. Pools and the schedule are ready.')).toBeVisible();
    await page.getByRole('button', { name: 'See the draw' }).click();
    await page.getByRole('group', { name: 'Tournament view' }).getByRole('button', { name: 'Knockouts' }).click();
    const ko = page.getByRole('region', { name: 'Knockouts' });
    await expect(ko.getByRole('heading', { name: 'Semi-finals' })).toBeVisible();
    await expect(ko.getByText('Bye', { exact: true })).toBeVisible();
    await expect(ko.getByText('Through (bye)')).toBeVisible();
    await page.getByRole('group', { name: 'Event' }).getByRole('button', { name: 'Doubles 3.5' }).click();
    await page.getByRole('group', { name: 'Tournament view' }).getByRole('button', { name: 'Pools' }).click();
    const table = page.getByRole('table', { name: 'Pool A' });
    for (const h of ['P', 'W', 'L', 'PF', 'PA', '+/−']) await expect(table.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
    await expect(page.getByText(/Ties are split by: 1\. most wins; 2\. head-to-head/)).toBeVisible();
  });
});
