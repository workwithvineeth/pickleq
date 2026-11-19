import { useCallback, useEffect, useRef, useState } from 'react';
import { useWakeLock } from '../useWakeLock';
import { blockUnsentIf, clearUnsentIf, queueScoreSend, isPermanentScoreError, readBlocked, readUnsent, unblock, writeUnsent } from '../matchdaySafety';
import { report, track } from '../../monitoring/monitoring';
import { isOnline } from '../useConnection';
import { OfflineBanner } from './OfflineBanner';
import type { Format } from '../../domain/types';
import type { ScorePatch } from '../backend';
import { matchResult } from '../domain/engine';
import { analyseGame, checkFinalScore, gameOver, isGoldenPoint, leadThreshold, tally } from '../domain/momentum';
import type { ClubGame, ScoringMode, Thresholds } from '../types';
import { replaySideOut, type Side } from '../domain/sideout';

export { readUnsent, writeUnsent };

function rememberUnsent(key: string, patch: ScorePatch | null) {
  const u = readUnsent();
  if (patch) u[key] = patch; else delete u[key];
  writeUnsent(u);
}

function withTally(points: string): ClubGame { const t = tally(points); return { points, a: t.a, b: t.b }; }
/** A rally-scored game: every rally is a point, so the rally list is the point list. */
function rallyGame(points: string): ClubGame { return { ...withTally(points), rallies: points, mode: 'rally' }; }
/** A side-out game replayed from its rallies and who served first. */
function sideOutGame(rallies: string, serve: Side | undefined, doubles: boolean): ClubGame {
  if (!serve) return { points: '', a: 0, b: 0, rallies: '', mode: 'sideout' };
  const s = replaySideOut(rallies, serve, doubles);
  return { points: s.points, a: s.a, b: s.b, rallies, mode: 'sideout', serve };
}
type PadMode = ScoringMode | 'manual';
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
  /** Doubles (two servers a side) or singles, for side-out scoring. Default doubles. */
  doubles?: boolean;
}

/**
 * The court scoring pad: one tap per point, undo, golden point or win by 2, best of 1 or 3.
 * Saves shortly after each tap; with no signal, keeps the score on this phone and keeps retrying.
 */
