// Sign-in with a PIN instead of an email code: an organiser's email + the personal PIN they set in My club.
// The PIN check (with lockouts) is in the database (pin_login_check). After a good PIN this makes a one-off sign-in token with
// the admin API; no email is sent. The app swaps the token for a session (verifyOtp).
// The old desk sign-in (helper link + event PIN → a new coach account) was switched off on 31 Oct 2026: the desk now has its own
// link and desk PIN and needs no account (club_mode_18_desk_access).
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
    if (body.mode === 'helper') {
      return reply({ error: 'The desk now has its own link and desk PIN. Ask the organiser for the desk link.' });
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
    return reply({ token_hash: link.properties.hashed_token });
  } catch (e) {
    console.error('pin-sign-in failed', e instanceof Error ? e.message : e);
    return reply({ error: 'Sign-in didn’t work just now. Try again in a moment.' }, 500);
  }
});
