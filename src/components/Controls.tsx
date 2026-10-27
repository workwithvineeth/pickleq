import type { ReactNode } from 'react';

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Chips<T extends string | number>({ label, value, options, onChange, small }: {
  label: string; value: T | null | undefined; options: { value: T; label: string }[]; onChange: (v: T) => void; small?: boolean;
}) {
  return (
    <div className={`chips${small ? ' strength' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="section">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

export function Stepper({ label, value, onChange, min = 0, max = 30 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Lower ${label.toLowerCase()} score`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className="val"><span className="label">{label}</span><b>{value}</b></span>
      <button type="button" aria-label={`Raise ${label.toLowerCase()} score`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

export function NumberGrid({ max, selected, onPick, label }: { max: number; selected: number | null; onPick: (n: number) => void; label: string }) {
  return (
    <div className="numgrid" role="group" aria-label={label}>
      {Array.from({ length: max + 1 }, (_, n) => (
        <button key={n} type="button" className="num" aria-pressed={selected === n} onClick={() => onPick(n)}>{n}</button>
      ))}
    </div>
  );
}
