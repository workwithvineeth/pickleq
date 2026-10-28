import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import type { ClubBackend } from '../backend';
import type { ClubPlayer, Entry } from '../types';
import { ROLE_LABEL, type Role } from '../types';

export interface Loaded<T> { data: T | null; error: string | null; loading: boolean; reload: () => void }

/** Loads data from the club backend, with an error message a person can read and a reload. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current().then(
      (data) => { if (alive) setState({ data, error: null, loading: false }); },
      (e: unknown) => { if (alive) setState({ data: null, error: e instanceof Error ? e.message : 'Something went wrong', loading: false }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function Header({ title, onBack, right, id }: { title: string; onBack?: () => void; right?: ReactNode; id: string }) {
  return (
    <header className="header">
      {onBack && (
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}>
          <Icon name="back" size={20} />
        </button>
      )}
      <h1 id={id} className="screen-title" style={{ flex: 1 }}>{title}</h1>
      {right}
    </header>
  );
}

export function Status({ error, loading }: { error: string | null; loading?: boolean }) {
  if (error) return <div role="alert" className="msg msg-bad">{error}</div>;
  if (loading) return <p className="small muted" role="status">Loading…</p>;
  return null;
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`pill${role === 'player' ? '' : ' pill-ok'}`}>{ROLE_LABEL[role]}</span>;
}

export function DemoNote({ b }: { b: ClubBackend | null }) {
  if (b?.kind !== 'demo') return null;
  return <div className="notice notice-warn small">Demo club on this phone. Nothing here is sent anywhere, and the names are made up.</div>;
}

export function names(ids: string[], players: Map<string, ClubPlayer>): string {
  return ids.map((id) => players.get(id)?.name ?? 'Unknown').join(' / ');
}

export function entryLabel(e: Entry | undefined, players: Map<string, ClubPlayer>): string {
  return e ? names(e.playerIds, players) : 'To be decided';
}

export function fmtRating(r: number | undefined): string { return r === undefined ? '–' : r.toFixed(2); }

export function errorText(e: unknown): string { return e instanceof Error ? e.message : 'Something went wrong'; }

/** Shares a link with the phone's share sheet, or copies it. Returns what happened, for a status message. */
export async function shareLink(title: string, url: string): Promise<string> {
  try {
    if (navigator.share) { await navigator.share({ title, url }); return 'Shared'; }
  } catch { /* cancelled or not allowed: fall back to copy */ }
  try { await navigator.clipboard.writeText(url); return 'Link copied'; } catch { return url; }
}

/** Absolute link to a screen in this app, for sharing. */
export function appLink(hash: string): string {
  return `${window.location.origin}${window.location.pathname}${hash}`;
}
