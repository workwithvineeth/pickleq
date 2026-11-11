import { useMemo, type ReactNode } from 'react';
import { scopedCSS } from '../../rallyq/PrototypeScreen';
import { clubMark, ModeButton, QMark, Signoff, useDay } from '../../rallyq/shell/Shell';
import raw from '../../rallyq/shell/v12.css?raw';
import type { Go } from '../../navigation';
import { OrgShell, type OrgTab } from '../../rallyq/shell/Shell';
import type { ClubBackend, TournamentBundle } from '../backend';
import { useDesk } from './deskContext';

const CSS = scopedCSS(raw).replaceAll('%BASE%', import.meta.env.BASE_URL);

/**
 * The v1.2 look for pages opened without an account (the desk link): the club on top, RallyQ small and last,
 * and no organiser side menu. Same styles as the shell (src/rallyq/shell).
 */
export function DeskFrame({ clubName, children }: { clubName?: string; children: ReactNode }) {
  const day = useDay();
  const style = useMemo(() => <style>{CSS}</style>, []);
  return (
    <div className="rallyq-prototype rq-v12">
      {style}
      <div className={day ? 'rq day' : 'rq'} style={{ minHeight: '100vh' }}>
        <QMark className="wm motif" ink="rgba(241,244,234,.07)" accent="rgba(217,242,74,.55)" />
        <header className="hdr">
          <div className="wrap">
            {clubName
              ? <span className="host"><span className="tile">{clubMark(clubName)}</span><span><span className="cap">Hosted by</span><b>{clubName}</b></span></span>
              : <span className="host"><span><span className="cap">Tournament desk</span></span></span>}
            <div className="right" style={{ display: 'flex' }}><ModeButton /></div>
          </div>
        </header>
        <main className="wrap" style={{ paddingBlock: '12px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>{children}</main>
        <div className="wrap pfoot"><span /><Signoff text="Run on" /></div>
      </div>
    </div>
  );
}

/** A set of choices drawn as v1.2 tabs; a group of buttons, so the pressed one is announced. */
export function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" className={o.value === value ? 'tab on' : 'tab'} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function DemoBar({ b }: { b: ClubBackend | null }) {
  if (b?.kind !== 'demo') return null;
  return <div className="note">Demo club. Sample players and scores. Nothing is shared.</div>;
}

/** A message after an action: plain words, never colour alone. */
export function Say({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <div role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'note' : 'warn'}>{msg.text}</div>;
}

/** Visually hidden text that screen readers still read. */
export const VH = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

/** The frame of a match-day screen: the organiser shell for a signed-in organiser, the plain desk frame inside a desk link. */
export function MatchdayShell({ go, active, d, children }: { go: Go; active: OrgTab; d?: TournamentBundle | null; children: ReactNode }) {
  const desk = useDesk();
  if (desk) return <DeskFrame clubName={d?.club.name}>{children}</DeskFrame>;
  const t = d?.tournament;
  return <OrgShell go={go} active={active} clubName={d?.club.name} clubId={t?.clubId} tournament={t ? { id: t.id, name: t.name, slug: t.publicSlug || undefined } : undefined}>{children}</OrgShell>;
}

/** The two match-day tabs of "Referees & results" (prototype RefLinks). */
export function RefTabs({ go, id, on }: { go?: Go; id: string; on: 'links' | 'results' }) {
  if (!go) return null;
  return (
    <div className="tabs" role="group" aria-label="Referees and results">
      <button type="button" className={on === 'links' ? 'tab on' : 'tab'} aria-pressed={on === 'links'} onClick={() => go('club-scorers', id)}>Referee links</button>
      <button type="button" className={on === 'results' ? 'tab on' : 'tab'} aria-pressed={on === 'results'} onClick={() => go('club-results-dupr', id)}>Results &amp; DUPR</button>
    </div>
  );
}

