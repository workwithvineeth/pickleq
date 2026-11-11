import { useEffect, useId, useMemo, useState } from 'react';
import type { Go } from '../../navigation';
import { useTournament } from '../../club/screens/Organiser';
import { errorText, names, shareText, useLoad } from '../../club/screens/common';
import { courtBoard, nextMatchToCall, upNext } from '../../club/plan';
import { matchResult, poolLetter, slotTime } from '../../club/domain/engine';
import { checkFinalScore } from '../../club/domain/momentum';
import { STAGE_LABEL, type ClubGame, type ClubMatch, type ClubPlayer } from '../../club/types';
import type { TournamentBundle } from '../../club/backend';
import { formatRule } from '../../club/screens/ScorePad';
import { DivisionBody } from '../../club/screens/Tournament';
import { useDesk } from '../../club/screens/deskContext';
import { DemoBar, MatchdayShell, Say } from '../../club/screens/DeskFrame';
import { ModeButton, PageHead } from '../shell/Shell';

type Msg = { ok: boolean; text: string } | null;
type Tool = 'result' | 'walk' | 'move';
const TOOLS: [Tool, string][] = [['result', 'Enter a result'], ['walk', 'Walkover or retired'], ['move', 'Change court']];

const matchLabel = (m: ClubMatch, d: TournamentBundle) => {
  const div = d.divisions.find((x) => x.id === m.divisionId);
  return [div?.name, m.stage === 'pool' ? `Pool ${poolLetter(m.pool)}` : STAGE_LABEL[m.stage]].filter(Boolean).join(' · ');
};
const ago = (iso: string, now: number) => Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
const LINES = <svg className="lines" viewBox="0 0 200 300" preserveAspectRatio="none" aria-hidden="true"><g><rect x="1" y="1" width="198" height="298" /><line x1="1" y1="150" x2="199" y2="150" strokeWidth="3" /><line x1="1" y1="105" x2="199" y2="105" /><line x1="1" y1="195" x2="199" y2="195" /><line x1="100" y1="1" x2="100" y2="105" /><line x1="100" y1="195" x2="100" y2="299" /></g></svg>;

/**
 * Match-day desk (v1.2 look, docs/final-prototype/Desk.dc.html): the courts drawn as courts with the live score, one "Call to Court N"
 * for a free court, the selected match's tools (result typed in, walkover or retired, change court) and the queue.
 * The same screen opens inside the desk link (#/desk/<token>), in the plain desk frame without the organiser menu.
 */
