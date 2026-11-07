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
          <p className="small muted" style={{ margin: 0 }}>Only claim if this is you. Claiming someone else’s results breaks PaddleQ’s rules.</p>
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
  `${name}, your official results from ${tournament} are ready on PaddleQ. Claim them in Player Studio (private link, just for you): ${appLink(`#/club-claim/${token}`)}`;

/** Organisers: a private claim link for each player of a tournament, to send on WhatsApp. Already-linked players show as claimed. */
export function ClaimLinks({ tournament, players }: { tournament: string; players: ClubPlayer[] }) {
  const b = serverBackend();
  const [msg, setMsg] = useState<string>();
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  if (!b || !players.length) return null;
  async function send(p: ClubPlayer) {
    try {
      const r = await b!.claimLink(p.id);
      if (r.claimed) { setClaimed((s) => new Set(s).add(p.id)); setMsg(`${p.name} has already claimed their results.`); return; }
      setMsg(`${p.name}: ${await shareText(claimMessage(tournament, p.name, r.token))}`);
    } catch (e) { setMsg(errorText(e)); }
  }
  const sorted = [...players].sort((a, c) => a.name.localeCompare(c.name));
  return (
    <section className="card section no-print" aria-label="Player claim links">
      <h3>Send players their results</h3>
      <p className="small muted" style={{ margin: 0 }}>Each player gets a private link to claim their official matches in Player Studio. Send it to that player only.</p>
      {msg && <p role="status" className="small" style={{ margin: 0 }}>{msg}</p>}
      <ul className="pq-plain-list">
        {sorted.map((p) => <li key={p.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{p.name}</span>
          {p.userId || claimed.has(p.id) ? <span className="pill pill-ok">Claimed</span>
            : <button type="button" className="btn btn-outline" aria-label={`Send claim link to ${p.name}`} onClick={() => void send(p)}>Send claim link</button>}
        </li>)}
      </ul>
    </section>
  );
}
