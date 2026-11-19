// The parts of send-claim-email that don't need Deno or the network: the email itself and the send loop.
// Kept plain TypeScript so the app's unit tests (vitest) can check them.

/** off: nothing is sent (the default until Vineeth says go). test: every email goes to the test address. live: real players. */
export type Mode = 'off' | 'test' | 'live';
export const parseMode = (v: string | undefined | null): Mode => (v === 'live' || v === 'test' ? v : 'off');

export interface Target { log_id: number; player_id: string; name: string; email: string; token: string }
export interface Batch { tournament: string; club: string; targets: Target[]; skipped: number; limited: boolean }
export interface Message { to: { email: string; name: string }; subject: string; html: string; text: string; tags: string[] }
export interface Deps {
  mode: Mode;
  testTo?: string;
  appUrl: string;
  /** claim_email_batch, called as the signed-in organiser (it checks they're staff, limits and logs). */
  batch: (tournamentId: string, playerIds: string[] | null, mode: 'test' | 'live') => Promise<Batch>;
  send: (m: Message) => Promise<{ ok: boolean; id?: string; error?: string }>;
  /** claim_email_result, with the service key. */
  record: (logId: number, ok: boolean, detail: string) => Promise<void>;
}
export interface Outcome { sent: number; failed: number; skipped: number; limited: boolean; test: boolean; error?: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const claimLink = (appUrl: string, token: string) => `${appUrl.replace(/\/?$/, '/')}#/club-claim/${token}`;

/** The claim email: plain words, one button, what happens to their data, and what to do if it isn't them. */
export function claimEmail(x: { name: string; tournament: string; club: string; link: string }): { subject: string; html: string; text: string } {
  const first = x.name.trim().split(/\s+/)[0] || 'there';
  const subject = `Your results from ${x.tournament}`;
  const text = [
    `Hi ${first},`,
    '',
    `Your official results from ${x.tournament} (${x.club}) are ready on RallyQ.`,
    'Open this private link to add them to your Player Studio, where you can also keep a practice diary:',
    x.link,
    '',
    'The link is just for you. It works once and expires in 60 days.',
    `Not ${x.name}? Ignore this email and nothing happens.`,
    '',
    'RallyQ · paddleq.in',
  ].join('\n');
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F3EBDD;font-family:Arial,Helvetica,sans-serif;color:#2B1D17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3EBDD;padding:24px 0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FBF7F0;border-radius:16px;overflow:hidden">
<tr><td style="background:#7A1F2B;color:#FBF7F0;padding:20px 24px;font-size:22px;font-weight:bold">RallyQ</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.5">
<p style="margin:0 0 12px">Hi ${esc(first)},</p>
<p style="margin:0 0 12px">Your official results from <b>${esc(x.tournament)}</b> (${esc(x.club)}) are ready.</p>
<p style="margin:0 0 20px">Add them to your Player Studio, where you can also keep a practice diary.</p>
<p style="margin:0 0 20px"><a href="${esc(x.link)}" style="display:inline-block;background:#7A1F2B;color:#FBF7F0;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px">Claim my results</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#6E5E52">This link is just for you. It works once and expires in 60 days.</p>
<p style="margin:0;font-size:13px;color:#6E5E52">Not ${esc(x.name)}? Ignore this email and nothing happens.</p>
</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#6E5E52;border-top:1px solid #E7DCCB">RallyQ · paddleq.in</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}

/** Asks the database for who to email (it checks the organiser and the limits), sends each one, and records each result. */
export async function sendClaimEmails(tournamentId: string, playerIds: string[] | null, d: Deps): Promise<Outcome> {
  const none = { sent: 0, failed: 0, skipped: 0, limited: false, test: d.mode === 'test' };
  if (d.mode === 'off') return { ...none, error: 'Emailing results isn’t switched on yet. Send the links on WhatsApp for now.' };
  if (d.mode === 'test' && !d.testTo) return { ...none, error: 'Test mode needs a test address.' };
  const b = await d.batch(tournamentId, playerIds, d.mode);
  let sent = 0, failed = 0;
  for (const t of b.targets) {
    const mail = claimEmail({ name: t.name, tournament: b.tournament, club: b.club, link: claimLink(d.appUrl, t.token) });
    // Test mode: the real player's link, but delivered to the RallyQ test inbox, with the player named in the subject.
    const to = d.mode === 'test' ? { email: d.testTo!, name: 'RallyQ test' } : { email: t.email, name: t.name };
    const subject = d.mode === 'test' ? `[Test for ${t.name}] ${mail.subject}` : mail.subject;
    let r: { ok: boolean; id?: string; error?: string };
    try { r = await d.send({ to, subject, html: mail.html, text: mail.text, tags: ['claim-link'] }); }
    catch (e) { r = { ok: false, error: e instanceof Error ? e.message : 'send failed' }; }
    if (r.ok) sent++; else failed++;
    await d.record(t.log_id, r.ok, (r.ok ? r.id : r.error) ?? '');
  }
  return { sent, failed, skipped: b.skipped, limited: b.limited, test: d.mode === 'test' };
}
