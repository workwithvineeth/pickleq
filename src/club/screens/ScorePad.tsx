import { useCallback, useEffect, useRef, useState } from 'react';
import type { Format } from '../../domain/types';
import type { ScorePatch } from '../backend';
import { matchResult } from '../domain/engine';
import { analyseGame, checkFinalScore, gameOver, isGoldenPoint, leadThreshold, tally } from '../domain/momentum';
import type { ClubGame, Thresholds } from '../types';

const UNSENT = 'pq-club-unsent-scores';

/** Scores saved on this phone that haven't reached the club server yet, keyed by match. */
export function readUnsent(): Record<string, ScorePatch> {
  try { return JSON.parse(localStorage.getItem(UNSENT) ?? '{}') as Record<string, ScorePatch>; } catch { return {}; }
}
export function writeUnsent(v: Record<string, ScorePatch>) {
  try { if (Object.keys(v).length) localStorage.setItem(UNSENT, JSON.stringify(v)); else localStorage.removeItem(UNSENT); } catch { /* storage blocked */ }
}
function rememberUnsent(key: string, patch: ScorePatch | null) {
  const u = readUnsent();
  if (patch) u[key] = patch; else delete u[key];
  writeUnsent(u);
}

function withTally(points: string): ClubGame { const t = tally(points); return { points, a: t.a, b: t.b }; }
const today = () => new Date().toISOString().slice(0, 10);

export function formatRule(f: Format): string {
  return `${f.bestOf > 1 ? 'Best of 3' : 'One game'} to ${f.pointsTo} · ${f.golden ? `golden point at ${f.pointsTo - 1}–${f.pointsTo - 1}` : 'win by 2'}`;
}

export interface ScorePadProps {
  /** Unique key for this match, used to keep unsent scores on the phone. */
  matchKey: string;
  initialGames: ClubGame[];
  format: Format;
  nameA: string;
  nameB: string;
  thresholds?: Thresholds;
  playedOn?: string;
  /** Saves a score to the club. Must throw if it didn't reach the server. */
  send: (patch: ScorePatch) => Promise<void>;
  /** Called after the final result has been sent. */
  onFinished: () => void | Promise<void>;
  canScore: boolean;
}

/**
 * The court scoring pad: one tap per point, undo, golden point or win by 2, best of 1 or 3.
 * Saves shortly after each tap; with no signal, keeps the score on this phone and keeps retrying.
 */
