import { useState } from 'react';
import type { Go } from '../../../navigation';
import { rememberReturn, serverBackend } from '../../index';
import { friendlyDate } from '../../dates';
import type { ClaimPreview } from '../../playerStudio';
import type { ClubPlayer } from '../../types';
import { appLink, errorText, Header, shareText, Status, useLoad } from '../common';
import { plural } from './shared';

/**
 * Claim your official results: open the organiser's link (#/club-claim/<token>) or a match found from your own
 * registration (#/club-claim/p.<player id>) → sign in with an email code → see what was found → privacy choices → claim.
 */
export function Claim({ id, go }: { id: string; go: Go }) {
  const b = serverBackend();
  const byPlayer = id.startsWith('p.') ? id.slice(2) : null;
  const state = useLoad(async () => {
    if (!b || !(await b.currentUser())) return { signedIn: false as const };
    if (byPlayer) {
      const found = (await b.foundPlayers()).find((f) => f.playerId === byPlayer);
      return { signedIn: true as const, preview: found ?? { error: 'Nothing to claim here: it may already be claimed.' } };
    }
    return { signedIn: true as const, preview: await b.claimPreview(id) };
  }, [b, id]);
  const [useInStats, setUseInStats] = useState(true);
  const [step, setStep] = useState<'found' | 'privacy'>('found');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const d = state.data;
  async function claim(p: ClaimPreview) {
    setBusy(true); setErr(undefined);
    try { await b!.claimPlayer(byPlayer ? null : id, byPlayer ? p.playerId : null, useInStats); go('club-player-studio', 'matches', { replace: true }); }
    catch (e) { setErr(errorText(e)); setBusy(false); }
  }
  return (
    <main className="screen" aria-labelledby="claim-title">
      <Header id="claim-title" title="Claim your results" onBack={() => go('club-player-studio')} />
      <Status loading={state.loading && !d} error={state.error} />
      {d && !d.signedIn && <section className="card section" aria-label="Sign in to claim">
        <h2>Your official results are waiting</h2>
        <p style={{ margin: 0 }}>Sign in with your email. We’ll send you a code; no password needed.</p>
        <button type="button" className="btn btn-primary" onClick={() => { rememberReturn(`#/club-claim/${id}`); go('club-signin'); }}>Sign in with email code</button>
      </section>}
      {d?.signedIn && 'error' in d.preview && <section className="card section" aria-label="Can’t claim">
        <p role="alert" style={{ margin: 0 }}>{d.preview.error}</p>
        <button type="button" className="btn btn-outline" onClick={() => go('club-player-studio', d.preview && 'mine' in d.preview && d.preview.mine ? 'matches' : undefined)}>Open Player Studio</button>
      </section>}
      {d?.signedIn && !('error' in d.preview) && (() => {
        const p = d.preview;
        if (step === 'found') return <section className="card section" aria-label="Matches found">
          <span className="pq-kicker">STEP 1 OF 2 · MATCHES FOUND</span>
          <h2>{p.name}</h2>
          <p style={{ margin: 0 }}>{p.club} · {plural(p.matches, 'official match', 'official matches')}, {plural(p.wins, 'win')}</p>
          <ul className="pq-plain-list">{p.tournaments.map((t) => <li key={t.name + t.date}>{t.name} <span className="small muted">· {friendlyDate(t.date)}</span></li>)}</ul>
          <p className="small muted" style={{ margin: 0 }}>Only claim if this is you. Claiming someone else’s results breaks RallyQ’s rules.</p>
          <div className="meta">
            <button type="button" className="btn btn-primary" onClick={() => setStep('privacy')}>This is me</button>
            <button type="button" className="btn btn-outline" onClick={() => go('club-player-studio')}>Not me</button>
          </div>
        </section>;
        return <section className="card section" aria-label="Privacy choices">
          <span className="pq-kicker">STEP 2 OF 2 · PRIVACY</span>
          <h2>Before you claim</h2>
          <ul className="small pq-plain-list">
            <li>These results stay read-only. Only the organiser can correct a score.</li>
            <li>{p.club} sees that {p.name} is linked to an account. Not your email, and not your diary.</li>
            <li>Your diary (practice, casual games, ratings, goals) stays private to you.</li>
            <li>You can undo this any time in Profile (“Not me”).</li>
          </ul>
          <label className="pq-check"><input type="checkbox" checked={useInStats} onChange={(e) => setUseInStats(e.target.checked)} /> Use these results in my Stats and Coach</label>
          {err && <p role="alert" style={{ margin: 0 }}>{err}</p>}
          <div className="meta">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void claim(p)}>{busy ? 'Claiming…' : 'Claim my matches'}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setStep('found')}>Back</button>
          </div>
        </section>;
      })()}
    </main>
  );
}

export const claimMessage = (tournament: string, name: string, token: string) =>
  `${name}, your official results from ${tournament} are ready on RallyQ. Claim them in Player Studio (private link, just for you): ${appLink(`#/club-claim/${token}`)}`;

/**
 * Organisers: send each player of a tournament their private claim link, on WhatsApp (one at a time) or by email
 * (everyone with an email, from hello@rallyq.in). Add a missing email here; undo a claim if the wrong person claimed.
 */