export function ScorePad(p: ScorePadProps) {
  const { format: fmt, nameA, nameB, matchKey, send } = p;
  useWakeLock();
  const [games, setGames] = useState<ClubGame[]>(() => {
    const start = readUnsent()[matchKey]?.games ?? readBlocked()[matchKey]?.patch.games ?? p.initialGames;
    return start.length ? start : [{ points: '', a: 0, b: 0 }];
  });
  const [sync, setSync] = useState<'saved' | 'saving' | 'unsent'>(() => (readUnsent()[matchKey] ? 'unsent' : 'saved'));
  const [msg, setMsg] = useState<string | null>(null);
  // A score the server refused for good (wrong PIN, match moved or cancelled): kept on the phone, never retried by itself.
  const [blocked, setBlockedState] = useState<string | null>(() => readBlocked()[matchKey]?.reason ?? null);
  const blockedRef = useRef<string | null>(blocked);
  const setBlocked = (r: string | null) => { blockedRef.current = r; setBlockedState(r); };
  const doubles = p.doubles ?? true;
  // How this match is scored: from the games already saved, else the event's scoring set by the organiser (side-out unless
  // they chose rally scoring). The referee can change it before the first rally.
  const [mode, setModeState] = useState<ScoringMode>(() => {
    const g = (readUnsent()[matchKey]?.games ?? readBlocked()[matchKey]?.patch.games ?? p.initialGames).find((x) => x.mode);
    return g?.mode ?? (fmt.scoring === 'rally' ? 'rally' : 'sideout');
  });
  const [manual, setManual] = useState(false);
  const setMode = (m: PadMode) => {
    if (m === 'manual') { setManual(true); return; }
    setManual(false); setModeState(m);
  };
  const [busy, setBusy] = useState(false);
  const frozen = busy || !!blocked;
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<ScorePatch | null>(readUnsent()[matchKey] ?? null);

  // Queue with court-list retries too, reading the newest score only when our turn starts.
  const push = useCallback((): Promise<boolean> => queueScoreSend(matchKey, async () => {
    const patch = readUnsent()[matchKey];
    latest.current = patch ?? null;
    if (!patch) {
      const refused = readBlocked()[matchKey];
      if (refused) { setBlocked(refused.reason); return false; }
      setSync('saved');
      return true;
    }
    if (blockedRef.current) return false;
    setSync('saving');
    try {
      await send(patch);
      clearUnsentIf(matchKey, patch);
      latest.current = readUnsent()[matchKey] ?? null;
      setSync(latest.current ? 'unsent' : 'saved');
      return true;
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'The score was refused';
      if (isPermanentScoreError(e) && blockUnsentIf(matchKey, patch, reason)) {
        window.clearTimeout(timer.current);
        latest.current = null;
        setBlocked(reason);
        track('score_refused'); report('Score refused for good: ' + reason);
      }
      // A late failure belongs to its attempted patch, never to the referee's newer taps.
      setSync('unsent');
      return false;
    }
  }), [send, matchKey]);

  // Keep retrying anything unsent: when the phone comes back online, and every 10 seconds.
  useEffect(() => {
    const retry = () => { if (latest.current && !blockedRef.current) void push(); };
    window.addEventListener('online', retry);
    const h = window.setInterval(() => { if (isOnline()) retry(); }, 10000);
    return () => { window.removeEventListener('online', retry); window.clearInterval(h); };
  }, [push]);

  // Leaving the screen: send what's pending straight away.
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (latest.current && latest.current.status !== 'done' && !blockedRef.current) void push();
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
    timer.current = window.setTimeout(() => { void push(); }, 600);
  }
  const started = games.some((g) => g.points.length || g.a || g.b || g.rallies);
  const sideOut = mode === 'sideout';
  const so = sideOut && cur.serve ? replaySideOut(cur.rallies ?? '', cur.serve, doubles) : null;
  const needServe = sideOut && !cur.serve && !curOver && !matchOver;
  const rallyCount = (g: ClubGame) => (g.rallies ?? g.points).length;
  const point = (side: Side) => {
    if (curOver || matchOver || frozen || (sideOut && !cur.serve)) return;
    try {
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(10);
    } catch { /* Haptics are optional; a blocked device API must never prevent scoring. */ }
    if (sideOut) { if (cur.serve) update([...games.slice(0, -1), sideOutGame((cur.rallies ?? '') + side, cur.serve, doubles)]); return; }
    update([...games.slice(0, -1), rallyGame(cur.points + side)]);
  };
  const firstServe = (side: Side) => update([...games.slice(0, -1), sideOutGame('', side, doubles)]);
  /** Drops the last rally (side-out) or point; at the start of a game it goes back into the previous one. */
  const back = (g: ClubGame): ClubGame => (g.mode === 'sideout' ? sideOutGame((g.rallies ?? '').slice(0, -1), g.serve, doubles) : g.mode === 'rally' ? rallyGame(g.points.slice(0, -1)) : withTally(g.points.slice(0, -1)));
  const undo = () => {
    if (rallyCount(cur) === 0 && cur.a === 0 && cur.b === 0) {
      if (cur.mode === 'sideout' && cur.serve) { update([...games.slice(0, -1), sideOutGame('', undefined, doubles)]); return; }
      if (games.length > 1) {
        const previous = games[games.length - 2];
        if (rallyCount(previous)) update([...games.slice(0, -2), back(previous)]);
      }
      return;
    }
    update([...games.slice(0, -1), back(cur)]);
  };
  const canUndo = rallyCount(cur) > 0 || (cur.mode === 'sideout' && !!cur.serve) || (cur.a === 0 && cur.b === 0 && rallyCount(games[games.length - 2] ?? { points: '', a: 0, b: 0 }) > 0);

  async function finish(final: ClubGame[]) {
    const r = matchResult({ games: final, format: fmt });
    if (!r.winner) return setMsg('The match isn’t finished yet');
    setBusy(true);
    window.clearTimeout(timer.current);
    const patch: ScorePatch = { games: final, status: 'done', winner: r.winner, playedOn: p.playedOn ?? today() };
    latest.current = patch;
    rememberUnsent(matchKey, patch);
    const ok = await push();
    setBusy(false);
    if (!ok) return setMsg(blockedRef.current ? 'This result can’t be sent. Show this screen to the desk.' : 'No connection. The result is saved on this phone and will be sent automatically. Keep this screen open until it says Saved.');
    await p.onFinished();
  }

  const lead = cur.a - cur.b;
  const thr = leadThreshold(fmt.pointsTo, p.thresholds);
  const gp = !curOver && !golden && (cur.a >= fmt.pointsTo - 1 && cur.a > cur.b ? 'A' : cur.b >= fmt.pointsTo - 1 && cur.b > cur.a ? 'B' : null);
  const done = games.map((g, i) => ({ g, i, an: g.points ? analyseGame(g.points, fmt.pointsTo, p.thresholds, !!fmt.golden) : null }))
    .filter((x) => gameOver(x.g.a, x.g.b, fmt.pointsTo, !!fmt.golden));
  // UX-04 copy: points kept on the phone are "Saved on this device"; while they go out, "Syncing points…".
  const status = sync === 'saving' ? 'Syncing points…' : sync === 'unsent' ? 'Saved on this device' : 'Saved';

  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        Game {games.length} · {formatRule(fmt)} · <span role="status" className={sync === 'unsent' ? 'pill pill-warn' : undefined}>{status}</span>
      </p>
      {p.canScore && <OfflineBanner hideBlocked />}
      {blocked && (
        <div role="alert" className="msg msg-bad pq-blocked-bar">
          <b>This score can’t be sent. Show this screen to the desk.</b>
          <span className="small" style={{ display: 'block' }}>{blocked}</span>
          <span className="small" style={{ display: 'block' }}>The score is kept on this phone. Once the desk has sorted it out, try again.</span>
          <button type="button" className="btn btn-outline" onClick={() => { unblock(matchKey); const kept = readUnsent()[matchKey]; latest.current = kept ?? latest.current; setBlocked(null); void push(); }}>Try sending again</button>
        </div>
      )}
      {fmt.bestOf > 1 && <p className="small" style={{ margin: 0 }}>Games: {nameA} {result.gamesA} – {result.gamesB} {nameB}</p>}
      {p.canScore && !matchOver && !started && (
        <div className="seg seg-wrap pq-scoring-mode" role="group" aria-label="How are you scoring?">
          {([['sideout', 'Side-out scoring'], ['rally', 'Rally scoring'], ['manual', 'Final scores only']] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={v === 'manual' ? manual : !manual && mode === v} onClick={() => setMode(v)}>{label}</button>
          ))}
        </div>
      )}
      {p.canScore && !manual && (
        <p className="small muted" style={{ margin: 0 }}>
          {sideOut ? `Side-out scoring: only the serving side scores${doubles ? '; each side has two servers, and each game starts at 0-0-2' : ''}. Tap the team that wins each rally.` : 'Rally scoring: every rally is a point. Tap the team that wins it.'}
        </p>
      )}
      {!manual && p.canScore && needServe && (
        <section className="card section" aria-label="First serve">
          <b>Who serves first in game {games.length}?</b>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" onClick={() => firstServe('A')}>{nameA}</button>
            <button type="button" className="btn btn-outline" onClick={() => firstServe('B')}>{nameB}</button>
          </div>
        </section>
      )}
      {!manual && p.canScore && !needServe && (
        <>
          {so && !curOver && <p role="status" className="pq-serve-call" style={{ margin: 0, fontWeight: 800, fontSize: 22 }} aria-label={`Score call ${so.call}. ${so.serving === 'A' ? nameA : nameB} serving${doubles ? `, server ${so.server}` : ''}`}>{so.call} <span className="small muted" style={{ fontWeight: 600 }}>· {so.serving === 'A' ? nameA : nameB} serving{doubles ? ` · server ${so.server}` : ''}</span></p>}
          <div className="score-grid rq-ref-grid">
            <button type="button" className="score-tap score-tap-a" aria-label={sideOut ? `Rally to ${nameA}` : `Point to ${nameA}`} onClick={() => point('A')} disabled={curOver || matchOver || frozen}>
              <span className="small pq-referee-name">{nameA}{so?.serving === 'A' && !curOver ? ' · serving' : ''}</span>
              <span className="big">{cur.a}</span>
              <span className="small muted">{sideOut ? 'Tap when this team wins the rally' : 'Tap when this team wins the point'}</span>
            </button>
            {(golden || gp) && <div role="status" className="pq-gamepoint-strip">{golden ? "GOLDEN POINT" : "GAME POINT"}<small>{golden ? "Golden point · next point wins" : "Game point: " + (gp === "A" ? nameA : nameB)}</small></div>}
            <button type="button" className="score-tap score-tap-b" aria-label={sideOut ? `Rally to ${nameB}` : `Point to ${nameB}`} onClick={() => point('B')} disabled={curOver || matchOver || frozen}>
              <span className="small pq-referee-name">{nameB}{so?.serving === 'B' && !curOver ? ' · serving' : ''}</span>
              <span className="big">{cur.b}</span>
              <span className="small muted">{sideOut ? 'Tap when this team wins the rally' : 'Tap when this team wins the point'}</span>
            </button>
          </div>
          <p className={`small pq-referee-lead${gp ? ' pq-gamepoint' : ''}`} style={{ margin: 0, minHeight: 20 }} aria-live="polite">
            {!gp && !golden && Math.abs(lead) >= thr ? `${lead > 0 ? nameA : nameB} lead by ${Math.abs(lead)}` : ''}
          </p>
          {curOver && !matchOver && <div role="status" className="rq-ref-banner rq-ref-game"><b>Game {games.length} won · match goes on</b><span>{cur.a > cur.b ? nameA : nameB} take game {games.length} · games {result.gamesA}–{result.gamesB}</span></div>}
          {matchOver && <div role="status" className="rq-ref-banner rq-ref-match"><b>Confirm final score</b><span>Check the score before saving the result.</span><span>{result.winner === 'A' ? nameA : nameB} win {result.gamesA}–{result.gamesB} in games · {games.map((g) => `${g.a}–${g.b}`).join(', ')}</span></div>}
          <div className="sticky-actions" style={{ position: 'static' }}>
            <button type="button" className="btn btn-outline" onClick={undo} disabled={frozen || !canUndo}>{matchOver ? 'Back to scoring' : 'Undo last point'}</button>
            {curOver && !matchOver && <button type="button" className="btn btn-primary" onClick={() => update([...games, sideOut ? sideOutGame('', undefined, doubles) : { points: '', a: 0, b: 0 }])}>Start game {games.length + 1}</button>}
            {matchOver && <button type="button" className="btn btn-primary" disabled={frozen} onClick={() => finish(games)}>Confirm final score</button>}
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
      {!manual && p.canScore && needServe && (
        <div className="sticky-actions" style={{ position: 'static' }}>
          <button type="button" className="btn btn-outline" onClick={undo} disabled={frozen || !canUndo}>Undo last point</button>
        </div>
      )}
      {manual && p.canScore && <ManualScores format={fmt} nameA={nameA} nameB={nameB} onSave={finish} onCancel={() => setManual(false)} busy={frozen} />}
      {!manual && p.canScore && !matchOver && <button type="button" className="link-btn pq-manual-score-link" style={{ alignSelf: 'flex-start' }} onClick={() => setManual(true)}>Enter final scores instead</button>}
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <p className="small muted" style={{ margin: 0 }}>
        Scoring point by point lets RallyQ spot comebacks and lost leads (a {thr}-point lead in games to {fmt.pointsTo}, or game point).
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
      // One empty box is not a 0 (audit 19 Nov): ask for both scores instead of saving 0.
      if (!r.a || !r.b) return setMsg(`Game ${i + 1}: enter both scores (type 0 if a side scored none)`);
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