export function RallyDesk({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const { b, state } = useTournament(id, 8000);
  const desk = useDesk();
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const d = state.data;
  const pmap = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  // The clock for "last score N min ago".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const h = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(h); }, []);
  const links = useLoad(async () => (b && d && !desk ? b.scorerLinks(d.tournament.id) : null), [b, d?.tournament.id, desk]);

  if (!d || !b) {
    return (
      <MatchdayShell go={go} active="desk" d={d}>
        <PageHead title="Desk" />
        {state.error
          ? <><div role="alert" className="warn">{state.error}</div>
            {desk ? <button type="button" className="btn" onClick={desk.leave}>Type the desk PIN again</button> : <button type="button" className="btn ghost" onClick={onBack}>Back</button>}</>
          : <p className="mut" role="status">Loading the desk…</p>}
      </MatchdayShell>
    );
  }
  const t = d.tournament;
  const active = d.matches.filter((m) => m.status !== 'void');
  const board = courtBoard(active, t.courts);
  const queue = upNext(active, 10);
  // Byes (no opponent) aren't matches.
  const real = active.filter((m) => m.entryB || m.sideB.length || m.stage === 'pool' || m.stage === 'friendly');
  const played = real.filter((m) => m.status === 'done').length;
  const who = (m: ClubMatch) => `${names(m.sideA, pmap)} v ${names(m.sideB, pmap)}`;
  const when = (m: ClubMatch) => (m.slot !== undefined ? slotTime(t.startTime, m.slot, t.slotMinutes) : '');
  const slug = t.publicSlug || id;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); state.reload(); return true; } catch (e) { setMsg({ ok: false, text: errorText(e) }); return false; } finally { setBusy(false); }
  }
  const moveTo = (m: ClubMatch, court: number) => run(() => b.patchMatches([{ id: m.id, patch: { court } }]), `Sent to court ${court}`);
  const saveFinal = (m: ClubMatch, games: ClubGame[]) => {
    const r = matchResult({ games, format: m.format });
    if (!r.winner) return Promise.resolve(false);
    return run(() => b.saveScore(m.id, { games, status: 'done', winner: r.winner, playedOn: m.playedOn ?? t.startDate }), 'Result saved');
  };
  /** A no-show (nothing played) or a retirement (games so far are kept): the other side goes through. */
  const giveWalkover = (m: ClubMatch, winner: 'A' | 'B') => {
    const kept = m.games.filter((g) => g.a > 0 || g.b > 0);
    return run(() => b.patchMatches([{ id: m.id, patch: { status: 'done', winner, games: kept } }]),
      `${names(winner === 'A' ? m.sideA : m.sideB, pmap)} ${kept.length ? 'win: the other side retired' : 'win by walkover'}`);
  };

  // The one call to make: the first free court and the match that can go on it.
  const freeCourt = board.find((s) => !s.now && !s.next);
  const toCall = freeCourt ? nextMatchToCall(active, freeCourt.court) : undefined;
  const draft = t.status === 'draft';
  const open = (m?: ClubMatch) => !!m && m.status !== 'done' && m.status !== 'void';
  const picked = active.find((m) => m.id === sel);
  const selected = open(picked) ? picked : (board.map((s) => s.now ?? s.next).find(Boolean) ?? queue[0]);
  const linkFor = (court: number) => links.data?.find((l) => !l.revoked && l.court === court) ?? links.data?.find((l) => !l.revoked && !l.court);
  const missingLinks = links.data ? board.filter((s) => !linkFor(s.court)).length : 0;

  return (
    <MatchdayShell go={go} active="desk" d={d}>
      <div className="between">
        <div className="pg-h">
          <span className="cap">{t.status === 'live' && <span className="chip live" style={{ marginRight: 8 }}>Live</span>}{t.name} · {new Date(now).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
          <h1 className="disp" aria-label={`${t.name} · Desk`}>Desk</h1>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: '4px 18px' }}>
          {!desk && <ModeButton />}
          <a className="tlink mut" href={'#/club-tv/' + encodeURIComponent(slug)}>TV board ↗</a>
          {!desk && <a className="tlink mut" href={'#/club-social/' + encodeURIComponent(slug)}>Social studio ↗</a>}
          <a className="tlink mut" href={'#/event/' + encodeURIComponent(slug)}>Public live scores ↗</a>
        </div>
      </div>
      <DemoBar b={b} />
      {draft && <div className="card" style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', gap: '12px 20px', alignItems: 'center' }}>
        <span className="grow"><b>Not started yet.</b> <span className="mut">Start the tournament when the first match is ready.</span></span>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => b.updateTournament(t.id, { status: 'live' }), 'The tournament is live')}>Start tournament</button>
      </div>}
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {(!desk || t.entryMode !== 'registration' || t.drawnAt) && <button type="button" className="btn ghost sm" onClick={() => go('club-entries', t.id)}>Entries</button>}
        <button type="button" className="btn ghost sm" onClick={() => go('club-tournament', t.id)}>Standings and draw</button>
        <button type="button" className="tlink mut" onClick={() => document.getElementById('desk-tools')?.scrollIntoView({ block: 'start' })}>Results, walkovers and court changes ↓</button>
      </div>
      <Say msg={msg} />
      {real.length > 0
        ? <div className="grid g4">
          <div className="card stat" style={{ padding: 16 }}><div className="cap">Played</div><div className="n">{played}</div><div className="mut" style={{ fontSize: 13 }}>of {real.length} matches</div>
            <progress aria-label="Matches completed" max={real.length} value={played} style={{ width: '100%', height: 6, accentColor: '#D9F24A', marginTop: 8 }} /></div>
          <div className="card stat" style={{ padding: 16 }}><div className="cap">On court</div><div className="n acc">{board.filter((s) => s.now).length}</div><div className="mut" style={{ fontSize: 13 }}>live now</div></div>
          <div className="card stat" style={{ padding: 16 }}><div className="cap">In the queue</div><div className="n">{active.filter((m) => m.status === 'scheduled').length}</div><div className="mut" style={{ fontSize: 13 }}>waiting to play</div></div>
          {real.some((m) => m.slot !== undefined) && <div className="card stat" style={{ padding: 16 }}><div className="cap">Planned finish</div><div className="n" style={{ fontSize: 34 }}>{slotTime(t.startTime, Math.max(...real.map((m) => m.slot ?? 0)) + 1, t.slotMinutes)}</div><div className="mut" style={{ fontSize: 13 }}>from the schedule</div></div>}
        </div>
        : <p className="mut" role="status">No matches scheduled yet. Open entries to make the draw.</p>}

      <div className="between"><h2 className="cap">Courts · tap a court to fix its match</h2><span className="mut" style={{ fontSize: 12 }}>Scores come from the referee on each court</span></div>
      <section className="grid g4" aria-label="Courts">
        {board.map((s) => <CourtCard key={s.court} court={s.court} now={s.now} next={s.next} d={d} pmap={pmap} at={now}
          selected={!!selected && selected.id === (s.now ?? s.next)?.id} nextUp={s.now || s.next ? undefined : (nextMatchToCall(active, s.court) ?? null)}
          link={links.data ? (linkFor(s.court) ? (linkFor(s.court)!.lastUsedAt ? 'opened' : 'unopened') : 'none') : undefined}
          onPick={() => { const m = s.now ?? s.next; if (m) setSel(m.id); }} />)}
      </section>
      {freeCourt && <div className="card" style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', gap: '12px 20px', alignItems: 'center' }}>
        <span className="grow"><b>Court {freeCourt.court} is free.</b> <span className="mut">{toCall ? `Next: ${who(toCall)}${toCall.court ? ` (booked for court ${toCall.court})` : ''}. Call them when the court is clear.` : 'The queue is empty.'}</span></span>
        <button type="button" className={draft ? 'btn alt' : 'btn'} disabled={busy || !toCall} onClick={() => toCall && void moveTo(toCall, freeCourt.court)}>{toCall ? `Call to Court ${freeCourt.court}` : 'Queue empty'}</button>
      </div>}
      {!desk && missingLinks > 0 && <div className="warn" role="note" aria-label="Needs you"><span className="grow">Referee links not made for {missingLinks} court{missingLinks > 1 ? 's' : ''}.</span><button type="button" className="tlink" onClick={() => go('club-scorers', t.id)}>Create referee links</button></div>}

      <div id="desk-tools" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="card" aria-label="Fix a match" style={{ flex: '999 1 520px', minWidth: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selected
            ? <MatchTools key={selected.id} m={selected} d={d} pmap={pmap} board={board.map((s) => ({ court: s.court, inUse: !!s.now }))} busy={busy}
              onResult={(g) => saveFinal(selected, g)} onWalkover={(w) => giveWalkover(selected, w)} onMove={(c) => moveTo(selected, c)}
              onScore={() => go('club-score', selected.id)}
              onCall={selected.court ? async () => setMsg({ ok: true, text: await shareText(`${t.name} · Court ${selected.court}: ${names(selected.sideA, pmap)} v ${names(selected.sideB, pmap)} (${matchLabel(selected, d)}). Please come to court ${selected.court} now.`) }) : undefined} />
            : <p className="mut" style={{ margin: 0 }}>No match to fix. Matches appear here when they’re on a court or in the queue.</p>}
        </section>
        <section className="card" aria-labelledby="queue-title" style={{ flex: '1 1 360px', minWidth: 0 }}>
          <div className="between" style={{ padding: '16px 18px 6px' }}><h2 id="queue-title" className="cap">Queue</h2><span className="mut" style={{ fontSize: 12 }}>Call 10 min early</span></div>
          <div className="list">
            {queue.length === 0 && <div className="mut" style={{ fontSize: 14 }}>No matches waiting.{t.status === 'live' ? ' Knockouts are drawn automatically when the pools finish.' : ''}</div>}
            {queue.map((m, i) => (
              <div key={m.id}>
                <span className="n mut" style={{ fontSize: 20, width: 22 }}>{i + 1}</span>
                <button type="button" className="grow" aria-pressed={selected?.id === m.id} aria-label={`Choose ${who(m)}`} onClick={() => setSel(m.id)}
                  style={{ minWidth: 0, minHeight: 44, background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                  <b className="ell" style={{ display: 'block', fontSize: 14 }}>{who(m)}</b>
                  <span className="mut" style={{ fontSize: 12 }}>{[matchLabel(m, d), when(m) && `about ${when(m)}`].filter(Boolean).join(' · ')}</span>
                </button>
                <span className={m.court ? 'st off' : 'st wait'}>{m.court ? `Court ${m.court}` : 'Waiting'}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <details className="card" style={{ padding: '14px 18px' }}>
        <summary style={{ minHeight: 32, cursor: 'pointer', fontWeight: 700 }}>Pool tables</summary>
        {d.divisions.filter((x) => x.shape !== 'ko').map((x) => (
          <div key={x.id} aria-label={`${x.name} pool tables`} role="region" style={{ marginTop: 12 }}>
            <h3 className="cap">{x.name}</h3>
            <DivisionBody d={d} divisionId={x.id} view="pools" label={(e) => (e ? names(e.playerIds, pmap) : 'To be decided')} />
          </div>
        ))}
      </details>
      {desk && <button type="button" className="tlink" style={{ alignSelf: 'flex-start' }} onClick={desk.leave}>Leave the desk on this phone</button>}
    </MatchdayShell>
  );
}

function CourtCard({ court, now, next, nextUp, d, pmap, at, selected, link, onPick }: {
  court: number; now?: ClubMatch; next?: ClubMatch; nextUp?: ClubMatch | null; d: TournamentBundle; pmap: Map<string, ClubPlayer>; at: number;
  selected: boolean; link?: 'opened' | 'unopened' | 'none'; onPick: () => void;
}) {
  const id = useId();
  const m = now ?? next;
  const last = now?.games.at(-1);
  const quiet = now ? ago(now.updatedAt, at) : 0;
  return (
    <button type="button" className={selected ? 'cglass sel' : 'cglass'} aria-label={`Court ${court}`} aria-describedby={id} aria-pressed={selected} onClick={onPick} disabled={!m}
      style={{ border: 0, font: 'inherit', textAlign: 'left', cursor: m ? 'pointer' : 'default', padding: 18, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 300, color: '#F4F7EE' }}>
      {LINES}
      <span id={id} style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, width: '100%' }}>
        <span className="between" style={{ width: '100%' }}><b className="disp" style={{ fontSize: 26 }}>Court {court}</b>{now ? <span className="st live">Live</span> : <span className="st ok">Free</span>}</span>
        <span className="mut" style={{ fontSize: 12 }}>{m ? [matchLabel(m, d), now ? `Game ${Math.max(1, now.games.length)}` : 'Booked next', formatRule(m.format)].join(' · ') : 'Ready for the next match'}</span>
        {now && <>
          <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 12px', alignItems: 'center', width: '100%', marginTop: 'auto' }}>
            <b className="ell" style={{ fontSize: 15 }}>{names(now.sideA, pmap)}</b><span className="n" style={{ fontSize: 46, color: '#E4F75A' }}>{last?.a ?? 0}</span>
            <span className="ell" style={{ fontSize: 15, color: '#C9D9CD' }}>{names(now.sideB, pmap)}</span><span className="n" style={{ fontSize: 46 }}>{last?.b ?? 0}</span>
          </span>
          {quiet >= 5 ? <span className="st no wrapok" style={{ fontSize: 12 }}>No new score for {quiet} min</span> : <span className="mut" style={{ fontSize: 12 }}>Last score {quiet ? `${quiet} min ago` : 'just now'}{next ? ` · Next: ${names(next.sideA, pmap)} v ${names(next.sideB, pmap)}` : ''}</span>}
        </>}
        {!now && next && <span style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}><span className="mut" style={{ fontSize: 13 }}>Booked next:</span><b style={{ fontSize: 15 }}>{names(next.sideA, pmap)}</b><span style={{ fontSize: 15, color: '#C9D9CD' }}>{names(next.sideB, pmap)}</span></span>}
        {!m && <span style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}><span className="mut" style={{ fontSize: 13 }}>Free. Next up:</span><b style={{ fontSize: 16 }}>{nextUp ? `${names(nextUp.sideA, pmap)} vs ${names(nextUp.sideB, pmap)}` : 'Queue empty'}</b></span>}
        {link === 'none' && <span className="st no wrapok" style={{ fontSize: 12 }}>No referee link yet</span>}
        {link === 'unopened' && <span className="mut" style={{ fontSize: 12 }}>Referee link not opened yet</span>}
      </span>
    </button>
  );
}

