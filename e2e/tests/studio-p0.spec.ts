import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const OWNER = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const mockPhoto = 'rallyq/photos/desktop/player-competitor.jpg';
const names = [
  { id: PLAYER, name: 'Aster Sample' }, { id: 'p2', name: 'Cedar Sample' },
  { id: 'p3', name: 'Rowan Sample' }, { id: 'p4', name: 'Juniper Sample' },
];
const history = [{
  id: 'doubles-1', tournament_id: 'sample-open', tournament: 'Cedar Night Open',
  club: 'Cedar Paddle Club', division: 'Open doubles', kind: 'doubles', stage: 'final',
  played_on: '2026-11-20', format: { pointsTo: 11, bestOf: 1, scoring: 'rally' },
  games: [{ a: 11, b: 8, points: 'AAABBBBBBBAAAAABAAA' }],
  winner: 'A', my_side: 'A', me: PLAYER, side_a: names.slice(0, 2), side_b: names.slice(2),
}, {
  id: 'singles-1', tournament_id: 'sample-open', tournament: 'Cedar Night Open',
  club: 'Cedar Paddle Club', division: 'Open singles', kind: 'singles', stage: 'sf',
  played_on: '2026-11-20', format: { pointsTo: 11, bestOf: 1, scoring: 'rally' },
  games: [{ a: 2, b: 11, points: 'BABBABBBBBBBB' }],
  winner: 'B', my_side: 'A', me: PLAYER, side_a: [names[0]], side_b: [names[2]],
}];
const player = { player_id: PLAYER, name: names[0].name, club: 'Cedar Paddle Club', city: 'Hyderabad', claimed_at: '2026-10-01', dupr_doubles: 4.62, dupr_singles: 4.18 };

