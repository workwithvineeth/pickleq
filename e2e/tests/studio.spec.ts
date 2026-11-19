import { expect, test } from '@playwright/test';
import { canUseServer, rest, rpc, SUPABASE_KEY, SUPABASE_URL } from './helpers';

/** Player Studio (Phase 3 Module 3): reachable from the main tabs, asks visitors to sign in, and keeps its data private. */
test.describe('Player Studio', () => {
  test('the Studio tab asks a visitor to sign in', async ({ page }) => {
    // Events has the RallyQ header now (no bottom tabs); Player Studio opens straight from its link.
    await page.goto('#/club-player-studio');
    await expect(page.getByRole('heading', { name: 'Player Studio' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in to Player Studio' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in to Player Studio' }).click();
    await expect(page).toHaveURL(/#\/club-signin/);
  });

  test('a claim link asks a visitor to sign in with an email code', async ({ page }) => {
    await page.goto(`#/club-claim/${'0'.repeat(64)}`);
    await expect(page.getByRole('heading', { name: 'Claim your results' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with email code' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: 'Sign in to Player Studio' })).toBeVisible();
  });
});

test.describe('Player Studio privacy (no account)', () => {
  test.skip(!canUseServer, 'Needs the real server');
  test.skip(({ browserName }) => browserName !== 'chromium', 'API checks run once');

  test('diary tables and Studio functions are closed to visitors', async () => {
    for (const t of ['player_studio_logs', 'player_studio_sessions', 'player_studio_ratings', 'player_studio_settings', 'player_claim_links', 'club_player_emails', 'claim_email_log']) {
      const r = await rest(`${t}?select=*&limit=5`);
      if (r.status === 200) expect(r.body, t).toEqual([]);
      else expect(r.status, t).toBeGreaterThanOrEqual(400);
    }
    for (const [fn, args] of [
      ['studio_official_history', {}], ['studio_my_players', {}], ['studio_found_players', {}],
      ['studio_claim_preview', { p_token: '0'.repeat(64) }], ['studio_claim', { p_token: '0'.repeat(64), p_player: null, p_use_in_stats: true }],
      ['studio_claim_link', { p_player: '00000000-0000-0000-0000-000000000000' }], ['studio_match_summary', { p_player: '00000000-0000-0000-0000-000000000000' }],
      ['staff_unlink_player', { p_player: '00000000-0000-0000-0000-000000000000' }],
      ['claim_email_batch', { p_tournament: '00000000-0000-0000-0000-000000000000', p_players: null, p_mode: 'live' }],
      ['claim_email_result', { p_log: 1, p_ok: true, p_detail: 'x' }],
    ] as const) {
      const r = await rpc(fn, args);
      expect(r.status, fn).toBeGreaterThanOrEqual(400);
    }
  });

  test('visitors can’t send claim emails', async () => {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-claim-email`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ tournament_id: '00000000-0000-0000-0000-000000000000' }) });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
