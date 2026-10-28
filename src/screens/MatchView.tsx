import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { TournamentBadge } from './Tournaments';
import { categoryLabel, shortDate, typeLabel } from '../components/MatchRow';
import { db } from '../db/db';
import { moveToTrash } from '../db/matches';
import { formatLabel, momentumLabel, scoreLine } from '../domain/scoring';
import type { Go } from '../navigation';

export function MatchView({ matchId, go, onBack }: { matchId: string; go: Go; onBack: () => void }) {
  const match = useLiveQuery(() => db.matches.get(matchId).then((m) => m ?? null), [matchId]);
  const [confirming, setConfirming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  if (match === undefined) return <main className="screen"><p className="muted">Loading…</p></main>;
  if (match === null) {
    return (
      <main className="screen">
        <p>This match no longer exists.</p>
        <button type="button" className="btn btn-outline" onClick={() => go('matches')}>Back to matches</button>
      </main>
    );
  }

  const tags = Object.entries(match.tags);
  const ended = match.outcome === 'walkover' ? 'Walkover' : match.outcome === 'retired' ? 'Retired' : null;

  return (
    <main className="screen" aria-labelledby="match-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="match-title" className="screen-title" style={{ flex: 1, fontSize: 24 }}>
          {match.won ? 'Win' : 'Loss'} · {scoreLine(match)}
        </h1>
      </header>
      <div className="meta">
        <span className="pill">{shortDate(match.date)}</span>
        <span className="pill">{typeLabel[match.type]}</span>
        <span className="pill">{categoryLabel[match.category]}</span>
        {ended && <span className="pill">{ended}</span>}
        {match.backfilled && <span className="pill">Backfilled</span>}
      </div>

      <TournamentBadge match={match} go={go} />

      {match.status === 'incomplete' && (
        <button type="button" className="banner-btn" onClick={() => go('details', match.id)}>
          <span>Tags, energy and notes not added yet</span><span>Finish ›</span>
        </button>
      )}

      <section className="card" aria-label="Players">
        {match.participants.map((p, i) => (
          <div className="kv" key={i}>
            <span>{p.role === 'partner' ? 'Partner' : 'Opponent'}: {p.name || 'not named'}</span>
            <span>{p.rating !== undefined ? `DUPR ${p.rating}` : p.strength ? p.strength : ''}</span>
          </div>
        ))}
        <div className="kv"><span>Format</span><span>{formatLabel(match.format)}</span></div>
      </section>

      {match.games.length > 0 && (
        <section className="card" aria-label="Games">
          {match.games.map((g, i) => (
            <div className="kv" key={i}>
              <span>{match.games.length > 1 ? `Game ${i + 1}: ` : ''}{g.you}–{g.them}</span>
              <span>{momentumLabel(g) ?? ''}</span>
            </div>
          ))}
        </section>
      )}

      {match.status === 'complete' && !match.backfilled && (
        <section className="card" aria-label="Details">
          <div className="kv"><span>Energy</span><span>{match.energy ?? '—'}</span></div>
          <div className="kv"><span>Venue</span><span>{[match.venue, match.setting].filter(Boolean).join(' · ') || '—'}</span></div>
          <div className="kv" style={{ display: 'block' }}>
            <div>Tags</div>
            {tags.length ? (
              <div className="meta" style={{ marginTop: 6 }}>
                {tags.map(([t, v]) => <span key={t} className={`pill ${v === 'went-well' ? 'pill-ok' : 'pill-warn'}`}>{v === 'went-well' ? '+ ' : '− '}{t}</span>)}
              </div>
            ) : <div className="small muted">None</div>}
          </div>
          {match.shotRatings && Object.keys(match.shotRatings).length > 0 && (
            <div className="kv" style={{ display: 'block' }}>
              <div>Shot ratings <span className="pill pill-warn">Your estimate</span></div>
              <div className="small muted">{Object.entries(match.shotRatings).map(([k, v]) => `${k} ${v}/5`).join(' · ')}</div>
            </div>
          )}
          {match.notes && <div className="kv" style={{ display: 'block' }}><div>Notes</div><div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{match.notes}</div></div>}
        </section>
      )}

      <div className="sticky-actions" style={{ position: 'static' }}>
        <button type="button" className="btn btn-outline" onClick={() => go('edit', match.id)}>Edit match</button>
        <button type="button" className="btn btn-outline" onClick={() => go('details', match.id)}>Edit details</button>
      </div>

      {match.history.length > 0 && (
        <section className="card">
          <button type="button" className="link-btn" aria-expanded={showHistory} onClick={() => setShowHistory((s) => !s)}>
            Edit history ({match.history.length})
          </button>
          {showHistory && [...match.history].reverse().map((h, i) => (
            <div key={i} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
              <div className="small muted">{new Date(h.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
              {h.changes.map((c, j) => <div key={j} className="small"><b>{c.field}:</b> {c.from} → {c.to}</div>)}
            </div>
          ))}
        </section>
      )}

      {confirming ? (
        <div className="card section">
          <div>Move this match to Trash? You can restore it for 30 days.</div>
          <div className="sticky-actions" style={{ position: 'static' }}>
            <button type="button" className="btn btn-outline" onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={async () => { await moveToTrash(match.id); go('matches', undefined, { replace: true }); }}>Move to Trash</button>
          </div>
        </div>
      ) : (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirming(true)}>Delete match</button>
      )}
    </main>
  );
}
