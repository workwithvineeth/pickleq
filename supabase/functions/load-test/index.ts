// The load robot's server helper: sets up (and always cleans up) test tournaments in a test club, for the 20-tournaments-at-once
// load test. Only the "Load test" workflow in GitHub repo workwithvineeth/pqclub can call it: it sends a GitHub Actions identity
// token (audience pickleq-load), checked against GitHub's public keys. No password or secret is stored anywhere.
// It refuses to start while a real tournament is on (a non-test tournament dated today in India that isn't finished, or real
// scores saved in the last 2 hours),
// so it never runs during a live event. Everything it makes lives in one club named "PQ Load …" marked is_test (never on the
// public board); cleanup deletes those clubs, and the database removes their tournaments, players and matches with them.
// Deployed with verify_jwt off, because the caller proves who it is with the GitHub token instead.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'pickleq-load';
const REPO = 'workwithvineeth/pqclub';
const keys = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
type Row = Record<string, unknown>;

const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    const { payload } = await jwtVerify(req.headers.get('x-github-oidc') ?? '', keys, { issuer: ISSUER, audience: AUDIENCE });
    if (payload.repository !== REPO) return json({ error: 'Not the PaddleQ load robot' }, 403);
  } catch {
    return json({ error: 'Not the PaddleQ load robot' }, 401);
  }
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Server not configured' }, 500);
  const sb = createClient(url, key, { auth: { persistSession: false } });
  let body: Row;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  if (body.action === 'cleanup') {
    const { data, error } = await sb.from('clubs').delete().like('name', 'PQ Load %').eq('is_test', true).select('id');
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, clubsRemoved: (data ?? []).length });
  }

  if (body.action === 'guard') {
    const { data, error } = await sb.from('tournaments').select('name, start_date, status, clubs!inner(is_test)')
      .eq('clubs.is_test', false).neq('status', 'done').eq('start_date', istDay(0));
    if (error) return json({ error: error.message }, 500);
    // …or real scores were saved in the last 2 hours (a tournament still running from another day).
    const since = new Date(Date.now() - 2 * 3600e3).toISOString();
    const { data: busy, error: be } = await sb.from('club_matches').select('id, clubs!inner(is_test)').eq('clubs.is_test', false).gte('updated_at', since).limit(1);
    if (be) return json({ error: be.message }, 500);
    const live = [...(data ?? []).map((t) => `${t.name} (${t.start_date})`), ...((busy ?? []).length ? ['real scores saved in the last 2 hours'] : [])];
    return json({ ok: live.length === 0, live });
  }

  if (body.action === 'setup') {
    const club = body.club as Row;
    if (!club || typeof club.name !== 'string' || !club.name.startsWith('PQ Load ') || typeof club.id !== 'string') return json({ error: 'The load club must be named "PQ Load …"' }, 400);
    const cid = club.id;
    const tables = ['club_players', 'tournaments', 'divisions', 'entries', 'club_matches'] as const;
    for (const t of tables) {
      const rows = (body[t] as Row[]) ?? [];
      if (!Array.isArray(rows) || rows.length > 5000 || rows.some((r) => r.club_id !== cid)) return json({ error: `${t}: every row must belong to the load club` }, 400);
    }
    const { error: ce } = await sb.from('clubs').insert({ id: cid, name: club.name, city: 'Test', is_test: true, verified: false, hosting: 'approved' });
    if (ce) return json({ error: `club: ${ce.message}` }, 500);
    for (const t of tables) {
      const rows = (body[t] as Row[]) ?? [];
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from(t).insert(rows.slice(i, i + 500));
        if (error) return json({ error: `${t}: ${error.message}` }, 500);
      }
    }
    // Referee links (one per court; each gets the tournament's referee PIN) and the desk links.
    const ts = (body.tournaments as Row[]);
    const links = ts.flatMap((t) => Array.from({ length: Number(t.courts) }, (_, i) => ({ tournament_id: t.id, club_id: cid, court: i + 1, label: `Load court ${i + 1}` })));
    const { data: made, error: le } = await sb.from('scorer_links').insert(links).select('tournament_id, court, token, pin');
    if (le) return json({ error: `links: ${le.message}` }, 500);
    const ids = ts.map((t) => t.id as string);
    const { data: desks, error: de } = await sb.from('tournament_desks').select('tournament_id, token, pin').in('tournament_id', ids);
    if (de) return json({ error: `desks: ${de.message}` }, 500);
    return json({
      ok: true,
      tournaments: ts.map((t) => ({
        id: t.id, slug: t.public_slug,
        courts: (made ?? []).filter((l) => l.tournament_id === t.id).map((l) => ({ court: l.court, token: l.token, pin: l.pin })),
        desk: (desks ?? []).filter((d) => d.tournament_id === t.id).map((d) => ({ token: d.token, pin: d.pin }))[0],
      })),
    });
  }
  return json({ error: 'Unknown action' }, 400);
});
