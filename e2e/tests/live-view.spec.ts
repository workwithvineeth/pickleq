import { expect, test, type WebSocketRoute } from '@playwright/test';

// Public spectator data only. No server secrets, accounts, production reads or writes.
test('spectator courts: sample data, score refresh, court selection, themes and widths', async ({ page }) => {
  let points = 9;
  let realtimeUp = false;
  let stream: { socket: WebSocketRoute; topic: string; join: string } | undefined;
  await page.routeWebSocket(/\/realtime\/v1\/websocket\?/, socket => {
    socket.onMessage(message => {
      if (typeof message !== 'string') return;
      const [join, ref, topic, event] = JSON.parse(message) as [string, string, string, string];
      if (event !== 'phx_join' && event !== 'heartbeat') return;
      const ok = event === 'heartbeat' || realtimeUp;
      socket.send(JSON.stringify([join, ref, topic, 'phx_reply', { status: ok ? 'ok' : 'error', response: {} }]));
      if (event === 'phx_join' && ok) stream = { socket, topic, join };
    });
  });
  const format = { bestOf: 1, pointsTo: 11, scoring: 'rally' };
  await page.route('https://*.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith('/public_tournament')) return route.fulfill({ json: path.endsWith('/public_club_logo') ? null : [] });
    return route.fulfill({ json: {
      name: 'Sample Night Open', club: 'Cedar Paddle Club', start_date: '2026-11-09', start_time: '18:00', slot_minutes: 20, status: 'live',
      divisions: [{ id: 'd', name: 'Open doubles', kind: 'doubles', pools: 1, advance: 0, format: { pool: format, ko: format } }],
      entries: ['Alex / Sam', 'Robin / Taylor', 'Jamie / Morgan', 'Casey / Quinn'].map((names, i) => ({ id: `e${i}`, division_id: 'd', pool: 1, names: names.split(' / ') })),
      matches: [1, 2, 3, 4, 5, 6].map(court => ({ id: `m${court}`, division_id: 'd', court, entry_a: court % 2 ? 'e0' : 'e2', entry_b: court % 2 ? 'e1' : 'e3', stage: 'pool', pool: 1, status: court === 6 ? 'scheduled' : 'live', games: court === 6 ? [] : [{ a: court === 1 ? points : court + 2, b: court === 1 ? 7 : court + 1 }] })),
    } });
  });
  await page.goto('#/results/sample-live-view');
  await expect(page.getByRole('heading', { name: 'Court view', exact: true })).toBeVisible();
  const stage = page.getByRole('region', { name: 'Watch Court 1' });
  await expect(stage).toContainText('9'); await expect(stage).not.toContainText('No video linked');
  await page.getByRole('button',{name:'Live scores',exact:true}).click();
  await expect(page.getByRole('region', { name: 'On court now' }).getByRole('article')).toHaveCount(6);
  await expect(page.getByText('Scores refresh every 20 seconds.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Point by point' })).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Momentum'})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Head to head'})).toHaveCount(0);
  await page.getByRole('button', { name: 'Watch Court 2' }).click();
  await expect(page.getByRole('region', { name: 'Watch Court 2' })).toContainText('Jamie / Morgan');
  await expect(page.getByRole('heading', { name: 'Court view', exact: true })).toBeFocused();
  await page.getByRole('button',{name:'Live scores',exact:true}).click();
  await page.getByRole('button', { name: 'Watch Court 1' }).click();
  points = 10;
  // Resume from a hidden tab to exercise the real visibility refresh path without waiting 20 s.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(stage.locator('.pq-flash-score').first()).toHaveText('10');

  realtimeUp = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Scores update live.')).toBeAttached();
  expect(stream?.topic).toBe('realtime:live:sample-live-view');
  // The RPC still returns 10, so only a broadcast can show the corrected score immediately.
  stream!.socket.send(JSON.stringify([stream!.join, null, stream!.topic, 'broadcast', { type: 'broadcast', event: 'score', payload: {
    id: 'm1', court: 1, entryA: 'e0', entryB: 'e1', status: 'live', games: [{ a: 8, b: 7 }], at: Date.now(),
  } }]));
  await expect(stage.locator('.pq-flash-score').first()).toHaveText('8', { timeout: 2000 });
  points = 8;
  for (const colorScheme of ['light', 'dark'] as const) for (const width of [320, 390, 870, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width} ${colorScheme}`).toBeLessThanOrEqual(width);
    if(width<600) expect(await stage.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(180);
    const score = stage.locator('.pq-flash-score').first();
    expect(await score.evaluate(el => getComputedStyle(el).fontFamily)).toContain('Archivo');
    expect(await page.getByRole('button', { name: 'All courts →' }).evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await score.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  }
  // Public page: no emails or PINs (DUPR is public since 12 Nov).
  expect(await page.locator('main').innerText()).not.toMatch(/@|PIN/);
});
