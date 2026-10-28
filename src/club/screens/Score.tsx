import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newId } from '../../db/db';
import type { Go } from '../../navigation';
import type { ClubBackend, ScorePatch } from '../backend';
import { matchResult } from '../domain/engine';
import { analyseGame, gameOver, leadThreshold, tally } from '../domain/momentum';
import { backend } from '../index';
import { knockoutMatchesToAdd } from '../plan';
import { isStaff, STAGE_LABEL, type ClubGame, type ClubMatch } from '../types';
import { DemoNote, errorText, Header, names, Status, useLoad } from './common';

const UNSENT = 'pq-club-unsent-scores';

function readUnsent(): Record<string, ScorePatch> {
  try { return JSON.parse(localStorage.getItem(UNSENT) ?? '{}') as Record<string, ScorePatch>; } catch { return {}; }
}
function writeUnsent(v: Record<string, ScorePatch>) {
  try { if (Object.keys(v).length) localStorage.setItem(UNSENT, JSON.stringify(v)); else localStorage.removeItem(UNSENT); } catch { /* storage blocked */ }
}

/** Sends any scores saved while the phone had no connection. */
export async function flushUnsentScores(b: ClubBackend): Promise<number> {
  const all = readUnsent();
  let sent = 0;
  for (const [id, patch] of Object.entries(all)) {
    try { await b.saveScore(id, patch); delete all[id]; sent++; } catch { break; }
  }
  writeUnsent(all);
  return sent;
}

function withTally(points: string): ClubGame { const t = tally(points); return { points, a: t.a, b: t.b }; }

