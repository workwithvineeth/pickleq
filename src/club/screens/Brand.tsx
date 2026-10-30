// PaddleQ brand pieces for the club app's sign-in and My club screens (brand guide: maroon + cream, Fraunces).
import { Q_PATH } from '../../components/Logo';
import type { ReactNode } from 'react';
import type { Go } from '../../navigation';
import type { PublicEvent } from '../backend';
import { serverBackend } from '../index';
import { useLoad } from './common';

export const CAPTION = 'Out of the kitchen, into the stats.';

/** The Paddle Q in brand colours (cream paddle, maroon Q), for maroon backgrounds. */
export function BrandMark({ size = 120, label }: { size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 260 260" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="pq-mark">
      <g transform="rotate(-28 130 130)">
        <rect x="72" y="16" width="116" height="150" rx="54" fill="#F3EBDD" />
        <rect x="119" y="160" width="22" height="14" fill="#F3EBDD" />
        <rect x="113" y="170" width="34" height="80" rx="12" fill="#F3EBDD" fillOpacity="0.6" />
        <path transform="translate(89.75 124) scale(0.052 -0.052)" d={Q_PATH} fill="#7A1F2B" />
      </g>
      <circle cx="212" cy="54" r="24" fill="#F3EBDD" />
    </svg>
  );
}

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** The tournament to show in the hero: one live now, else the next one in the coming week. */
export function heroEvent(events: PublicEvent[], now = today()): { e: PublicEvent; live: boolean } | null {
  const live = events.find((e) => e.status === 'live' && e.startDate <= now && e.results);
  if (live) return { e: live, live: true };
  const week = new Date(`${now}T00:00:00Z`); week.setUTCDate(week.getUTCDate() + 7);
  const soon = events.filter((e) => e.status !== 'done' && e.startDate >= now && e.startDate <= week.toISOString().slice(0, 10))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return soon ? { e: soon, live: false } : null;
}

/** "LIVE · TPC Diwali Dhamaka" (opens live results) or "NEXT · … · Sun 1 Nov" (opens the event). Hidden when there's none. */
function EventChip({ go }: { go: Go }) {
  const b = serverBackend();
  const state = useLoad(async () => (b ? heroEvent(await b.publicEvents().catch(() => [])) : null), [b]);
  const h = state.data;
  if (!h) return null;
  return (
    <button type="button" className="pq-chip" onClick={() => go(h.live ? 'results' : 'event', h.e.slug)}>
      <span aria-hidden="true" className={`pq-dot${h.live ? ' pq-dot-live' : ''}`} />
      <b>{h.live ? 'LIVE' : 'NEXT'}</b>
      <span className="pq-chip-text">{h.e.name}{h.live ? '' : ` · ${dayLabel(h.e.startDate)}`}</span>
    </button>
  );
}

/** The big maroon welcome: court lines, the Paddle Q, the wordmark and the caption. */
export function LandingHero({ go }: { go: Go }) {
  return (
    <header className="pq-hero">
      <span aria-hidden="true" className="pq-court" />
      <span aria-hidden="true" className="pq-court-mid" />
      <span aria-hidden="true" className="pq-court-line" />
      <BrandMark size={112} label="PaddleQ logo" />
      <h1 id="signin-title" className="pq-wordmark">PaddleQ</h1>
      <p className="pq-caption">{CAPTION}</p>
      <EventChip go={go} />
    </header>
  );
}

/** Compact maroon header for the sign-up and code screens, with an optional 1–2–3 progress strip. */
export function FlowHeader({ title, sub, onBack, step }: { title: string; sub?: ReactNode; onBack?: () => void; step?: 1 | 2 | 3 }) {
  const steps = ['Account', 'Email code', 'Your club'];
  return (
    <header className="pq-flow">
      <div className="pq-flow-top">
        {onBack ? <button type="button" className="pq-back" aria-label="Back" onClick={onBack}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button> : <span className="pq-back-space" />}
        <span className="pq-flow-brand">PaddleQ</span>
        <span className="pq-back-space" />
      </div>
      <h1 id="signin-title" className="pq-flow-title">{title}</h1>
      {sub && <p className="pq-flow-sub">{sub}</p>}
      {step && (
        <ol className="pq-steps" aria-label={`Step ${step} of 3`}>
          {steps.map((s, i) => (
            <li key={s} className={i < step ? 'pq-step-done' : ''} aria-current={i + 1 === step ? 'step' : undefined}>
              <span aria-hidden="true" className="pq-step-bar" />
              <span className="pq-step-label">{i + 1} · {s}</span>
            </li>
          ))}
        </ol>
      )}
    </header>
  );
}

export function Arrow() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
