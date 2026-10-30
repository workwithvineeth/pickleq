import { useEffect, useMemo, useState } from 'react';
import { Field, Segmented } from '../../components/Controls';
import { newId } from '../../db/db';
import type { Go } from '../../navigation';
import type { ClubBackend, TournamentBundle } from '../backend';
import { matchResult, poolLetter, slotTime } from '../domain/engine';
import { duprCheck, duprCsv } from '../dupr';
import { backend, publicSources } from '../index';
import { courtBoard, enteredPlayers, knockoutMatchesToAdd, nextMatchToCall, planLateEntry, planReplacePlayer, planWithdraw, upNext } from '../plan';
import { isStaff, STAGE_LABEL, type ClubGame, type ClubMatch, type ClubPlayer, type Entry, type ScorerLink, type ScorerView } from '../types';
import { appLink, DemoNote, errorText, fmtRating, Header, names, shareLink, Status, useLoad } from './common';
import { formatRule, ManualScores, ScorePad } from './ScorePad';
import { DivisionBody } from './Tournament';

/** Loads a tournament for an organiser screen, drawing any knockout round that's ready. */
function useTournament(id: string, poll?: number) {
  const b = backend();
  const [tick, setTick] = useState(0);
  const state = useLoad(async () => {
    if (!b) throw new Error('Open Club mode first');
    const t = await b.tournamentBundle(id);
    if (!isStaff(t.role)) throw new Error('Only coaches and admins can run a tournament');
    const add = knockoutMatchesToAdd(t.tournament, t.divisions, t.entries, t.matches, newId);
    if (add.length) { await b.addMatches(add); return b.tournamentBundle(id); }
    return t;
  }, [b, id, tick]);
  useEffect(() => {
    if (!poll) return;
    const h = window.setInterval(() => { if (document.visibilityState !== 'hidden') setTick((x) => x + 1); }, poll);
    return () => window.clearInterval(h);
  }, [poll]);
  return { b, state };
}

function shell(title: string, onBack: () => void, s: { error: string | null; loading: boolean }, wide = false) {
  return (
    <main className={`screen${wide ? ' wide-ok' : ''}`} aria-labelledby="org-title">
      <Header id="org-title" title={title} onBack={onBack} />
      <Status error={s.error} loading={s.loading} />
    </main>
  );
}

const matchLabel = (m: ClubMatch, d: TournamentBundle) => {
  const div = d.divisions.find((x) => x.id === m.divisionId);
  return `${div?.name ?? ''} · ${m.stage === 'pool' ? `Pool ${poolLetter(m.pool)}` : STAGE_LABEL[m.stage]}`;
};

// ---------- Scorer links ----------

const randomPin = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
const courtName = (c?: number) => (c ? `Court ${c}` : 'Any court');