async function studioFixture(page: Page, baseURL: string) {
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: OWNER, role: 'authenticated', exp: 4102444800 })}.sig`;
  const session = {
    access_token: token, refresh_token: 'sample', expires_at: 4102444800, token_type: 'bearer',
    user: { id: OWNER, aud: 'authenticated', email: 'studio@example.test', app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(value => {
    localStorage.setItem('pq-club-auth', JSON.stringify(value));
    localStorage.setItem('pq-club-mode', 'server');
  }, session);
  await page.routeWebSocket('**/realtime/v1/websocket*', route => route.close());
  const practice: Record<string, unknown>[] = [];
  const goals: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname.split('/').at(-1);
    const reply = (json: unknown) => route.fulfill({ json });
    if (path === 'rallyq_public_player') return reply({ ...player, official: history, shared: {}, cover_path: 'sample/cover.jpg' });
    if (path === 'studio_my_players') return reply([player]);
    if (path === 'studio_official_history') return reply(history);
    if (path === 'player_studio_ratings') return reply([{ id: 'rating-1', kind: 'doubles', value: 4.41, rated_on: '2026-09-01' }]);
    if (path === 'player_studio_settings' || path === 'profile_sharing') return reply(null);
    if (path === 'practice_sessions' || path === 'player_goals') {
      const rows = path === 'practice_sessions' ? practice : goals;
      if (req.method() === 'POST') {
        const row = { ...req.postDataJSON(), id: `sample-${rows.length + 1}` };
        rows.unshift(row);
        return reply(row);
      }
      return reply(rows);
    }
    return reply([]);
  });
  await page.route('**/storage/v1/object/sign/player-photos/**', route => route.fulfill({ json: { signedURL: '/object/sign/player-photos/sample/cover.jpg' } }));
  await page.route(/\/storage\/v1\/object\/(?:public\/player-public-covers|sign\/player-photos)\/sample\/cover\.jpg/, async route => {
    if (route.request().method() === 'POST') return route.fallback();
    const photo = await page.request.get(new URL(mockPhoto, baseURL).href);
    await route.fulfill({ response: photo, headers: { ...photo.headers(), 'access-control-allow-origin': '*' } });
  });
}

test('Studio covers, latest official event and a private practice match', async ({ page, baseURL }, info) => {
  await studioFixture(page, baseURL!);
  const screenshots = process.env.PQ_STUDIO_SCREENSHOTS;
  await page.goto(`#/public-player/${PLAYER}`);
  const cover = page.getByRole('region', { name: 'Athlete cover', exact: true });
  await expect(cover.getByRole('heading', { name: 'Aster Sample' })).toBeVisible();
  await expect(cover).toContainText('3–7 → 11–8');
  await expect(cover).toContainText('1 of 1');
  await expect(cover).toContainText('Champion');
  const record = page.getByRole('region', { name: 'Record', exact: true });
  await expect(cover.getByText('Official wins', { exact: true })).toBeVisible();
  await expect(page.getByText('Best run', { exact: true })).toHaveCount(1);
  await expect(record.getByText('Best run', { exact: true })).toBeVisible();
  await expect(record.getByText('Doubles win rate', { exact: true }).locator('..')).toContainText('100%');
  await expect(record).toContainText('Last 1');
  await record.getByRole('button', { name: 'Singles', exact: true }).click();
  await expect(record).toContainText('4.18');
  await expect(record.getByText('Singles win rate', { exact: true }).locator('..')).toContainText('0%');
  await record.getByRole('button', { name: 'Doubles', exact: true }).click();

  if (screenshots && info.project.name === 'android') {
    await page.locator('img[src*="cover.jpg"]').first().evaluate((image: HTMLImageElement) => image.decode());
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 925 : 900 });
      await page.screenshot({ path: `${screenshots}/public-${width}.jpg`, quality: 87, scale: 'css', animations: 'disabled' });
    }
  }
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.goto('#/club-player-studio');
  const privateCover = page.getByRole('region', { name: 'Private Athlete cover', exact: true });
  const story = page.getByRole('region', { name: 'Your latest event', exact: true });
  await expect(privateCover).toContainText('+0.21 since first rating');
  await expect(privateCover.getByText(/Official win rate \(all formats\)/)).toContainText('50%');
  const account = page.getByRole('navigation', { name: 'Studio account' });
  await expect(account.getByRole('link', { name: 'My clubs', exact: true })).toBeVisible();
  await expect(account.getByRole('link', { name: 'View my public profile', exact: true })).toBeVisible();
  await expect(account.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const targets = await account.locator('a, button').evaluateAll(items => items.map(item => {
      const target = item.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(item);
      return { height: target.height, width: target.width, textTop: text.getBoundingClientRect().top };
    }));
    for (const target of targets) {
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.textTop).toBeCloseTo(targets[0].textTop, 0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(story).toContainText('Cedar Night Open');
  await expect(story).toContainText('1 win · 1 loss');
  await expect(story.getByLabel('Best match DNA')).toBeVisible();
  await expect(story.getByRole('progressbar')).toHaveAttribute('value', '1');
  const review = story.getByRole('link', { name: 'Review match' });
  await expect(review).toBeVisible();
  await review.click();
  await expect(page.locator('#studio-match-overview')).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  if (screenshots && info.project.name === 'android') {
    await page.locator('img[src*="cover.jpg"]').first().evaluate((image: HTMLImageElement) => image.decode());
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 1260 : 960 });
      await page.screenshot({ path: `${screenshots}/private-${width}.jpg`, quality: 87, scale: 'css', animations: 'disabled' });
    }
  }
  await story.getByRole('button', { name: 'Make it my goal' }).click();
  await expect(story.getByRole('button', { name: 'Goal added' })).toBeDisabled();
  await privateCover.getByRole('button', { name: 'Log a session' }).click();
  await page.getByLabel('Opponent name').fill('Birch Sample');
  await page.getByLabel('Partner name').fill('Willow Sample');
  await page.getByLabel('Venue', { exact: true }).fill('Maple Sample Court');
  await page.getByLabel('Date', { exact: true }).fill('2026-11-22');
  await page.getByLabel('Game 1: your points').fill('11');
  await page.getByLabel('Game 1: opponent points').fill('6');
  await page.getByRole('button', { name: 'Save to diary', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved to diary ✓' })).toBeVisible();
  await page.getByRole('tab', { name: 'Diary', exact: true }).click();
  await expect(page.getByText('Practice', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('vs Birch Sample')).toBeVisible();

  await page.goto(`#/public-player/${PLAYER}`);
  await expect(cover).toBeVisible();
  await expect(page.getByText(/Birch Sample|Willow Sample|Maple Sample Court/)).toHaveCount(0);
  await expect(record).toContainText('Last 1');
});

test('the cover shows the player’s live court and watches only a fan-visible stream', async ({ page, baseURL }) => {
  await studioFixture(page, baseURL!);
  const liveMatch = {
    id: 'live-match', division_id: 'division', stage: 'pool', court: 2, games: [{ a: 4, b: 3 }],
    status: 'live', entry_a: 'team-a', entry_b: 'team-b',
  };
  await page.route('**/rpc/rallyq_public_player', route => route.fulfill({ json: {
    ...player, official: history, shared: {}, live_events: [{ slug: 'sample-open', match_ids: ['live-match'] }],
  } }));
  await page.route('**/rpc/public_tournament', route => route.fulfill({ json: {
    name: 'Cedar Night Open', start_date: '2026-11-20', status: 'live', club: player.club,
    divisions: [{ id: 'division', kind: 'doubles', name: 'Open doubles', format: { pointsTo: 11, bestOf: 1 } }],
    entries: [
      { id: 'team-a', division_id: 'division', names: names.slice(0, 2).map(p => p.name) },
      { id: 'team-b', division_id: 'division', names: names.slice(2).map(p => p.name) },
    ],
    matches: [{ ...liveMatch, id: 'wrong-match', court: 1 }, liveMatch],
  } }));
  await page.route('**/rpc/public_court_streams', route => route.fulfill({ json: [
    { court: 1, video_id: 'aaaaaaaaaaa', status: 'live' },
    { court: 2, video_id: 'bbbbbbbbbbb', status: 'live' },
  ] }));
  await page.goto(`#/public-player/${PLAYER}`);
  const live = page.getByLabel('Live match', { exact: true });
  await expect(live).toContainText('Live · Court 2 · Open doubles / Pool');
  await expect(live).toContainText('Cedar Sample');
  await expect(live).toContainText('4–3');
  await expect(live.getByRole('link', { name: 'Watch' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bbbbbbbbbbb');
});

test('both covers share player cards in two PNG sizes and an official match has its own card', async ({ page, baseURL }, info) => {
  await studioFixture(page, baseURL!);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
  });
  const screenshots = info.project.name === 'android' ? process.env.PQ_STUDIO_SCREENSHOTS : undefined;
  const dialog = page.getByRole('dialog');
  async function checkPng(height: number, filename: string) {
    const png = dialog.getByRole('img', { name: /preview$/ });
    await expect.poll(() => png.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1080, height]);
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Share PNG' }).click()]);
    expect(download.suggestedFilename()).toBe(filename);
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, height]);
    if (screenshots) await writeFile(`${screenshots}/${filename}`, bytes);
  }
  async function checkButton(coverName: string) {
    const button = page.getByRole('region', { name: coverName, exact: true }).getByRole('button', { name: 'Share my card', exact: true });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`#/public-player/${PLAYER}`);
  await checkButton('Athlete cover');
  await checkPng(1350, 'rallyq-player-4x5.png');
  await dialog.getByRole('button', { name: '9:16 Status' }).click();
  await expect(dialog.getByRole('button', { name: '9:16 Status' })).toHaveAttribute('aria-pressed', 'true');
  await checkPng(1920, 'rallyq-player-9x16.png');
  await dialog.getByRole('button', { name: 'Copy profile link' }).click();
  await expect(dialog.getByText('Link copied', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close card' }).click();
  await page.getByRole('row').filter({ hasText: '11–8' }).getByRole('button', { name: 'Share', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Share match result');
  await expect(dialog.getByRole('group', { name: 'Card size' })).toHaveCount(0);
  await checkPng(1350, 'rallyq-result-4x5.png');
  await dialog.getByRole('button', { name: 'Close card' }).click();

  await page.goto('#/club-player-studio');
  await checkButton('Private Athlete cover');
  await expect(dialog.getByRole('img', { name: 'Aster Sample player card preview' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { value: (data: ShareData) => data.files?.[0]?.type === 'image/png' });
    Object.defineProperty(navigator, 'share', { value: async (data: ShareData) => {
      if (data.files?.[0]?.name !== 'rallyq-player-4x5.png') throw new Error('No PNG attached');
    }, configurable: true });
  });
  await dialog.getByRole('button', { name: 'Share PNG' }).click();
  await expect(dialog.getByText('Shared', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close card' }).click();
  await page.getByRole('tab', { name: 'Diary', exact: true }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).first().click();
  await expect(dialog.getByRole('img', { name: 'Aster Sample match result preview' })).toBeVisible();
});
