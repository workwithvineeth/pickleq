// STAGING ONLY. Loads migrations and demo data into the paddleq-staging project from GitLab CI (job `staging-db`).
// The caller proves who it is with a GitLab CI identity token (id_tokens, audience "paddleq-staging") from project
// boomervineeth/paddleq on branch "staging"; it is checked against GitLab's public keys. No password or secret is stored.
// It refuses to run anywhere except the staging project, so deploying it to production by mistake does nothing.
// Deployed with verify_jwt off (the GitLab token replaces the Supabase one).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';
import postgres from 'npm:postgres@3';

const STAGING_REF = 'xlviuobtfszwfmnwcjjr';
const ISSUER = 'https://gitlab.com';
const AUDIENCE = 'paddleq-staging';
const PROJECT = 'boomervineeth/paddleq';
const keys = createRemoteJWKSet(new URL(`${ISSUER}/oauth/discovery/keys`));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  if (!url.includes(STAGING_REF)) return json({ error: 'Staging only' }, 403);
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    const { payload } = await jwtVerify(req.headers.get('x-gitlab-oidc') ?? '', keys, { issuer: ISSUER, audience: AUDIENCE });
    if (payload.project_path !== PROJECT || payload.ref !== 'staging') return json({ error: 'Not the staging job' }, 403);
  } catch {
    return json({ error: 'Not the staging job' }, 401);
  }
  const body = await req.json().catch(() => ({}));
  if (body.action === 'sql') {
    const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
    try {
      await sql`create table if not exists public.staging_applied (name text primary key, at timestamptz default now())`;
      await sql`revoke all on public.staging_applied from anon, authenticated`;
      await sql`alter table public.staging_applied enable row level security`;
      const name = String(body.name);
      if (!body.always && (await sql`select 1 from public.staging_applied where name = ${name}`).length) return json({ skipped: name });
      await sql.begin(async (tx) => {
        await tx.unsafe(String(body.sql));
        await tx`insert into public.staging_applied (name) values (${name}) on conflict (name) do update set at = now()`;
      });
      return json({ applied: name });
    } catch (e) {
      return json({ error: String((e as Error).message ?? e) }, 500);
    } finally {
      await sql.end();
    }
  }
  if (body.action === 'user') {
    // The shared test-account password lives in the staging database only (public.staging_settings, no API access).
    const db = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
    const [row] = await db`select value from public.staging_settings where key = 'test_password'`.finally(() => db.end());
    if (!row) return json({ error: 'No test password set' }, 500);
    body.password = row.value;
    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const email = String(body.email).toLowerCase();
    const { data: found } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const old = found?.users?.find((u) => u.email === email);
    if (old) {
      await sb.auth.admin.updateUserById(old.id, { password: String(body.password), email_confirm: true });
      return json({ id: old.id, email });
    }
    const { data, error } = await sb.auth.admin.createUser({
      email, password: String(body.password), email_confirm: true, user_metadata: { name: body.name ?? null },
    });
    if (error) return json({ error: error.message }, 500);
    return json({ id: data.user?.id, email });
  }
  if (body.action === 'upload') {
    // Demo posters and logos (PNG) into the public posters bucket, under staging/ only.
    const path = String(body.path);
    if (!/^staging\/[0-9a-f]+\.png$/.test(path)) return json({ error: 'Bad path' }, 400);
    const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const bytes = Uint8Array.from(atob(String(body.base64)), (c) => c.charCodeAt(0));
    const { error } = await sb.storage.from('posters').upload(path, bytes, { contentType: 'image/png', upsert: true });
    if (error) return json({ error: error.message }, 500);
    return json({ uploaded: path });
  }
  return json({ error: 'Unknown action' }, 400);
});