export function ScorerLinks({ id, onBack }: { id: string; go?: Go; onBack: () => void }) {
  const { b, state } = useTournament(id);
  const [tick, setTick] = useState(0);
  const links = useLoad(async () => (b ? b.scorerLinks(id) : []), [b, id, tick]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = state.data;
  if (!d || !b) return shell('Scorer links', onBack, state);
  const t = d.tournament;
  const have = new Set((links.data ?? []).filter((l) => !l.revoked).map((l) => l.court ?? 0));
  const missing = Array.from({ length: t.courts }, (_, i) => i + 1).filter((c) => !have.has(c));

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(ok); setTick((x) => x + 1); } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }
  const url = (l: ScorerLink) => appLink(`#/court/${l.token}`);

  return (
    <main className="screen" aria-labelledby="links-title">
      <Header id="links-title" title="Scorer links" onBack={onBack} />
      <DemoNote b={b} />
      <p className="small muted" style={{ margin: 0 }}>
        Give each court’s scorer a link. They don’t need an account, just the link and its PIN. Send the PIN separately, by voice or another message.
        A court link only shows that court’s matches.
      </p>
      {t.status === 'done' && <div className="msg msg-bad">This tournament is finished, so scorer links no longer work.</div>}
      <div className="meta">
        {missing.length > 0 && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => b.createScorerLinks(t.id, t.clubId, missing), `Made ${missing.length} court link${missing.length > 1 ? 's' : ''}`)}>{have.size ? `Add links for ${missing.length} more court${missing.length > 1 ? 's' : ''}` : `Make a link for each court (${t.courts})`}</button>}
        {!have.has(0) && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => b.createScorerLinks(t.id, t.clubId, [null]), 'Made an any-court link')}>Add an any-court link</button>}
      </div>
      {msg && <div role="status" className="msg msg-ok">{msg}</div>}
      <Status error={links.error} loading={links.loading && !links.data} />
      {(links.data ?? []).map((l) => (
        <section key={l.id} className="card section" aria-label={`${courtName(l.court)} scorer link`} style={l.revoked ? { opacity: 0.6 } : undefined}>
          <div className="row">
            <h3 style={{ fontSize: 18 }}>{courtName(l.court)}</h3>
            {l.revoked ? <span className="pill">Turned off</span> : <span className="pill pill-ok">PIN {l.pin}</span>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>{l.lastUsedAt ? `Last used ${new Date(l.lastUsedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not used yet'}</p>
          {!l.revoked && (
            <div className="meta">
              <button type="button" className="btn btn-primary" onClick={async () => setMsg(await shareLink(`${t.name}: score ${courtName(l.court)}`, url(l)))}>Share link</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => b.updateScorerLink(l.id, { pin: randomPin() }), `New PIN for ${courtName(l.court)}`)}>New PIN</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => b.updateScorerLink(l.id, { revoked: true }), `${courtName(l.court)} link turned off`)}>Turn off</button>
            </div>
          )}
          {l.revoked && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => b.updateScorerLink(l.id, { revoked: false }), `${courtName(l.court)} link is back on`)}>Turn back on</button>}
        </section>
      ))}
    </main>
  );
}

// ---------- The court page a scorer opens (no account) ----------

function pinKey(token: string) { return `pq-court-pin-${token}`; }
/** Opens a scorer link on the club server, or in the demo on this phone if the server doesn't know it. */
async function openLink(token: string, pin: string): Promise<{ src: ClubBackend; view: ScorerView }> {
  const sources = publicSources();
  let first: unknown = null;
  for (const src of sources) {
    try { return { src, view: await src.scorerOpen(token, pin) }; }
    catch (e) {
      first ??= e;
      // Only an unknown link moves on to the next place; a wrong PIN or lockout is the answer.
      if (!/isn’t valid/.test(errorText(e))) throw e;
    }
  }
  throw first;
}

export function CourtScorer({ token, onBack }: { token: string; onBack: () => void }) {
  const [src, setSrc] = useState<ClubBackend | null>(null);
  const [pin, setPinState] = useState<string>(() => { try { return sessionStorage.getItem(pinKey(token)) ?? ''; } catch { return ''; } });
  const [typed, setTyped] = useState('');
  const [view, setView] = useState<ScorerView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const setPin = (p: string) => { setPinState(p); try { if (p) sessionStorage.setItem(pinKey(token), p); else sessionStorage.removeItem(pinKey(token)); } catch { /* private mode */ } };

  useEffect(() => {
    if (!pin) return;
    let alive = true;
    (src ? src.scorerOpen(token, pin).then((v) => ({ src, view: v })) : openLink(token, pin)).then(
      (r) => { if (alive) { setSrc(r.src); setView(r.view); setErr(null); } },
      (e: unknown) => {
        if (!alive) return;
        const m = errorText(e);
        // A wrong or changed PIN: ask again. A connection problem: keep showing what we had.
        if (/PIN|isn’t valid|finished/i.test(m)) { setPin(''); setView(null); }
        setErr(m);
      },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, token, pin, tick]);

  // Keep the list fresh while nobody is scoring on this phone.
  useEffect(() => {
    if (!pin || open) return;
    const h = window.setInterval(() => setTick((x) => x + 1), 15000);
    return () => window.clearInterval(h);
  }, [pin, open]);

  async function enter() {
    if (!/^\d{4,6}$/.test(typed)) return setErr('Enter the PIN the organiser gave you');
    setBusy(true); setErr(null);
    try { const r = await openLink(token, typed); setSrc(r.src); setView(r.view); setPin(typed); setTyped(''); }
    catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  const title = view ? (view.court ? `Court ${view.court}` : 'Scoring') : 'Scorer';
  if (!pin || !view || !src) {
    return (
      <main className="screen" aria-labelledby="court-title">
        <Header id="court-title" title={title} onBack={onBack} />
        <p className="small muted" style={{ margin: 0 }}>Enter the PIN the organiser gave you to score matches. No account needed.</p>
        <Field label="PIN">
          <input className="input" inputMode="numeric" autoComplete="off" aria-label="PIN" maxLength={6} value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') void enter(); }} />
        </Field>
        {err && <div role="alert" className="msg msg-bad">{err}</div>}
        <button type="button" className="btn btn-primary" disabled={busy || typed.length < 4} onClick={enter}>Start scoring</button>
        {pin && !view && !err && <p className="small muted" role="status">Loading…</p>}
      </main>
    );
  }

  const t = view.tournament;
  const current = view.matches.find((m) => m.id === open);
  if (current) {
    const a = current.namesA.join(' / '), bn = current.namesB.join(' / ');
    return (
      <main className="screen" aria-labelledby="court-title">
        <Header id="court-title" title={`${current.division ?? ''} ${current.stage === 'pool' ? `Pool ${poolLetter(current.pool)}` : STAGE_LABEL[current.stage]}`.trim()} onBack={() => { setOpen(null); setTick((x) => x + 1); }} />
        {current.court && <p className="small" style={{ margin: 0, fontWeight: 600 }}>Court {current.court}</p>}
        <ScorePad
          key={current.id}
          matchKey={`link:${token}:${current.id}`}
          initialGames={current.games}
          format={current.format}
          nameA={a}
          nameB={bn}
          playedOn={current.playedOn ?? t.startDate}
          send={(patch) => src.scorerSave(token, pin, current.id, patch)}
          onFinished={() => { setOpen(null); setTick((x) => x + 1); }}
          canScore={current.status !== 'done' && current.status !== 'void'}
        />
      </main>
    );
  }

  const live = view.matches.filter((m) => m.status === 'live');
  const waiting = view.matches.filter((m) => m.status === 'scheduled');
  const done = view.matches.filter((m) => m.status === 'done').reverse();
  const row = (m: ScorerView['matches'][number], cta: string) => (
    <button key={m.id} type="button" className="match-row" aria-label={`${cta}: ${m.namesA.join(' / ')} against ${m.namesB.join(' / ')}`} onClick={() => setOpen(m.id)}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block' }}>{m.namesA.join(' / ')}</span>
        <span style={{ display: 'block' }}>{m.namesB.join(' / ')}</span>
        <span className="small muted">{[m.slot !== undefined ? slotTime(t.startTime, m.slot, t.slotMinutes) : '', !view.court && m.court ? `Court ${m.court}` : '', m.division, m.stage === 'pool' ? `Pool ${poolLetter(m.pool)}` : STAGE_LABEL[m.stage]].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="small" style={{ textAlign: 'right' }}>{m.games.length ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : ''} <span className={m.status === 'live' ? 'pill pill-warn' : 'pill'}>{cta}</span></span>
    </button>
  );
  return (
    <main className="screen" aria-labelledby="court-title">
      <Header id="court-title" title={title} onBack={onBack} />
      <p className="small muted" style={{ margin: 0 }}>{view.club} · {t.name}{t.status === 'draft' ? ' · not started yet' : ''}</p>
      {err && <div role="status" className="msg msg-bad">{err}</div>}
      {live.length > 0 && <section className="section" aria-label="Playing now"><div className="label">Playing now</div>{live.map((m) => row(m, 'Continue'))}</section>}
      <section className="section" aria-label="Up next">
        <div className="label">Up next</div>
        {waiting.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing waiting on this court. New matches appear here when the organiser sends them.</p>}
        {waiting.map((m, i) => row(m, i === 0 && !live.length ? 'Score' : 'Later'))}
      </section>
      {done.length > 0 && (
        <section className="section" aria-label="Finished">
          <div className="label">Finished</div>
          {done.map((m) => (
            <div key={m.id} className="match-row">
              <span style={{ flex: 1 }}><span style={{ display: 'block', fontWeight: m.winner === 'A' ? 600 : 400 }}>{m.namesA.join(' / ')}</span><span style={{ display: 'block', fontWeight: m.winner === 'B' ? 600 : 400 }}>{m.namesB.join(' / ')}</span></span>
              <span className="small">{m.games.length ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : 'Walkover'}</span>
            </div>
          ))}
        </section>
      )}
      <p className="small muted" style={{ margin: 0 }}>Updates every 15 seconds. Scores are kept on this phone if the signal drops, and sent when it’s back.</p>
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setPin(''); setView(null); }}>Stop scoring on this phone</button>
    </main>
  );
}

// ---------- Desk view (laptop at the organiser's table) ----------

export function Desk({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const { b, state } = useTournament(id, 8000);
  const [entering, setEntering] = useState<string | null>(null);
  const [walkover, setWalkover] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = state.data;
  const pmap = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  if (!d || !b) return shell('Desk', onBack, state, true);
  const t = d.tournament;
  const active = d.matches.filter((m) => m.status !== 'void');
  const board = courtBoard(active, t.courts);
  const queue = upNext(active, 10);
  // Byes (no opponent) aren't matches.
  const real = active.filter((m) => m.entryB || m.sideB.length || m.stage === 'pool' || m.stage === 'friendly');
  const played = real.filter((m) => m.status === 'done').length;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(ok); state.reload(); } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }
  const moveTo = (m: ClubMatch, court: number) => run(() => b.patchMatches([{ id: m.id, patch: { court } }]), `Sent to court ${court}`);
  async function saveFinal(m: ClubMatch, games: ClubGame[]) {
    const r = matchResult({ games, format: m.format });
    if (!r.winner) return;
    await run(() => b!.saveScore(m.id, { games, status: 'done', winner: r.winner, playedOn: m.playedOn ?? t.startDate }), 'Result saved');
    setEntering(null);
  }
  const who = (m: ClubMatch) => `${names(m.sideA, pmap)} v ${names(m.sideB, pmap)}`;
  /** A no-show (nothing played) or a retirement (games so far are kept): the other side goes through. */
  async function giveWalkover(m: ClubMatch, winner: 'A' | 'B') {
    const kept = m.games.filter((g) => g.a > 0 || g.b > 0);
    await run(() => b!.patchMatches([{ id: m.id, patch: { status: 'done', winner, games: kept } }]),
      `${names(winner === 'A' ? m.sideA : m.sideB, pmap)} ${kept.length ? 'win: the other side retired' : 'win by walkover'}`);
    setWalkover(null);
  }

  return (
    <main className="screen wide-ok" aria-labelledby="desk-title">
      <Header id="desk-title" title={`${t.name} · Desk`} onBack={onBack} />
      <DemoNote b={b} />
      <p className="small muted" style={{ margin: 0 }}>{played} of {real.length} matches played · {t.status === 'live' ? 'Live' : t.status === 'done' ? 'Finished' : 'Not started'} · refreshes every 8 seconds</p>
      <div className="meta">
        {t.status === 'draft' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => b.updateTournament(t.id, { status: 'live' }), 'The tournament is live')}>Start tournament</button>}
        <button type="button" className="btn btn-outline" onClick={() => go('club-scorers', t.id)}>Scorer links</button>
        <button type="button" className="btn btn-outline" onClick={() => go('club-entries', t.id)}>Entries</button>
        <button type="button" className="btn btn-outline" onClick={() => go('club-tournament', t.id)}>Standings and draw</button>
      </div>
      {msg && <div role="status" className="msg msg-ok">{msg}</div>}
      <section aria-label="Courts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {board.map(({ court, now, next }) => {
          const m = now ?? next;
          const call = !now && !next ? nextMatchToCall(active, court) : undefined;
          return (
            <div key={court} className="card section" aria-label={`Court ${court}`}>
              <div className="row"><h3 style={{ fontSize: 18 }}>Court {court}</h3>{now ? <span className="pill pill-warn">Playing</span> : next ? <span className="pill">Next</span> : <span className="pill">Free</span>}</div>
              {m && (
                <>
                  <div className="small muted">{matchLabel(m, d)}{m.slot !== undefined ? ` · ${slotTime(t.startTime, m.slot, t.slotMinutes)}` : ''}</div>
                  <div style={{ fontWeight: 600 }}>{names(m.sideA, pmap)}</div>
                  <div style={{ fontWeight: 600 }}>{names(m.sideB, pmap)}</div>
                  {m.games.length > 0 && <div className="small">{m.games.map((g) => `${g.a}–${g.b}`).join(', ')}</div>}
                  <div className="small muted">{formatRule(m.format)}</div>
                  {entering === m.id
                    ? <ManualScores format={m.format} nameA={names(m.sideA, pmap)} nameB={names(m.sideB, pmap)} busy={busy} onSave={(g) => saveFinal(m, g)} onCancel={() => setEntering(null)} />
                    : walkover === m.id
                      ? <section className="section" aria-label="Walkover or retired">
                          <p className="small muted" style={{ margin: 0 }}>Who goes through? Games already played are kept (a retirement); with none, it’s a walkover.</p>
                          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void giveWalkover(m, 'A')}>{names(m.sideA, pmap)} go through</button>
                          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void giveWalkover(m, 'B')}>{names(m.sideB, pmap)} go through</button>
                          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setWalkover(null)}>Cancel</button>
                        </section>
                      : <div className="meta">
                        <button type="button" className="btn btn-primary" onClick={() => go('club-score', m.id)}>Score</button>
                        <button type="button" className="btn btn-outline" onClick={() => setEntering(m.id)}>Enter result</button>
                        <button type="button" className="btn btn-outline" onClick={() => setWalkover(m.id)}>Walkover…</button>
                      </div>}
                </>
              )}
              {!m && call && (
                <>
                  <p className="small muted" style={{ margin: 0 }}>Next waiting: {who(call)}{call.court ? ` (booked for court ${call.court})` : ''}</p>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => moveTo(call, court)}>Bring it to court {court}</button>
                </>
              )}
              {!m && !call && <p className="small muted" style={{ margin: 0 }}>Nothing waiting.</p>}
            </div>
          );
        })}
      </section>
      <section className="section" aria-label="Up next">
        <h2 style={{ fontSize: 18 }}>Up next</h2>
        {queue.length === 0 && <p className="small muted" style={{ margin: 0 }}>No matches waiting.{t.status === 'live' ? ' Knockouts are drawn automatically when the pools finish.' : ''}</p>}
        {queue.map((m) => (
          <div key={m.id} className="match-row">
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block' }}>{who(m)}</span>
              <span className="small muted">{matchLabel(m, d)}{m.slot !== undefined ? ` · ${slotTime(t.startTime, m.slot, t.slotMinutes)}` : ''}</span>
            </span>
            <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Court
              <select className="input" style={{ width: 'auto', padding: '6px 8px' }} aria-label={`Court for ${who(m)}`} value={m.court ?? ''} disabled={busy} onChange={(e) => moveTo(m, Number(e.target.value))}>
                {Array.from({ length: t.courts }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
        ))}
      </section>
      <details className="card" style={{ padding: 10 }}>
        <summary>Pool tables</summary>
        {d.divisions.filter((x) => x.shape !== 'ko').map((x) => (
          <div key={x.id} className="section" aria-label={`${x.name} pool tables`}>
            <h2 style={{ fontSize: 16 }}>{x.name}</h2>
            <DivisionBody d={d} divisionId={x.id} view="pools" label={(e) => (e ? names(e.playerIds, pmap) : 'To be decided')} />
          </div>
        ))}
      </details>
    </main>
  );
}

// ---------- Entries: withdraw, replace a player, late entry, walk-in players ----------

export function Entries({ id, onBack }: { id: string; go?: Go; onBack: () => void }) {
  const { b, state } = useTournament(id);
  const [divId, setDivId] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = state.data;
  const pmap = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  if (!d || !b) return shell('Entries', onBack, state);
  const t = d.tournament;
  const div = d.divisions.find((x) => x.id === divId) ?? d.divisions[0];
  if (!div) return shell('Entries', onBack, { error: 'This tournament has no events', loading: false });
  const entries = d.entries.filter((e) => e.divisionId === div.id).sort((a, x) => (a.pool ?? 0) - (x.pool ?? 0) || (a.seed ?? 0) - (x.seed ?? 0));
  const taken = enteredPlayers(d.entries, div.id);
  const free = d.players.filter((p) => !taken.has(p.id)).sort((a, x) => a.name.localeCompare(x.name));

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setOpenEntry(null); state.reload(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  function withdraw(e: Entry) {
    const plan = planWithdraw(e.id, d!.matches);
    return run(async () => {
      await b!.patchMatches([
        ...plan.voidIds.map((mid) => ({ id: mid, patch: { status: 'void' as const } })),
        ...plan.walkovers.map((w) => ({ id: w.id, patch: { status: 'done' as const, winner: w.winner, games: [] } })),
      ]);
      await b!.updateEntry(e.id, { status: 'withdrawn' });
    }, `${names(e.playerIds, pmap)} withdrawn. ${plan.voidIds.length} match${plan.voidIds.length === 1 ? '' : 'es'} cancelled${plan.walkovers.length ? `, ${plan.walkovers.length} walkover${plan.walkovers.length > 1 ? 's' : ''}` : ''}.`);
  }
  function replace(e: Entry, oldId: string, newPlayer: string) {
    const plan = planReplacePlayer(e, oldId, newPlayer, d!.matches);
    if (typeof plan === 'string') return setMsg({ ok: false, text: plan });
    return run(async () => {
      await b!.updateEntry(e.id, { playerIds: plan.playerIds });
      if (plan.matchSides.length) await b!.patchMatches(plan.matchSides.map((m) => ({ id: m.id, patch: { sideA: m.sideA, sideB: m.sideB } })));
    }, `${pmap.get(newPlayer)?.name ?? 'New player'} is in for ${pmap.get(oldId)?.name ?? 'the player'}. Played results keep the original names.`);
  }
  function late(playerIds: string[]) {
    const plan = planLateEntry(t, div, playerIds, d!.entries, d!.matches, newId);
    if (typeof plan === 'string') return setMsg({ ok: false, text: plan });
    return run(async () => { await b!.addEntry(plan.entry); if (plan.matches.length) await b!.addMatches(plan.matches); },
      `${names(playerIds, pmap)} added to Pool ${poolLetter(plan.entry.pool)} with ${plan.matches.length} new match${plan.matches.length === 1 ? '' : 'es'}`);
  }

  return (
    <main className="screen" aria-labelledby="entries-title">
      <Header id="entries-title" title="Entries" onBack={onBack} />
      <DemoNote b={b} />
      {d.divisions.length > 1 && <Segmented label="Event" value={div.id} options={d.divisions.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => { setDivId(v); setOpenEntry(null); }} />}
      <p className="small muted" style={{ margin: 0 }}>{entries.filter((e) => e.status !== 'withdrawn').length} active {div.kind === 'doubles' ? 'teams' : 'players'} · {formatRule(div.format)}</p>
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {entries.map((e) => {
        const out = e.status === 'withdrawn';
        const isOpen = openEntry === e.id;
        return (
          <section key={e.id} className="card section" aria-label={names(e.playerIds, pmap)} style={out ? { opacity: 0.6 } : undefined}>
            <div className="row">
              <span><b>{names(e.playerIds, pmap)}</b> <span className="small muted">Pool {poolLetter(e.pool)} · seed {e.seed ?? '–'}</span></span>
              {out ? <span className="pill">Withdrawn</span> : <button type="button" className="link-btn" aria-expanded={isOpen} onClick={() => setOpenEntry(isOpen ? null : e.id)}>{isOpen ? 'Close' : 'Change'}</button>}
            </div>
            {isOpen && !out && <EntryActions e={e} pmap={pmap} free={free} busy={busy} onWithdraw={() => withdraw(e)} onReplace={(o, n) => replace(e, o, n)} />}
          </section>
        );
      })}
      <LateEntry kind={div.kind} free={free} busy={busy} onAdd={late} />
      <WalkIn b={b} clubId={t.clubId} busy={busy} onAdded={(p) => { setMsg({ ok: true, text: `${p.name} added to the club. Now enter them above.` }); state.reload(); }} />
    </main>
  );
}

function EntryActions({ e, pmap, free, busy, onWithdraw, onReplace }: { e: Entry; pmap: Map<string, ClubPlayer>; free: ClubPlayer[]; busy: boolean; onWithdraw: () => void; onReplace: (oldId: string, newId: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [oldId, setOldId] = useState(e.playerIds[0]);
  const [newPlayer, setNewPlayer] = useState('');
  return (
    <div className="section">
      <div className="label">Replace a player</div>
      {e.playerIds.length > 1 && (
        <select className="input" aria-label="Player going out" value={oldId} onChange={(x) => setOldId(x.target.value)}>
          {e.playerIds.map((p) => <option key={p} value={p}>{pmap.get(p)?.name ?? 'Unknown'} goes out</option>)}
        </select>
      )}
      <select className="input" aria-label="Player coming in" value={newPlayer} onChange={(x) => setNewPlayer(x.target.value)}>
        <option value="">Choose who comes in…</option>
        {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="button" className="btn btn-outline" disabled={busy || !newPlayer} onClick={() => onReplace(oldId, newPlayer)}>Replace</button>
      <div className="label">Withdraw</div>
      <p className="small muted" style={{ margin: 0 }}>Unplayed pool matches are cancelled and don’t count. In the knockouts, the opponent goes through. Played results stay.</p>
      {!confirm
        ? <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setConfirm(true)}>Withdraw…</button>
        : <div className="meta"><button type="button" className="btn btn-primary" disabled={busy} onClick={onWithdraw}>Yes, withdraw</button><button type="button" className="btn btn-outline" onClick={() => setConfirm(false)}>Keep them in</button></div>}
    </div>
  );
}

function LateEntry({ kind, free, busy, onAdd }: { kind: 'singles' | 'doubles'; free: ClubPlayer[]; busy: boolean; onAdd: (ids: string[]) => void }) {
  const [a, setA] = useState('');
  const [p2, setP2] = useState('');
  const need = kind === 'doubles' ? 2 : 1;
  const ids = [a, p2].slice(0, need).filter(Boolean);
  return (
    <section className="card section" aria-label="Late entry">
      <h3 style={{ fontSize: 16 }}>Late entry</h3>
      <p className="small muted" style={{ margin: 0 }}>Joins the smallest pool, with a match against each player in it, scheduled after the matches already booked. Not possible once knockouts start.</p>
      <select className="input" aria-label="Late entry player" value={a} onChange={(e) => setA(e.target.value)}>
        <option value="">Choose a player…</option>
        {free.map((p) => <option key={p.id} value={p.id}>{p.name} ({fmtRating(kind === 'singles' ? p.duprSingles : p.duprDoubles)})</option>)}
      </select>
      {need === 2 && (
        <select className="input" aria-label="Late entry partner" value={p2} onChange={(e) => setP2(e.target.value)}>
          <option value="">Choose a partner…</option>
          {free.filter((p) => p.id !== a).map((p) => <option key={p.id} value={p.id}>{p.name} ({fmtRating(p.duprDoubles)})</option>)}
        </select>
      )}
      <button type="button" className="btn btn-outline" disabled={busy || ids.length !== need} onClick={() => { onAdd(ids); setA(''); setP2(''); }}>Add to the event</button>
    </section>
  );
}

/** Adds a walk-in player to the club's roster (they can link their own account later). */
export function WalkIn({ b, clubId, busy, onAdded }: { b: ClubBackend; clubId: string; busy?: boolean; onAdded: (p: ClubPlayer) => void }) {
  const [name, setName] = useState('');
  const [rating, setRating] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function add() {
    const r = rating.trim() ? Number(rating) : undefined;
    if (!name.trim()) return setMsg('Enter their name');
    if (r !== undefined && (!Number.isFinite(r) || r < 1 || r > 8)) return setMsg('DUPR is a number between 1 and 8, or leave it empty');
    setSaving(true); setMsg(null);
    try { const p = await b.addPlayer(clubId, { name: name.trim(), duprSingles: r, duprDoubles: r }); setName(''); setRating(''); onAdded(p); }
    catch (e) { setMsg(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <section className="card section" aria-label="Add a walk-in player">
      <h3 style={{ fontSize: 16 }}>Add a walk-in player</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 8 }}>
        <input className="input" aria-label="Walk-in player name" placeholder="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <input className="input" aria-label="Walk-in player DUPR" placeholder="DUPR" inputMode="decimal" value={rating} onChange={(e) => setRating(e.target.value)} />
      </div>
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <button type="button" className="btn btn-outline" disabled={busy || saving} onClick={add}>Add player</button>
    </section>
  );
}

// ---------- DUPR export ----------

export function DuprExport({ id, onBack }: { id: string; go?: Go; onBack: () => void }) {
  const { b, state } = useTournament(id);
  const [ids, setIds] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = state.data;
  const pmap = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  if (!d || !b) return shell('Send to DUPR', onBack, state);
  const t = d.tournament;
  const c = duprCheck(d.matches, pmap);

  async function saveIds() {
    const changes = Object.entries(ids).filter(([, v]) => v.trim());
    const bad = changes.find(([, v]) => !/^[A-Za-z0-9-]{3,20}$/.test(v.trim()));
    if (bad) return setMsg({ ok: false, text: `${pmap.get(bad[0])?.name}: a DUPR ID is 3 to 20 letters or numbers` });
    setBusy(true); setMsg(null);
    try {
      for (const [pid, v] of changes) await b!.updatePlayer(pid, { duprId: v.trim().toUpperCase() });
      setIds({}); setMsg({ ok: true, text: `Saved ${changes.length} DUPR ID${changes.length === 1 ? '' : 's'}` }); state.reload();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  function download() {
    const csv = duprCsv(t, d!.divisions, c.ready, pmap);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${t.name.replace(/[^\w-]+/g, '-')}-DUPR.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg({ ok: true, text: `Downloaded ${c.ready.length} match${c.ready.length === 1 ? '' : 'es'}. Upload it in DUPR: your club › Matches › Add matches › Import via CSV.` });
  }

  return (
    <main className="screen" aria-labelledby="dupr-title">
      <Header id="dupr-title" title="Send to DUPR" onBack={onBack} />
      <DemoNote b={b} />
      <section className="card section" aria-label="Ready for DUPR">
        <div className="row"><span>Ready to send</span><b>{c.ready.length}</b></div>
        <div className="row"><span>Waiting for DUPR IDs</span><b>{c.missingIds.length}</b></div>
        <div className="row"><span>Not finished yet</span><b>{c.unfinished}</b></div>
        {c.noScores > 0 && <div className="row"><span>Walkovers (DUPR needs real scores)</span><b>{c.noScores}</b></div>}
      </section>
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {c.playersMissing.length > 0 && (
        <section className="section" aria-label="Missing DUPR IDs">
          <h2 style={{ fontSize: 18 }}>Add missing DUPR IDs</h2>
          <p className="small muted" style={{ margin: 0 }}>Players find their ID in the DUPR app, under their name. It’s saved on their club profile for next time.</p>
          {c.playersMissing.map((p) => (
            <label key={p.id} className="row" style={{ gap: 8 }}>
              <span style={{ flex: 1 }}>{p.name}</span>
              <input className="input" style={{ maxWidth: 160 }} aria-label={`DUPR ID for ${p.name}`} placeholder="DUPR ID" value={ids[p.id] ?? ''} onChange={(e) => setIds((x) => ({ ...x, [p.id]: e.target.value }))} />
            </label>
          ))}
          <button type="button" className="btn btn-outline" disabled={busy || !Object.values(ids).some((v) => v.trim())} onClick={saveIds}>Save DUPR IDs</button>
        </section>
      )}
      <button type="button" className="btn btn-primary" disabled={!c.ready.length} onClick={download}>Download the DUPR file ({c.ready.length})</button>
      <p className="small muted" style={{ margin: 0 }}>Only finished matches with real scores, where every player has a DUPR ID, are included. You can download again later as more IDs are added.</p>
    </main>
  );
}
