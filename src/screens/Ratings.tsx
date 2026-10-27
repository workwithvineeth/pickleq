import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { shortDate } from '../components/MatchRow';
import { addRating, checkRatingValue, deleteRating, ratingHistory } from '../db/ratings';
import type { RatingKind } from '../domain/types';

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function Ratings({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<RatingKind>('doubles');
  const history = useLiveQuery(() => ratingHistory(kind), [kind]) ?? [];
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function save() {
    const v = checkRatingValue(value);
    if (typeof v === 'string') return setMsg({ ok: false, text: v });
    await addRating(kind, v, date);
    setValue('');
    setMsg({ ok: true, text: `Saved ${kind} rating ${v.toFixed(3)}.` });
  }

  const newest = [...history].reverse();
  return (
    <main className="screen" aria-labelledby="ratings-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="ratings-title" className="screen-title" style={{ flex: 1 }}>DUPR ratings</h1>
      </header>
      <p className="small muted" style={{ margin: 0 }}>Copy your rating from the DUPR app whenever it changes. PICKLEQ never calculates or changes ratings.</p>
      <Segmented label="Rating type" value={kind} onChange={(k) => { setKind(k); setMsg(null); }}
        options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} />

      <section className="card section" aria-label="Add a rating">
        <div className="person" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
          <div>
            <label className="label" htmlFor="rt-value">New {kind} rating</label>
            <input id="rt-value" className="input" inputMode="decimal" placeholder="3.825" value={value} onChange={(e) => { setValue(e.target.value); setMsg(null); }} />
          </div>
          <div>
            <label className="label" htmlFor="rt-date">As of</label>
            <input id="rt-date" className="input" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={save}>Save rating</button>
        {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      </section>

      <section className="card" aria-label={`${kind} rating history`}>
        <h2 style={{ fontSize: 18, marginBottom: 6 }}>History</h2>
        {newest.length === 0 && <p className="small muted" style={{ margin: 0 }}>No {kind} ratings yet.</p>}
        {newest.map((r, i) => {
          const prev = newest[i + 1];
          const d = prev ? Math.round((r.value - prev.value) * 1000) / 1000 : null;
          return (
            <div key={r.id} className="kv" style={{ alignItems: 'center' }}>
              <span>
                <b style={{ fontWeight: 600 }}>{r.value.toFixed(3)}</b>{' '}
                {d !== null && d !== 0 && <span className={d > 0 ? 'delta-up' : 'delta-down'}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(3)}</span>}
                <span className="small muted" style={{ display: 'block' }}>{shortDate(r.date)} · from DUPR</span>
              </span>
              {confirmId === r.id ? (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="link-btn" onClick={() => setConfirmId(null)}>Keep</button>
                  <button type="button" className="link-btn" onClick={async () => { await deleteRating(r.id); setConfirmId(null); }}>Delete</button>
                </span>
              ) : (
                <button type="button" className="link-btn" aria-label={`Remove rating ${r.value.toFixed(3)} from ${shortDate(r.date)}`} onClick={() => setConfirmId(r.id)}>Remove</button>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
