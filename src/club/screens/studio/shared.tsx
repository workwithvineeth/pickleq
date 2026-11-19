import type { ReactNode } from 'react';
import type { Go } from '../../../navigation';
import type { ServerBackend } from '../../server';
import type { StudioData } from '../../playerStudio';

/** What every Player Studio section gets. */
export interface SectionProps { data: StudioData; reload: () => void; go: Go; b: ServerBackend }

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A row of choices where one is on (aria-pressed), e.g. Official | My logs. */
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/** A 1–5 estimate (tap again to clear). Used for energy and shot ratings. */
export function Rate({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void }) {
  return (
    <div className="pq-rate">
      <span className="small">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={value === n} aria-label={`${label} ${n} of 5`} onClick={() => onChange(value === n ? null : n)}>{n}</button>)}
      </div>
    </div>
  );
}

/** A labelled card with an optional action on the right. */
export function Card({ title, label, action, children }: { title: string; label?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card section" aria-label={label ?? title}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0 }}>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

/** W / L chip. */
export const Result = ({ won }: { won: boolean }) => <span className={`result ${won ? "result-w" : "result-l"}`} aria-hidden="true">{won ? 'W' : 'L'}</span>;

/** Small "Measured" / "Your estimate" tag so nobody mistakes a self-rating for a measurement. */
export const Evidence = ({ measured }: { measured: boolean }) => <span className={`pill${measured ? ' pill-ok' : ''}`}>{measured ? 'Measured' : 'Your estimate'}</span>;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
