import { useState } from 'react';
import type { Go } from '../../navigation';
import type { ClubBackend, TournamentBundle } from '../backend';
import { errorText } from './common';

/**
 * Remove or tidy a tournament without losing anything (Phase 3):
 * - Delete: only while nobody has entered and no match exists; type the name to confirm.
 * - Cancel: keeps entries, payments, scores and history; closes registration and scoring; players see the reason.
 * - Archive: finished or cancelled tournaments leave the lists; results links keep working.
 */
export function LifecycleCard({ b, d, go, onChanged }: { b: ClubBackend; d: TournamentBundle; go: Go; onChanged: () => void }) {
  const t = d.tournament;
  const [mode, setMode] = useState<'none' | 'delete' | 'cancel'>('none');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const empty = d.entries.length === 0 && !d.matches.some((m) => m.status !== 'void');
  async function run(fn: () => Promise<void>, after?: () => void) {
    setBusy(true); setMsg(null);
    try { await fn(); setMode('none'); setText(''); (after ?? onChanged)(); } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <section className="card section" aria-label="Delete, cancel or archive">
      <h2 style={{ fontSize: 16 }}>Delete, cancel or archive</h2>
      {t.cancelledAt && <p className="msg msg-bad small" style={{ margin: 0 }}>Cancelled{t.cancelReason ? `: ${t.cancelReason}` : ''}. Entries, payments and scores are kept.</p>}
      {t.archivedAt && <p className="small muted" style={{ margin: 0 }}>Archived: hidden from lists and the Events board. The results link still works.</p>}
      {!t.archivedAt && mode === 'none' && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            {empty ? 'Nobody has entered yet, so you can delete it completely.' : t.status === 'done' || t.cancelledAt ? 'Archive it to tidy your lists. Nothing is deleted.' : 'People have entered, so it can’t be deleted. Cancel it instead: they keep their history and you keep the records.'}
          </p>
          <div className="meta">
            {empty && !t.cancelledAt && <button type="button" className="btn btn-outline pq-danger" onClick={() => setMode('delete')}>Delete tournament</button>}
            {!empty && t.status !== 'done' && !t.cancelledAt && <button type="button" className="btn btn-outline pq-danger" onClick={() => setMode('cancel')}>Cancel tournament</button>}
            {(t.status === 'done' || t.cancelledAt) && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void run(() => b.archiveTournament(t.id, true))}>Archive</button>}
          </div>
        </>
      )}
      {t.archivedAt && <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => void run(() => b.archiveTournament(t.id, false))}>Bring it back</button>}
      {mode === 'delete' && (
        <>
          <label className="label" htmlFor="del-name">Type <b>{t.name}</b> to delete it for good</label>
          <input id="del-name" className="input" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          <div className="meta">
            <button type="button" className="btn btn-primary pq-danger-solid" disabled={busy || text.trim() !== t.name.trim()} onClick={() => void run(() => b.deleteTournament(t.id, text), () => go('club-view', t.clubId))}>Delete permanently</button>
            <button type="button" className="btn btn-outline" onClick={() => { setMode('none'); setText(''); }}>Keep it</button>
          </div>
        </>
      )}
      {mode === 'cancel' && (
        <>
          {t.status === 'live' && <p className="msg msg-bad small" style={{ margin: 0 }}>It’s live: referee and desk links stop taking scores. Only for a real emergency.</p>}
          <label className="label" htmlFor="cancel-why">Reason (players see this)</label>
          <input id="cancel-why" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Courts unavailable because of rain" maxLength={300} />
          <div className="meta">
            <button type="button" className="btn btn-primary pq-danger-solid" disabled={busy || text.trim().length < 4} onClick={() => void run(() => b.cancelTournament(t.id, text))}>Cancel tournament</button>
            <button type="button" className="btn btn-outline" onClick={() => { setMode('none'); setText(''); }}>Don’t cancel</button>
          </div>
        </>
      )}
      {msg && <div role="alert" className="msg msg-bad small">{msg}</div>}
    </section>
  );
}

/**
 * PaddleQ admins open any club's tournament through a logged, 4-hour support session: they get the club's own
 * admin screens (create, entries, draw, desk, results, cancel) with normal club permissions, never ownership.
 */
export function SupportOpenButton({ b, clubId, tournamentId, reason, go, label = 'Open tournament', primary = false }: { b: Pick<ClubBackend, 'startSupport'>; clubId: string; tournamentId?: string; reason: string; go: Go; label?: string; primary?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true); setErr(null);
    try {
      await b.startSupport(clubId, reason);
      window.dispatchEvent(new Event('pq-support-changed'));
      if (tournamentId) go('club-tournament', tournamentId); else go('club-view', clubId);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <>
      <button type="button" className={`btn ${primary ? 'btn-primary' : 'btn-outline'}`} disabled={busy} onClick={() => void open()}>{label}</button>
      {err && <span role="alert" className="small" style={{ color: '#C0392B' }}>{err}</span>}
    </>
  );
}
