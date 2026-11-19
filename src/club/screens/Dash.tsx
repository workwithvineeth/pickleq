// Dashboard pieces from the Phase 3 prototypes: page intro (kicker, big title, line, main action), KPI cards, panels, list rows.
import type { ReactNode } from 'react';

export function Intro({ kicker, title, sub, action, id }: { kicker: string; title?: string; sub?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="pq-intro">
      <div style={{ minWidth: 0 }}>
        <span className="pq-kick">{kicker}</span>
        {title && <h2 id={id} style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 700, lineHeight: 1.1 }}>{title}</h2>}
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Kpi({ label, value, sub, onClick }: { label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void }) {
  const body = <>
    <span className="pq-kpi-label">{label}</span>
    {onClick && <span className="pq-kpi-arrow" aria-hidden="true">↗</span>}
    <span className="pq-kpi-value">{value}</span>
    {sub && <span className="pq-kpi-sub">{sub}</span>}
  </>;
  return onClick
    ? <button type="button" className="pq-kpi" onClick={onClick} aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}`}>{body}</button>
    : <div className="pq-kpi" role="group" aria-label={label}>{body}</div>;
}

export function Panel({ title, action, children, label }: { title: string; action?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section className="pq-panel" aria-label={label ?? title}>
      <div className="pq-panel-head"><h2>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export const MiniBtn = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => <button type="button" className="pq-mini-btn" onClick={onClick}>{children}</button>;

export type TagKind = 'live' | 'ready' | 'action' | 'plain';
export function Row({ title, sub, tag, tagKind = 'plain', onClick, right }: { title: ReactNode; sub?: ReactNode; tag?: ReactNode; tagKind?: TagKind; onClick?: () => void; right?: ReactNode }) {
  const inner = <>
    <span className="pq-lrow-main"><b>{title}</b>{sub && <span className="small">{sub}</span>}</span>
    {tag !== undefined && tag !== null && tag !== '' && <span className={`pq-tag${tagKind !== 'plain' ? ` pq-tag-${tagKind}` : ''}`}>{tag}</span>}
    {right}
  </>;
  return onClick ? <button type="button" className="pq-lrow" onClick={onClick}>{inner}</button> : <div className="pq-lrow">{inner}</div>;
}

/** Simple weekly bar chart (matches scored). */
export function Bars({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="pq-bars" aria-label={label} style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
      {data.map((d) => (
        <li key={d.label} aria-label={`${d.label}: ${d.value}`}>
          <span aria-hidden="true" style={{ height: `${Math.max(3, (d.value / max) * 120)}px` }} />
          <span aria-hidden="true">{d.label}</span>
        </li>
      ))}
    </ul>
  );
}
