// Sign-in with a PIN instead of an email code. Two kinds:
//  - helper: a tournament's helper link (its public slug) + the event PIN (the same PIN the court scorers use) + a name.
//    A new helper account is made and added to the club as a coach for that tournament.
//  - account: an organiser's email + the personal PIN they set in My club.
// The PIN checks (with lockouts) are in the database (helper_pin_check, pin_login_check). After a good PIN this makes a
// one-off sign-in token with the admin API; no email is sent. The app swaps the token for a session (verifyOtp).
// Deployed with verify_jwt off: callers aren't signed in yet.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'Server not configured' }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: 'Bad request' }, 400); }
  const pin = String(body.pin ?? '').trim();
  if (!/^\d{4,6}$/.test(pin)) return reply({ error: 'Enter the PIN (4 to 6 digits)' });

  try {
    let email: string;
    let extra: Record<string, unknown> = {};
    if (body.mode === 'helper') {
      const name = String(body.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (name.length < 2) return reply({ error: 'Add your name, so the organiser knows who you are' });
      const { data: chk, error } = await admin.rpc('helper_pin_check', { p_slug: String(body.slug ?? ''), p_pin: pin });
      if (error) throw error;
      if (chk?.error) return reply({ error: chk.error });
      email = `pq-helper-${crypto.randomUUID()}@example.com`;
      const { data: made, error: ue } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { helper: true, name } });
      if (ue || !made.user) throw ue ?? new Error('no user');
      const { error: je } = await admin.rpc('helper_join', { p_tournament: chk.tournament_id, p_user: made.user.id, p_name: name });
      if (je) throw je;
      extra = { tournament_id: chk.tournament_id, club_id: chk.club_id, tournament: chk.name };
    } else if (body.mode === 'account') {
      const { data: chk, error } = await admin.rpc('pin_login_check', { p_email: String(body.email ?? ''), p_pin: pin });
      if (error) throw error;
      if (chk?.error) return reply({ error: chk.error });
      email = String(chk.email);
    } else {
      return reply({ error: 'Bad request' }, 400);
    }
    const { data: link, error: le } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (le || !link?.properties?.hashed_token) throw le ?? new Error('no token');
    return reply({ token_hash: link.properties.hashed_token, ...extra });
  } catch (e) {
    console.error('pin-sign-in failed', e instanceof Error ? e.message : e);
    return reply({ error: 'Sign-in didn’t work just now. Try again in a moment.' }, 500);
  }
});