export function ClaimLinks({ tournamentId, clubId, tournament, players }: { tournamentId: string; clubId: string; tournament: string; players: ClubPlayer[] }) {
  const b = serverBackend();
  const ids = players.map((p) => p.id).join();
  const status = useLoad(async () => (b ? b.claimStatus(tournamentId, players.map((p) => p.id)) : null), [b, tournamentId, ids]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [unlinked, setUnlinked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState('');
  if (!b || !players.length) return null;
  const st = status.data;
  const isClaimed = (p: ClubPlayer) => !unlinked.has(p.id) && (!!p.userId || claimed.has(p.id));
  const canEmail = players.filter((p) => !isClaimed(p) && st?.emails[p.id] && !['sent', 'queued'].includes(st.emailed[p.id]?.status ?? ''));
  async function run(fn: () => Promise<string>) {
    setBusy(true);
    try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  async function send(p: ClubPlayer) {
    await run(async () => {
      const r = await b!.claimLink(p.id);
      if (r.claimed) { setClaimed((x) => new Set(x).add(p.id)); return `${p.name} has already claimed their results.`; }
      return `${p.name}: ${await shareText(claimMessage(tournament, p.name, r.token))}`;
    });
  }
  async function emailAll() {
    await run(async () => {
      const r = await b!.emailClaimLinks(tournamentId, canEmail.map((p) => p.id));
      status.reload();
      const parts = [r.test ? `Test mode: ${plural(r.sent, 'email')} went to the RallyQ test inbox, not to players` : `Emailed ${plural(r.sent, 'player')}`];
      if (r.failed) parts.push(`${r.failed} didn’t go through`);
      if (r.limited) parts.push('the daily email limit was reached, so send the rest tomorrow or on WhatsApp');
      return parts.join('; ') + '.';
    });
  }
  async function saveEmail(p: ClubPlayer) {
    await run(async () => { await b!.setPlayerEmail(clubId, p.id, draft || null); setEditing(undefined); status.reload(); return draft ? `Email saved for ${p.name}.` : `Email removed for ${p.name}.`; });
  }
  async function unlink(p: ClubPlayer) {
    if (!window.confirm(`Undo ${p.name}’s claim? Their results leave that account’s Player Studio, and you can send a new link.`)) return;
    await run(async () => { await b!.unlinkPlayer(p.id); setUnlinked((x) => new Set(x).add(p.id)); return `${p.name}’s claim was undone.`; });
  }
  const sorted = [...players].sort((a, c) => a.name.localeCompare(c.name));
  const withEmail = players.filter((p) => st?.emails[p.id]).length;
  return (
    <section className="card section no-print" aria-label="Player claim links">
      <h3>Send players their results</h3>
      <p className="small muted" style={{ margin: 0 }}>Each player gets a private link to claim their official matches in Player Studio. Send it to that player only.</p>
      <div className="meta">
        <button type="button" className="btn btn-primary" disabled={busy || !canEmail.length} onClick={() => void emailAll()}>
          {canEmail.length ? `Email results to ${plural(canEmail.length, 'player')}` : 'Email results'}
        </button>
        <span className="small muted">{st ? `${withEmail} of ${players.length} have an email. Emails come from hello@rallyq.in.` : ''}</span>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className="small" style={{ margin: 0 }}>{msg.text}</p>}
      <ul className="pq-plain-list">
        {sorted.map((p) => {
          const email = st?.emails[p.id];
          const sent = st?.emailed[p.id];
          return <li key={p.id} className="pq-claim-row">
            <span style={{ minWidth: 0 }}><b>{p.name}</b>
              <span className="small muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                {email ?? 'No email'}{sent ? ` · ${sent.status === 'sent' ? 'emailed' : sent.status === 'failed' ? 'email failed' : sent.status === 'test' ? 'test email' : 'sending'} ${friendlyDate(sent.at.slice(0, 10))}` : ''}
              </span></span>
            {isClaimed(p) ? <span className="meta"><span className="pill pill-ok">Claimed</span>
                {(p.claimedAt || claimed.has(p.id)) && <button type="button" className="link-btn" disabled={busy} aria-label={`Undo ${p.name}’s claim`} onClick={() => void unlink(p)}>Undo claim</button>}</span>
              : <span className="meta">
                <button type="button" className="btn btn-outline" disabled={busy} aria-label={`Send claim link to ${p.name}`} onClick={() => void send(p)}>WhatsApp link</button>
                <button type="button" className="link-btn" aria-label={`${email ? 'Change' : 'Add'} email for ${p.name}`} onClick={() => { setEditing(p.id); setDraft(email ?? ''); }}>{email ? 'Change email' : 'Add email'}</button>
              </span>}
            {editing === p.id && <form className="row" style={{ gridColumn: '1 / -1' }} onSubmit={(e) => { e.preventDefault(); void saveEmail(p); }} aria-label={`Email for ${p.name}`}>
              <label style={{ flex: 1, minWidth: 0 }}><span className="sr-only">Email for {p.name}</span><input className="input" type="email" inputMode="email" autoFocus maxLength={254} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="name@example.com" /></label>
              <button type="submit" className="btn btn-outline" disabled={busy}>Save</button>
              <button type="button" className="link-btn" onClick={() => setEditing(undefined)}>Cancel</button>
            </form>}
          </li>;
        })}
      </ul>
    </section>
  );
}
