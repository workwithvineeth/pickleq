import { useState } from 'react';
import type { Go } from '../../navigation';
import type { ApprovalRequest, ClubBackend, EventsBackend } from '../backend';
import { friendlyDate, friendlyDateTime, friendlyTime } from '../dates';
import { APPROVAL_NOTE, isApproved, type ClubTournament } from '../types';
import { errorText, Status, useLoad } from './common';
import { SupportOpenButton } from './Lifecycle';

const KIND = { singles: 'Singles', doubles: 'Doubles' } as const;

/**
 * The tournament page's approval card (organisers). Until RallyQ approves the tournament (or the club is trusted),
 * the draw, referee and desk links, scoring, the results link, the registration link and the board stay off.
 */
export function ApprovalCard({ b, t, onChanged }: { b: ClubBackend; t: ClubTournament; onChanged: () => void }) {
  const [expected, setExpected] = useState(t.approvalExpected !== undefined ? String(t.approvalExpected) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (isApproved(t)) return null;
  const a = t.approval;
  async function submit() {
    const n = expected.trim() ? Number(expected) : undefined;
    if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 2000)) return setMsg({ ok: false, text: 'Expected players should be a number up to 2000' });
    setBusy(true); setMsg(null);
    try {
      const st = await b.submitTournament(t.id, n);
      setMsg({ ok: true, text: st === 'approved' ? 'Approved: your club is trusted, so it’s ready to go live.' : 'Sent to RallyQ. We’ll check it and let you know here.' });
      onChanged();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  return (
    <section className="card section" aria-label="RallyQ approval">
      <div className="row" style={{ padding: 0 }}>
        <h2 style={{ fontSize: 16 }}>RallyQ approval</h2>
        <span className={`pill${a === 'rejected' ? ' pill-bad' : a === 'submitted' ? '' : ' pill-warn'}`}>{a === 'submitted' ? 'Waiting for RallyQ' : a === 'rejected' ? 'Not approved' : 'Not submitted'}</span>
      </div>
      {a === 'rejected' && t.approvalReason && <div role="status" className="msg msg-bad">RallyQ’s note: {t.approvalReason}</div>}
      <p className="small" style={{ margin: 0 }}>
        You can set up events and add or import entries now. The draw, referee and desk links, the results link, the entry link and the events board open once RallyQ approves this tournament.
      </p>
      {a !== 'submitted' ? (
        <>
          <label className="small" htmlFor="approval-expected">Expected players (optional)</label>
          <input id="approval-expected" className="input" inputMode="numeric" aria-label="Expected players" value={expected} onChange={(e) => setExpected(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>{a === 'rejected' ? 'Submit again' : 'Submit for approval'}</button>
          <p className="small muted" style={{ margin: 0 }}>{APPROVAL_NOTE}</p>
        </>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>Sent {t.approvalRequestedAt ? friendlyDateTime(t.approvalRequestedAt) : ''}. {APPROVAL_NOTE}</p>
      )}
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
    </section>
  );
}

/** Admin → Approvals: tournaments waiting for RallyQ, with everything needed to decide. */
export function ApprovalQueue({ b, go }: { b: EventsBackend; go: Go }) {
  const state = useLoad(() => b.approvalQueue(), [b]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setRejecting(null); setReason(''); state.reload(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  const list = state.data ?? [];
  const waiting = list.filter((q) => q.approval === 'submitted');
  const decided = list.filter((q) => q.approval !== 'submitted');
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>Clubs create tournaments freely. Approve one to open its draw, links, scoring, results, entry link and board listing. Trusted clubs skip this (Admin → Clubs).</p>
      <Status error={state.error} loading={state.loading && !state.data} />
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {state.data && waiting.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing waiting.</p>}
      <div className="pq-admin-list">{waiting.map((q) => (
        <section key={q.id} className="card section" aria-label={`${q.name} approval`}>
          <RequestDetails q={q} />
          {q.mine && <div className="small muted">You organise this club, so another RallyQ admin must decide (or make the club trusted).</div>}
          {rejecting !== q.id ? (
            <div className="meta">
              <button type="button" className="btn btn-primary" disabled={busy || q.mine} onClick={() => run(() => b.decideTournament(q.id, true), `${q.name} is approved. ${q.club} can now make the draw and share links.`)}>Approve</button>
              <button type="button" className="btn btn-outline" disabled={busy || q.mine} onClick={() => { setRejecting(q.id); setReason(''); }}>Reject…</button>
              <SupportOpenButton b={b} clubId={q.clubId} tournamentId={q.id} reason={`Approval review: ${q.name}`} go={go} label="Open full tournament" />
              <button type="button" className="btn btn-outline" onClick={() => go('admin-club', q.clubId)}>Club</button>
            </div>
          ) : (
            <>
              <label className="small" htmlFor={`reason-${q.id}`}>Reason (the club sees this)</label>
              <textarea id={`reason-${q.id}`} className="input" aria-label="Reason for rejecting" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="meta">
                <button type="button" className="btn btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => run(() => b.decideTournament(q.id, false, reason), `${q.name}: the club was told why`)}>Reject with this reason</button>
                <button type="button" className="btn btn-outline" onClick={() => setRejecting(null)}>Cancel</button>
              </div>
            </>
          )}
        </section>
      ))}</div>
      {decided.length > 0 && <h3 style={{ fontSize: 16, margin: '8px 0 0' }}>Decided in the last 30 days</h3>}
      {decided.map((q) => (
        <section key={q.id} className="card section" aria-label={`${q.name} decided`}>
          <div className="row" style={{ padding: 0 }}>
            <b style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{q.name}</b>
            <span className={`pill${q.approval === 'approved' ? ' pill-ok' : q.approval === 'rejected' ? ' pill-bad' : ''}`}>{q.approval === 'approved' ? 'Approved' : q.approval === 'rejected' ? 'Rejected' : 'Draft'}</span>
          </div>
          <div className="small muted">{q.club} · {friendlyDate(q.startDate)}{q.reason ? ` · “${q.reason}”` : ''}</div>
        </section>
      ))}
    </>
  );
}

function RequestDetails({ q }: { q: ApprovalRequest }) {
  return (
    <>
      <div className="row" style={{ padding: 0 }}>
        <b style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: 17 }}>{q.name}</b>
        <span className="pill">Waiting</span>
      </div>
      <dl className="small" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '2px 10px' }}>
        <dt className="muted">Club</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{q.club}</dd>
        <dt className="muted">When</dt><dd style={{ margin: 0 }}>{friendlyDate(q.startDate)} · {friendlyTime(q.startTime)}</dd>
        <dt className="muted">Where</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{[q.venue, q.city].filter(Boolean).join(', ') || '–'}</dd>
        <dt className="muted">Events</dt>
        <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{q.divisions.length ? q.divisions.map((d) => `${d.name} (${KIND[d.kind]}${d.fee !== undefined ? `, ₹${d.fee}` : ''}${d.cap !== undefined ? `, up to ${d.cap}` : ''})`).join(' · ') : '–'}</dd>
        <dt className="muted">UPI ID</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{q.upiId ?? '–'}</dd>
        <dt className="muted">Players</dt><dd style={{ margin: 0 }}>{q.expected !== undefined ? `about ${q.expected} expected` : 'not given'} · {q.entries} entr{q.entries === 1 ? 'y' : 'ies'} so far</dd>
        <dt className="muted">Courts</dt><dd style={{ margin: 0 }}>{q.courts}</dd>
        {q.requestedAt && <><dt className="muted">Sent</dt><dd style={{ margin: 0 }}>{friendlyDateTime(q.requestedAt)}</dd></>}
      </dl>
    </>
  );
}
