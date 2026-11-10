// Emails players their private Player Studio claim link, from hello@paddleq.in through Brevo.
// The signed-in organiser calls it from Results & DUPR ("Email results"). The database decides who gets an email
// (claim_email_batch: the caller must be the club's staff; only unclaimed players with an email; no repeat within 7 days;
// 100 a day per club and 250 a day in all, under Brevo's free 300) and logs every send with a masked address.
//
// Secrets (Supabase → Edge Functions → Secrets; never in code):
//   BREVO_API_KEY          Brevo API key (transactional email)
//   CLAIM_EMAIL_MODE       off (default) | test | live. Live needs Vineeth's OK before the first send.
//   CLAIM_EMAIL_TEST_TO    the inbox test mode sends to (e.g. hello@paddleq.in)
//   APP_URL                optional, default https://paddleq.in/
// Deployed with verify_jwt on: callers must be signed in.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseMode, sendClaimEmails, type Batch, type Message } from './core.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const auth = req.headers.get('authorization') ?? '';
  if (!url || !anon || !service) return reply({ error: 'Server not configured' }, 500);
  if (!auth.startsWith('Bearer ')) return reply({ error: 'Sign in first' }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: 'Bad request' }, 400); }
  const tournamentId = String(body.tournament_id ?? '');
  const ids = Array.isArray(body.player_ids) ? body.player_ids.map(String) : null;
  if (!UUID.test(tournamentId) || (ids && (ids.length > 200 || !ids.every((x) => UUID.test(x))))) return reply({ error: 'Bad request' }, 400);

  const mode = parseMode(Deno.env.get('CLAIM_EMAIL_MODE'));
  const key = Deno.env.get('BREVO_API_KEY');
  if (mode !== 'off' && !key) return reply({ error: 'Email isn’t set up yet' }, 500);
  // As the organiser (their token), so the database's staff check and limits apply to them.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const out = await sendClaimEmails(tournamentId, ids, {
      mode, testTo: Deno.env.get('CLAIM_EMAIL_TEST_TO') ?? undefined, appUrl: Deno.env.get('APP_URL') ?? 'https://paddleq.in/',
      batch: async (t, p, m) => {
        const { data, error } = await asUser.rpc('claim_email_batch', { p_tournament: t, p_players: p, p_mode: m });
        if (error) throw new Error(error.message);
        return data as Batch;
      },
      send: async (m: Message) => {
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': key!, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: 'RallyQ', email: 'hello@paddleq.in' }, to: [m.to], subject: m.subject, htmlContent: m.html, textContent: m.text, tags: m.tags }),
        });
        const j = await r.json().catch(() => ({})) as { messageId?: string; message?: string };
        return r.ok ? { ok: true, id: j.messageId } : { ok: false, error: `${r.status} ${j.message ?? ''}`.trim() };
      },
      record: async (logId, ok, detail) => { await admin.rpc('claim_email_result', { p_log: logId, p_ok: ok, p_detail: detail }); },
    });
    return reply(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    // The database's own messages (not staff, nothing finished yet, switched off) are meant for the organiser.
    if (/^(Only the club|Email results once|Email sending isn)/.test(msg)) return reply({ error: msg });
    console.error('send-claim-email failed', msg);
    return reply({ error: 'Emails didn’t go out just now. Try again in a moment.' }, 500);
  }
});