export function ScoreMatch({ matchId, onBack }: { matchId: string; go?: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => { if (!b) throw new Error('Open Club mode first'); return b.matchBundle(matchId); }, [b, matchId]);
  const d = state.data;
  const players = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  const [edited, setGames] = useState<ClubGame[] | null>(null);
  const [sync, setSync] = useState<'saved' | 'saving' | 'unsent'>('saved');
  const [msg, setMsg] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<ScorePatch | null>(null);

  // Start from what this phone hasn't sent yet, else what the club has saved.
  const games = useMemo(() => {
    if (edited) return edited;
    if (!d) return null;
    const start = readUnsent()[matchId]?.games ?? d.match.games;
    return start.length ? start : [{ points: '', a: 0, b: 0 }];
  }, [edited, d, matchId]);

  const send = useCallback(async (patch: ScorePatch) => {
    if (!b) return;
    setSync('saving');
    try {
      await b.saveScore(matchId, patch);
      const u = readUnsent(); delete u[matchId]; writeUnsent(u);
      setSync('saved');
    } catch {
      const u = readUnsent(); u[matchId] = patch; writeUnsent(u);
      setSync('unsent');
    }
  }, [b, matchId]);

  // Retry unsent scores when the connection comes back.
  useEffect(() => {
    if (!b) return;
    const retry = () => { if (latest.current && sync === 'unsent') send(latest.current); else flushUnsentScores(b).catch(() => {}); };
    window.addEventListener('online', retry);
    const h = window.setInterval(() => { if (sync === 'unsent') retry(); }, 15000);
    return () => { window.removeEventListener('online', retry); window.clearInterval(h); };
  }, [b, send, sync]);

  // Save a moment after the last tap, and straight away when leaving the screen.
  const schedule = (patch: ScorePatch) => {
    latest.current = patch;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => send(patch), 700);
  };
  useEffect(() => () => { window.clearTimeout(timer.current); if (latest.current && latest.current.status !== 'done') void send(latest.current); }, [send]);

  if (!d || !games) return <main className="screen" aria-labelledby="score-title"><Header id="score-title" title="Score" onBack={onBack} /><Status error={state.error} loading={state.loading} /></main>;
  const m = d.match;
  const staff = isStaff(d.role);
  const fmt = m.format;
  const thresholds = d.club.settings.thresholds;
  const nameA = names(m.sideA, players), nameB = names(m.sideB, players);
  const result = matchResult({ games, format: fmt });
  const cur = games[games.length - 1];
  const curOver = gameOver(cur.a, cur.b, fmt.pointsTo);
  const matchOver = !!result.winner;
  const title = m.stage === 'friendly' ? 'Club match' : `${d.divisionName ?? ''} ${STAGE_LABEL[m.stage]}`.trim();

  function update(next: ClubGame[]) {
    setGames(next);
    setMsg(null);
    schedule({ games: next, status: 'live', playedOn: m.playedOn ?? new Date().toISOString().slice(0, 10) });
  }
  const point = (side: 'A' | 'B') => {
    if (curOver || matchOver) return;
    update([...games.slice(0, -1), withTally(cur.points + side)]);
  };
  const undo = () => {
    if (cur.points.length === 0 && games.length > 1) { update(games.slice(0, -1)); return; }
    if (cur.points.length) update([...games.slice(0, -1), withTally(cur.points.slice(0, -1))]);
  };
  const nextGame = () => update([...games, { points: '', a: 0, b: 0 }]);

  async function finish(final: ClubGame[]) {
    if (!b) return;
    const r = matchResult({ games: final, format: fmt });
    if (!r.winner) return setMsg('The match isn’t finished yet');
    window.clearTimeout(timer.current);
    latest.current = null;
    const patch: ScorePatch = { games: final, status: 'done', winner: r.winner, playedOn: m.playedOn ?? new Date().toISOString().slice(0, 10) };
    await send(patch);
    // Draw the next knockout round if this result completes one.
    if (m.tournamentId) {
      try {
        const t = await b.tournamentBundle(m.tournamentId);
        const add = knockoutMatchesToAdd(t.tournament, t.divisions, t.entries, t.matches, newId);
        if (add.length) await b.addMatches(add);
      } catch (e) { setMsg(errorText(e)); return; }
    }
    onBack();
  }

  const lead = cur.a - cur.b;
  const thr = leadThreshold(fmt.pointsTo, thresholds);
  const gp = !curOver && (cur.a >= fmt.pointsTo - 1 && cur.a > cur.b ? 'A' : cur.b >= fmt.pointsTo - 1 && cur.b > cur.a ? 'B' : null);
  const done = games.map((g, i) => ({ g, i, an: g.points ? analyseGame(g.points, fmt.pointsTo, thresholds) : null })).filter((x) => gameOver(x.g.a, x.g.b, fmt.pointsTo));

  return (
    <main className="screen" aria-labelledby="score-title">
      <Header id="score-title" title={title || 'Score'} onBack={onBack} />
      <DemoNote b={b} />
      {!staff && <div role="alert" className="msg msg-bad">Only coaches and admins can score matches.</div>}
      <p className="small muted" style={{ margin: 0 }}>
        Game {games.length} · to {fmt.pointsTo}{fmt.bestOf > 1 ? ` · best of ${fmt.bestOf}` : ''}{m.court ? ` · Court ${m.court}` : ''}
        {' · '}<span role="status">{sync === 'saving' ? 'Saving…' : sync === 'unsent' ? 'Not sent yet. Will retry when online.' : 'Saved'}</span>
      </p>
      {fmt.bestOf > 1 && <p className="small" style={{ margin: 0 }}>Games: {nameA} {result.gamesA} – {result.gamesB} {nameB}</p>}
      {!manual && staff && (
        <>
          <div className="score-grid">
            <button type="button" className="score-tap" aria-label={`Point to ${nameA}`} onClick={() => point('A')} disabled={curOver || matchOver}>
              <span className="small">{nameA}</span>
              <span className="big">{cur.a}</span>
              <span className="small muted">Tap for a point</span>
            </button>
            <button type="button" className="score-tap" aria-label={`Point to ${nameB}`} onClick={() => point('B')} disabled={curOver || matchOver}>
              <span className="small">{nameB}</span>
              <span className="big">{cur.b}</span>
              <span className="small muted">Tap for a point</span>
            </button>
          </div>
          <p className="small" style={{ margin: 0, minHeight: 20 }} aria-live="polite">
            {gp ? `Game point: ${gp === 'A' ? nameA : nameB}` : Math.abs(lead) >= thr ? `${lead > 0 ? nameA : nameB} lead by ${Math.abs(lead)}` : ''}
          </p>
          <div className="sticky-actions" style={{ position: 'static' }}>
            <button type="button" className="btn btn-outline" onClick={undo} disabled={cur.points.length === 0 && games.length === 1}>Undo</button>
            {curOver && !matchOver && <button type="button" className="btn btn-primary" onClick={nextGame}>Start game {games.length + 1}</button>}
            {matchOver && <button type="button" className="btn btn-primary" onClick={() => finish(games)}>Save result</button>}
          </div>
        </>
      )}
      {done.length > 0 && (
        <section className="card section" aria-label="Finished games">
          {done.map(({ g, i, an }) => (
            <div key={i} className="row">
              <span>Game {i + 1}: {g.a}–{g.b}</span>
              <span className="small muted">{an ? momentumNote(an, nameA, nameB) : 'Final score only'}</span>
            </div>
          ))}
        </section>
      )}
      {manual && staff && <ManualScores m={m} onSave={finish} onCancel={() => setManual(false)} />}
      {!manual && staff && !matchOver && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setManual(true)}>Enter final scores instead</button>}
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <p className="small muted" style={{ margin: 0 }}>
        Scoring point by point lets PICKLEQ spot comebacks and lost leads (a {thr}-point lead in games to {fmt.pointsTo}, or game point).
      </p>
    </main>
  );
}