export function ScorePad(p: ScorePadProps) {
  const { format: fmt, nameA, nameB, matchKey, send } = p;
  const [games, setGames] = useState<ClubGame[]>(() => {
    const start = readUnsent()[matchKey]?.games ?? p.initialGames;
    return start.length ? start : [{ points: '', a: 0, b: 0 }];
  });
  const [sync, setSync] = useState<'saved' | 'saving' | 'unsent'>(() => (readUnsent()[matchKey] ? 'unsent' : 'saved'));
  const [msg, setMsg] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<ScorePatch | null>(readUnsent()[matchKey] ?? null);

  const push = useCallback(async (patch: ScorePatch): Promise<boolean> => {
    setSync('saving');
    try {
      await send(patch);
      if (latest.current === patch) latest.current = null;
      rememberUnsent(matchKey, null);
      setSync('saved');
      return true;
    } catch {
      rememberUnsent(matchKey, patch);
      setSync('unsent');
      return false;
    }
  }, [send, matchKey]);

  // Keep retrying anything unsent: when the phone comes back online, and every 10 seconds.
  useEffect(() => {
    const retry = () => { if (latest.current) void push(latest.current); };
    window.addEventListener('online', retry);
    const h = window.setInterval(() => { if (latest.current && navigator.onLine !== false) retry(); }, 10000);
    return () => { window.removeEventListener('online', retry); window.clearInterval(h); };
  }, [push]);

  // Leaving the screen: send what's pending straight away.
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (latest.current && latest.current.status !== 'done') void push(latest.current);
  }, [push]);

  const result = matchResult({ games, format: fmt });
  const cur = games[games.length - 1];
  const curOver = gameOver(cur.a, cur.b, fmt.pointsTo, !!fmt.golden);
  const matchOver = !!result.winner;
  const golden = !curOver && isGoldenPoint(cur.a, cur.b, fmt.pointsTo, !!fmt.golden);

  function update(next: ClubGame[]) {
    setGames(next);
    setMsg(null);
    const patch: ScorePatch = { games: next, status: 'live', playedOn: p.playedOn ?? today() };
    latest.current = patch;
    rememberUnsent(matchKey, patch);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void push(patch); }, 600);
  }
  const point = (side: 'A' | 'B') => { if (!curOver && !matchOver) update([...games.slice(0, -1), withTally(cur.points + side)]); };
  const undo = () => {
    if (cur.points.length === 0 && games.length > 1) return update(games.slice(0, -1));
    if (cur.points.length) update([...games.slice(0, -1), withTally(cur.points.slice(0, -1))]);
  };

  async function finish(final: ClubGame[]) {
    const r = matchResult({ games: final, format: fmt });
    if (!r.winner) return setMsg('The match isn’t finished yet');
    setBusy(true);
    window.clearTimeout(timer.current);
    const patch: ScorePatch = { games: final, status: 'done', winner: r.winner, playedOn: p.playedOn ?? today() };
    latest.current = patch;
    rememberUnsent(matchKey, patch);
    const ok = await push(patch);
    setBusy(false);
    if (!ok) return setMsg('No connection. The result is saved on this phone and will be sent automatically. Keep this screen open until it says Saved.');
    await p.onFinished();
  }

  const lead = cur.a - cur.b;
  const thr = leadThreshold(fmt.pointsTo, p.thresholds);
  const gp = !curOver && !golden && (cur.a >= fmt.pointsTo - 1 && cur.a > cur.b ? 'A' : cur.b >= fmt.pointsTo - 1 && cur.b > cur.a ? 'B' : null);
  const done = games.map((g, i) => ({ g, i, an: g.points ? analyseGame(g.points, fmt.pointsTo, p.thresholds, !!fmt.golden) : null }))
    .filter((x) => gameOver(x.g.a, x.g.b, fmt.pointsTo, !!fmt.golden));
  const status = sync === 'saving' ? 'Saving…' : sync === 'unsent' ? 'Not sent yet · retrying' : 'Saved';

  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        Game {games.length} · {formatRule(fmt)} · <span role="status" className={sync === 'unsent' ? 'pill pill-warn' : undefined}>{status}</span>
      </p>
      {fmt.bestOf > 1 && <p className="small" style={{ margin: 0 }}>Games: {nameA} {result.gamesA} – {result.gamesB} {nameB}</p>}
      {!manual && p.canScore && (
        <>
          {golden && <div role="status" className="golden-banner">Golden point · next point wins</div>}
          <div className="score-grid">
            <button type="button" className="score-tap" aria-label={`Point to ${nameA}`} onClick={() => point('A')} disabled={curOver || matchOver || busy}>
              <span className="small">{nameA}</span>
              <span className="big">{cur.a}</span>
              <span className="small muted">Tap for a point</span>
            </button>
            <button type="button" className="score-tap" aria-label={`Point to ${nameB}`} onClick={() => point('B')} disabled={curOver || matchOver || busy}>
              <span className="small">{nameB}</span>
              <span className="big">{cur.b}</span>
              <span className="small muted">Tap for a point</span>
            </button>
          </div>
          <p className="small" style={{ margin: 0, minHeight: 20 }} aria-live="polite">
            {gp ? `Game point: ${gp === 'A' ? nameA : nameB}` : !golden && Math.abs(lead) >= thr ? `${lead > 0 ? nameA : nameB} lead by ${Math.abs(lead)}` : ''}
          </p>
          <div className="sticky-actions" style={{ position: 'static' }}>
            <button type="button" className="btn btn-outline" onClick={undo} disabled={busy || (cur.points.length === 0 && games.length === 1)}>Undo</button>
            {curOver && !matchOver && <button type="button" className="btn btn-primary" onClick={() => update([...games, { points: '', a: 0, b: 0 }])}>Start game {games.length + 1}</button>}
            {matchOver && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => finish(games)}>Save result</button>}
          </div>
        </>
      )}
      {done.length > 0 && (
        <section className="card section" aria-label="Finished games">
          {done.map(({ g, i, an }) => (
            <div key={i} className="row">
              <span>Game {i + 1}: {g.a}–{g.b}</span>
              <span className="small muted">{an ? momentumNote(an, nameA, nameB, fmt) : 'Final score only'}</span>
            </div>
          ))}
        </section>
      )}
      {manual && p.canScore && <ManualScores format={fmt} nameA={nameA} nameB={nameB} onSave={finish} onCancel={() => setManual(false)} busy={busy} />}
      {!manual && p.canScore && !matchOver && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setManual(true)}>Enter final scores instead</button>}
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <p className="small muted" style={{ margin: 0 }}>
        Scoring point by point lets PICKLEQ spot comebacks and lost leads (a {thr}-point lead in games to {fmt.pointsTo}, or game point).
      </p>
    </>
  );
}

