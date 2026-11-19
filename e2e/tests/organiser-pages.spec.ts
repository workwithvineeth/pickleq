import { expect, test, type Page } from '@playwright/test';

/** S1: every signed-in organiser page wears the new RallyQ look (organiser menu, no old side rail or yellow strip), on a phone and on a desktop. */
async function openDemo(page: Page) {
  await page.route('https://*.supabase.co/**', (r) => r.fulfill({ json: [] }));
  await page.goto('#/demo');
  await page.getByLabel('Your name in the demo').fill('Alex');
  await page.getByRole('button', { name: 'Open PQ Demo Club' }).click();
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  return page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('pq-club-demo-v1') ?? '{}') as { tournaments: { id: string; name: string; clubId: string }[] };
    const t = d.tournaments.find((x) => x.name === 'PQ Demo Open')!;
    return { t: t.id, c: t.clubId };
  });
}

test('club-tournaments and club-results use the new look, no old frame', async ({ page }) => {
  test.setTimeout(120000);
  await openDemo(page);
  for (const [route, title] of [['club-tournaments', 'Tournaments'], ['club-results', 'Results']] as const) {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`#/${route}`);
      await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
      await expect(page.locator('.rq-v12')).toHaveCount(1);
      await expect(page.locator('.app.pq-brand')).toHaveCount(0);
      await expect(page.locator('.pq-account')).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: 'Organiser menu' })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
});

test('every organiser route is in the new look at 390 and 1280', async ({ page }) => {
  test.setTimeout(180000);
  const { t, c } = await openDemo(page);
  const routes = ['club', `club-view/${c}`, 'club-tournaments', `club-tournament/${t}`, `club-tournament-new/${c}`, `club-inbox/${t}`, `club-entries/${t}`, `club-desk/${t}`, `club-scorers/${t}`, 'club-results', `club-results-dupr/${t}`, `club-dupr/${t}`, 'club-claim/x', 'club-new', 'club-join/ABC123'];
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const r of routes) {
      await page.goto(`#/${r}`);
      await expect(page.locator('h1').first(), r).toBeVisible();
      await expect(page.locator('.rq-v12'), r).toHaveCount(1);
      await expect(page.locator('.app.pq-brand'), r).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${r} at ${width}`).toBeLessThanOrEqual(width);
    }
  }
});

test('public pages lead with the RallyQ logo, with no fake club tiles', async ({ page }) => {
  await page.route('https://*.supabase.co/**', (r) => r.fulfill({ json: [] }));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('#/events');
  await expect(page.getByRole('heading', { name: 'Find your next main event.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'RallyQ home' })).toBeVisible();
  await expect(page.locator('.hdr .host')).toHaveCount(0);
  await expect(page.getByText('Hyderabad’s clubs')).toHaveCount(0);
  await expect(page.locator('.hdr .tile')).toHaveCount(0);
});

test('create tournament: scoring defaults (side-out or rally, golden point or win by 2, games to 11/15/21)', async ({ page }) => {
  test.setTimeout(120000);
  const { c } = await openDemo(page);
  await page.goto(`#/club-tournament-new/${c}`);
  await page.getByRole('button', { name: 'Players request entry' }).click();
  const group = page.getByRole('group', { name: 'Event 1 scoring defaults' });
  await expect(group).toBeVisible();
  await group.getByRole('button', { name: 'Rally' }).click();
  await group.getByRole('button', { name: 'Win by 2' }).click();
  await group.getByRole('button', { name: '21', exact: true }).click();
  await expect(group.getByRole('button', { name: 'Rally' })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: 'Win by 2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: '21', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Tournament name').fill('Scoring Defaults Cup');
  await page.getByLabel('City').fill('Hyderabad');
  await page.getByLabel('Venue').fill('Test Courts');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('heading', { name: 'Scoring Defaults Cup' })).toBeVisible();
  const saved = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('pq-club-demo-v1') ?? '{}') as { tournaments: { id: string; name: string }[]; divisions: { tournamentId: string; format: { scoring?: string; golden?: boolean; pointsTo: number } }[] };
    const t = d.tournaments.find((x) => x.name === 'Scoring Defaults Cup')!;
    return d.divisions.find((x) => x.tournamentId === t.id)?.format;
  });
  expect(saved).toMatchObject({ scoring: 'rally', golden: false, pointsTo: 21 });
});

test('club overview: no "View public page"; it points to the event on the Events board', async ({ page }) => {
  const { c } = await openDemo(page);
  await page.goto(`#/club-view/${c}`);
  await expect(page.getByRole('heading', { name: 'PQ Demo Club', exact: true })).toBeVisible();
  await expect(page.getByText('View public page')).toHaveCount(0);
  const link = page.getByRole('link', { name: /Find it on the Events board/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /#\/events/);
});