function momentumNote(an: ReturnType<typeof analyseGame>, nameA: string, nameB: string): string {
  if (an.momentumA === 'came-back') return `${nameA} came back from ${an.fromA}–${an.fromB}`;
  if (an.momentumB === 'came-back') return `${nameB} came back from ${an.fromB}–${an.fromA}`;
  if (an.momentumA === 'dominated') return `${nameA} in control throughout`;
  if (an.momentumB === 'dominated') return `${nameB} in control throughout`;
  return '';
}

function ManualScores({ m, onSave, onCancel }: { m: ClubMatch; onSave: (g: ClubGame[]) => void; onCancel: () => void }) {
  const [rows, setRows] = useState<{ a: string; b: string }[]>(Array.from({ length: m.format.bestOf }, () => ({ a: '', b: '' })));
  const [msg, setMsg] = useState<string | null>(null);
  function save() {
    const games: ClubGame[] = [];
    for (const r of rows) {
      if (!r.a && !r.b) continue;
      const a = Number(r.a), b = Number(r.b);
      if (!Number.isInteger(a) || !Number.isInteger(b) || !gameOver(a, b, m.format.pointsTo)) return setMsg(`Each game goes to ${m.format.pointsTo}, won by 2`);
      games.push({ points: '', a, b });
    }
    if (!matchResult({ games, format: m.format }).winner) return setMsg('Those scores don’t finish the match');
    onSave(games);
  }
  return (
    <section className="card section" aria-label="Final scores">
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 8, alignItems: 'center' }}>
          <span className="small">Game {i + 1}</span>
          <input className="input" inputMode="numeric" aria-label={`Game ${i + 1} side A`} value={r.a} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, a: e.target.value.replace(/\D/g, '') } : y)))} />
          <input className="input" inputMode="numeric" aria-label={`Game ${i + 1} side B`} value={r.b} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, b: e.target.value.replace(/\D/g, '') } : y)))} />
        </div>
      ))}
      <p className="small muted" style={{ margin: 0 }}>Without point-by-point scoring, comebacks and lost leads can’t be worked out for this match.</p>
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <div className="sticky-actions" style={{ position: 'static' }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save}>Save result</button>
      </div>
    </section>
  );
}