function momentumNote(an: ReturnType<typeof analyseGame>, nameA: string, nameB: string, f: Format): string {
  if (an.momentumA === 'came-back') return `${nameA} came back from ${an.fromA}–${an.fromB}`;
  if (an.momentumB === 'came-back') return `${nameB} came back from ${an.fromB}–${an.fromA}`;
  if (an.momentumA === 'dominated') return `${nameA} in control throughout`;
  if (an.momentumB === 'dominated') return `${nameB} in control throughout`;
  if (f.golden && Math.min(an.a, an.b) === f.pointsTo - 1) return 'Decided on the golden point';
  return '';
}

export function ManualScores({ format, nameA, nameB, onSave, onCancel, busy }: { format: Format; nameA: string; nameB: string; onSave: (g: ClubGame[]) => void; onCancel: () => void; busy: boolean }) {
  const [rows, setRows] = useState<{ a: string; b: string }[]>(Array.from({ length: format.bestOf }, () => ({ a: '', b: '' })));
  const [msg, setMsg] = useState<string | null>(null);
  function save() {
    const games: ClubGame[] = [];
    for (const [i, r] of rows.entries()) {
      if (!r.a && !r.b) continue;
      const e = checkFinalScore(Number(r.a), Number(r.b), format.pointsTo, !!format.golden);
      if (e) return setMsg(`Game ${i + 1}: ${e}`);
      games.push({ points: '', a: Number(r.a), b: Number(r.b) });
    }
    if (!matchResult({ games, format }).winner) return setMsg('Those scores don’t finish the match');
    onSave(games);
  }
  const set = (i: number, k: 'a' | 'b', v: string) => setRows((x) => x.map((y, j) => (j === i ? { ...y, [k]: v.replace(/\D/g, '').slice(0, 2) } : y)));
  return (
    <section className="card section" aria-label="Final scores">
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 8, alignItems: 'center' }}>
        <span />
        <span className="small" style={{ fontWeight: 600 }}>{nameA}</span>
        <span className="small" style={{ fontWeight: 600 }}>{nameB}</span>
        {rows.map((r, i) => [
          <span key={`l${i}`} className="small">Game {i + 1}</span>,
          <input key={`a${i}`} className="input" inputMode="numeric" aria-label={`Game ${i + 1} ${nameA}`} value={r.a} onChange={(e) => set(i, 'a', e.target.value)} />,
          <input key={`b${i}`} className="input" inputMode="numeric" aria-label={`Game ${i + 1} ${nameB}`} value={r.b} onChange={(e) => set(i, 'b', e.target.value)} />,
        ])}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{formatRule(format)}. Without point-by-point scoring, comebacks and lost leads can’t be worked out for this match.</p>
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <div className="sticky-actions" style={{ position: 'static' }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>Save result</button>
      </div>
    </section>
  );
}