function MatchTools({ m, d, pmap, board, busy, onResult, onWalkover, onMove, onScore, onCall }: {
  m: ClubMatch; d: TournamentBundle; pmap: Map<string, ClubPlayer>; board: { court: number; inUse: boolean }[]; busy: boolean;
  onResult: (g: ClubGame[]) => Promise<boolean>; onWalkover: (winner: 'A' | 'B') => Promise<boolean>; onMove: (court: number) => Promise<boolean>; onScore: () => void; onCall?: () => void;
}) {
  const [tool, setTool] = useState<Tool>('result');
  const [rows, setRows] = useState(() => Array.from({ length: m.format.bestOf }, () => ({ a: '', b: '' })));
  const [problem, setProblem] = useState<string | null>(null);
  const [out, setOut] = useState<'A' | 'B' | null>(null);
  const [court, setCourt] = useState<number | null>(null);
  const nameA = names(m.sideA, pmap), nameB = names(m.sideB, pmap);
  const twoSides = m.sideA.length > 0 && m.sideB.length > 0;
  const set = (i: number, k: 'a' | 'b', v: string) => setRows((x) => x.map((y, j) => (j === i ? { ...y, [k]: v.replace(/\D/g, '').slice(0, 2) } : y)));
  function save() {
    const games: ClubGame[] = [];
    for (const [i, r] of rows.entries()) {
      if (!r.a && !r.b) continue;
      const e = checkFinalScore(Number(r.a), Number(r.b), m.format.pointsTo, !!m.format.golden);
      if (e) return setProblem(`Game ${i + 1}: ${e}`);
      games.push({ points: '', a: Number(r.a), b: Number(r.b) });
    }
    if (!matchResult({ games, format: m.format }).winner) return setProblem('Those scores don’t finish the match');
    setProblem(null);
    void onResult(games);
  }
  return (
    <>
      <div>
        <div className="cap">{[m.court ? `Court ${m.court}` : 'No court yet', matchLabel(m, d)].join(' · ')}</div>
        <h2 className="disp" style={{ fontSize: 30, marginTop: 6 }}>{nameA || 'To be decided'} v {nameB || 'To be decided'}</h2>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {twoSides && <button type="button" className="btn ghost sm" onClick={onScore}>Score</button>}
        {onCall && <button type="button" className="btn ghost sm" aria-label={`Call ${nameA} v ${nameB} to court ${m.court}`} onClick={onCall}>Message the players</button>}
      </div>
      <div className="tabs" role="tablist" aria-label="Fix this match">
        {TOOLS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tool === k} className={tool === k ? 'tab on' : 'tab'} onClick={() => { setTool(k); setProblem(null); }}>{label}</button>)}
      </div>
      {tool === 'result' && (twoSides
        ? <section aria-label="Final scores" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mut" style={{ fontSize: 13 }}>For a score that came in on paper. {formatRule(m.format)}. Nothing shows as final until you save it.</div>
          {rows.map((r, i) => (
            <div key={i} className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span className="cap" style={{ width: 64 }}>Game {i + 1}</span>
              <input className="inp n" inputMode="numeric" style={{ maxWidth: 92, textAlign: 'center', fontSize: 24 }} aria-label={`Game ${i + 1} ${nameA}`} value={r.a} onChange={(e) => set(i, 'a', e.target.value)} />
              <span className="mut">–</span>
              <input className="inp n" inputMode="numeric" style={{ maxWidth: 92, textAlign: 'center', fontSize: 24 }} aria-label={`Game ${i + 1} ${nameB}`} value={r.b} onChange={(e) => set(i, 'b', e.target.value)} />
            </div>
          ))}
          {problem && <div role="alert" className="warn">{problem}</div>}
          <button type="button" className="btn alt" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={save}>Save result</button>
        </section>
        : <p className="mut" style={{ margin: 0 }}>Both sides aren’t known yet, so there’s no result to enter.</p>)}
      {tool === 'walk' && (twoSides
        ? <section aria-label="Walkover or retired" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mut" style={{ fontSize: 13 }}>Who didn’t turn up or retired? The other side goes through. Games already played are kept (a retirement); with none, it’s a walkover.</div>
          <div className="grid g2" style={{ gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))' }}>
            {([['A', nameA], ['B', nameB]] as const).map(([k, n]) => (
              <button key={k} type="button" className={out === k ? 'opt on' : 'opt'} aria-pressed={out === k} onClick={() => setOut(k)}>
                <span className="dot" /><span><b style={{ display: 'block' }}>{n}</b><span className="mut" style={{ fontSize: 13 }}>Didn’t turn up or retired</span></span>
              </button>
            ))}
          </div>
          <button type="button" className="btn alt" style={{ alignSelf: 'flex-start' }} disabled={busy || !out} onClick={() => out && void onWalkover(out === 'A' ? 'B' : 'A')}>
            {out ? `Save: ${out === 'A' ? nameB : nameA} go through` : 'Save walkover'}
          </button>
        </section>
        : <p className="mut" style={{ margin: 0 }}>Both sides aren’t known yet.</p>)}
      {tool === 'move' && (
        <section aria-label="Change court" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mut" style={{ fontSize: 13 }}>Move the match to another court. The referee link for that court and the TV board follow it.</div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {board.map((c) => {
              const here = c.court === m.court;
              return (
                <button key={c.court} type="button" className={court === c.court ? 'opt on' : 'opt'} aria-pressed={court === c.court} disabled={here} onClick={() => setCourt(c.court)} style={{ width: 'auto', flex: '1 1 120px', opacity: here ? 0.6 : undefined }}>
                  <span className="dot" /><span><b style={{ display: 'block' }}>Court {c.court}</b><span className="mut" style={{ fontSize: 12 }}>{here ? 'This match' : c.inUse ? 'In use' : 'Free'}</span></span>
                </button>
              );
            })}
          </div>
          <button type="button" className="btn alt" style={{ alignSelf: 'flex-start' }} disabled={busy || !court} onClick={() => court && void onMove(court)}>{court ? `Move to Court ${court}` : 'Choose a court'}</button>
        </section>
      )}
    </>
  );
}

