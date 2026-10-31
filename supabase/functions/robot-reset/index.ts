// Puts the test robot's sandbox club back to a known state and returns fresh scorer links and a desk link for it.
// It also removes the desk-team accounts the old PIN sign-in made (pq-helper-…@example.com, switched off on 31 Oct 2026); they
// have no club rights any more (club_mode_18), so nothing is lost.
// Only the robot workflow in GitHub repo workwithvineeth/pqclub can call it: it sends a GitHub Actions identity
// token, which is checked against GitHub's public keys. No password or secret is stored anywhere.
// Deployed with verify_jwt off, because the caller proves who it is with the GitHub token instead.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'pickleq-robot';
const REPO = 'workwithvineeth/pqclub';
const keys = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const token = req.headers.get('x-github-oidc') ?? '';
  try {
    const { payload } = await jwtVerify(token, keys, { issuer: ISSUER, audience: AUDIENCE });
    if (payload.repository !== REPO) return json({ error: 'Not the PQ Club robot' }, 403);
  } catch {
    return json({ error: 'Not the PQ Club robot' }, 401);
  }
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!key || !url) return json({ error: 'Server not configured' }, 500);
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('robot_reset');
  if (error) return json({ error: error.message }, 500);
  let removed = 0;
  try {
    // Find them all first, then remove (removing while paging would skip some).
    const old: string[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data: list, error: le } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (le || !list?.users?.length) break;
      for (const u of list.users) if (/^pq-helper-[0-9a-f-]{36}@example\.com$/.test(u.email ?? '')) old.push(u.id);
      if (list.users.length < 200) break;
    }
    for (const id of old) if (!(await sb.auth.admin.deleteUser(id)).error) removed++;
  } catch (e) {
    console.error('helper cleanup failed', e instanceof Error ? e.message : e);
  }
  return json({ ...(data as Record<string, unknown>), helpersRemoved: removed });
});
