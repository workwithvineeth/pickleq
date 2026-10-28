import { expect, test } from '@playwright/test';
import { canUseServer, resetSandbox, rest, rpc, TEST, wrongPin, type Sandbox } from './helpers';

/** What someone with no account can and can't do on the club server. API only, so it runs once (Android project). */
test.describe('Server security (no account)', () => {
  test.skip(!canUseServer, 'Needs the real server sandbox');
  test.skip(({ browserName }) => browserName !== 'chromium', 'API checks run once');
  let box: Sandbox;
  test.beforeAll(async () => { box = await resetSandbox(); });

  test('club tables are closed to visitors', async () => {
    for (const t of ['clubs', 'club_members', 'club_players', 'club_claims', 'tournaments', 'divisions', 'entries', 'club_matches', 'scorer_links', 'shared_summaries', 'profiles']) {
      const r = await rest(`${t}?select=*&limit=5`);
      if (r.status === 200) expect(r.body, t).toEqual([]);
      else expect(r.status, t).toBeGreaterThanOrEqual(400);
    }
    const ins = await rest('clubs', { method: 'POST', body: JSON.stringify({ name: 'Robot intruder' }) });
    expect(ins.status).toBeGreaterThanOrEqual(400);
    const upd = await rest(`club_matches?id=eq.${TEST.match.court2}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify({ status: 'done' }) });
    expect(upd.status >= 400 || (Array.isArray(upd.body) && upd.body.length === 0)).toBe(true);
  });

  test('account-only and server-only functions refuse visitors', async () => {
    for (const [fn, args] of [
      ['create_club', { club_name: 'Robot', club_city: '', my_name: 'Robot' }],
      ['join_club', { code: 'pqrobot001', claim: null, my_name: 'Robot' }],
      ['set_member_role', { cid: '00000000-0000-0000-0000-000000000000', member: '00000000-0000-0000-0000-000000000000', new_role: 'admin' }],
      ['scorer_check', { p_token: box.links.court1.token, p_pin: box.links.court1.pin }],
      ['robot_reset', {}],
    ] as const) {
      const r = await rpc(fn, args);
      expect(r.status, fn).toBeGreaterThanOrEqual(400);
    }
  });

  test('the reset function refuses anyone who isn’t the robot', async () => {
    const { SUPABASE_URL } = await import('./helpers');
    const r = await fetch(`${SUPABASE_URL}/functions/v1/robot-reset`, { method: 'POST', headers: { 'x-github-oidc': 'not-a-token' } });
    expect(r.status).toBe(401);
  });

  test('scorer links: wrong PIN, wrong court and bad scores are refused', async () => {
    const c1 = box.links.court1;
    expect((await rpc('scorer_open', { p_token: c1.token, p_pin: wrongPin(c1.pin) })).body).toEqual({ error: 'Wrong PIN' });
    const game = [{ points: 'A', a: 1, b: 0 }];
    const other = await rpc('scorer_save', { p_token: c1.token, p_pin: c1.pin, p_match: TEST.match.court2, p_games: game, p_status: 'live', p_winner: null, p_played_on: null });
    expect(JSON.stringify(other.body)).toContain('isn\'t on your court');
    const bad = await rpc('scorer_save', { p_token: c1.token, p_pin: c1.pin, p_match: TEST.match.golden, p_games: [{ points: 'X<script>', a: 1, b: 0 }], p_status: 'live', p_winner: null, p_played_on: null });
    expect(JSON.stringify(bad.body)).toContain('right shape');
    const noWinner = await rpc('scorer_save', { p_token: c1.token, p_pin: c1.pin, p_match: TEST.match.golden, p_games: game, p_status: 'done', p_winner: null, p_played_on: null });
    expect(JSON.stringify(noWinner.body)).toContain('needs a winner');
    const finished = await rpc('scorer_save', { p_token: c1.token, p_pin: c1.pin, p_match: TEST.match.finished, p_games: game, p_status: 'live', p_winner: null, p_played_on: null });
    expect(JSON.stringify(finished.body)).toContain('already finished');
  });

  test('8 wrong PINs lock a link for 15 minutes, even for the right PIN', async () => {
    const l = box.links.lockout;
    for (let i = 0; i < 8; i++) await rpc('scorer_open', { p_token: l.token, p_pin: wrongPin(l.pin) });
    const r = await rpc('scorer_open', { p_token: l.token, p_pin: l.pin });
    expect(JSON.stringify(r.body)).toContain('Too many wrong PINs');
  });

  test('public results and scorer views carry names and scores only', async () => {
    const pub = JSON.stringify((await rpc('public_tournament', { slug: TEST.slug })).body);
    const view = JSON.stringify((await rpc('scorer_open', { p_token: box.links.court2.token, p_pin: box.links.court2.pin })).body);
    for (const [name, json] of [['results', pub], ['scorer view', view]]) {
      for (const secret of ['dupr', 'user_id', 'email', 'claim', 'invite', 'token', '"pin"']) expect(json, `${name}: ${secret}`).not.toContain(secret);
    }
    expect(pub).not.toContain('points');
    expect(pub).toContain('Asha Test');
  });
});
