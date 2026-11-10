// RallyQ brand pieces for the club app's sign-in and My club screens (brand guide: maroon + cream, Fraunces).
import {RallyQMark} from '../../rallyq/Brand';
import type { ReactNode } from 'react';

export const CAPTION = 'Out of the kitchen, into the stats.';

/** The Paddle Q in brand colours (cream paddle, maroon Q), for maroon backgrounds. */
export function BrandMark({size=120,label}:{size?:number;label?:string}){return <RallyQMark size={size} label={label} ink="var(--pq-logo-ink,var(--pq-ink,#F1F4EA))" accent="var(--pq-ball,#D9F24A)"/>;}

/** The big maroon welcome: court lines, the Paddle Q, the wordmark and the caption. */
export function LandingHero() {
  return (
    <header className="pq-hero">
      <span aria-hidden="true" className="pq-court" />
      <span aria-hidden="true" className="pq-court-mid" />
      <span aria-hidden="true" className="pq-court-line" />
      <BrandMark size={112} label="RallyQ logo" />
      <h1 id="signin-title" className="pq-wordmark">RallyQ</h1>
      <p className="pq-caption">{CAPTION}</p>
    </header>
  );
}

/** RallyQ's brand strip on results and live-score pages: compact, so the scores start on the first screen. Links to paddleq.in. */
export function ResultsHero({ label = 'LIVE SCORES' }: { label?: string }) {
  return (
    <a href="https://paddleq.in/" className="pq-hero pq-hero-results" aria-label={`RallyQ: ${label === 'RESULTS' ? 'tournament results' : 'live scores'}. Run your club’s tournament at paddleq.in`} style={{ textDecoration: 'none' }}>
      <span aria-hidden="true" className="pq-court" />
      <span aria-hidden="true" className="pq-court-mid" />
      <BrandMark size={52} />
      <span className="pq-hero-words">
        <span className="pq-wordmark">RallyQ</span>
        <span className="pq-caption">{CAPTION}</span>
      </span>
      <span className="pq-live-chip"><i className="pq-live-dot" aria-hidden="true" />{label}</span>
    </a>
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
        <span className="pq-flow-brand">RallyQ</span>
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
