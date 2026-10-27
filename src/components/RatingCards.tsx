import { useLiveQuery } from 'dexie-react-hooks';
import { ratingHistory } from '../db/ratings';
import type { RatingKind } from '../domain/types';
import type { Go } from '../navigation';
import { Sparkline } from './Sparkline';

function Card({ kind, go }: { kind: RatingKind; go: Go }) {
  const hist = useLiveQuery(() => ratingHistory(kind), [kind]);
  const label = kind === 'singles' ? 'Singles rating' : 'Doubles rating';
  const color = kind === 'singles' ? 'var(--chart-2)' : 'var(--chart-1)';
  const recent = (hist ?? []).slice(-10);
  const current = recent.at(-1)?.value;
  const delta = recent.length > 1 ? Math.round((recent[recent.length - 1].value - recent[0].value) * 100) / 100 : null;
  return (
    <button type="button" className="rating-card" onClick={() => go('ratings')} aria-label={`${label}: ${current ?? 'not set'}. Open rating history`}>
      <span className="small muted">{label} · DUPR</span>
      {current === undefined ? (
        <span className="small" style={{ color: 'var(--accent)', marginTop: 6 }}>Add your rating ›</span>
      ) : (
        <>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600 }}>{current.toFixed(2)}</span>
            {delta !== null && delta !== 0 && <span className={delta > 0 ? 'delta-up' : 'delta-down'}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}</span>}
          </span>
          <Sparkline values={recent.map((r) => r.value)} color={color} label={`${label} trend over the last ${recent.length} readings`} />
          <span className="small muted">last {recent.length} {recent.length === 1 ? 'reading' : 'readings'}</span>
        </>
      )}
    </button>
  );
}

export function RatingCards({ go }: { go: Go }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
      <Card kind="singles" go={go} />
      <Card kind="doubles" go={go} />
    </div>
  );
}
