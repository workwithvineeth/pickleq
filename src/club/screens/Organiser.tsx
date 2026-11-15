import { flushLinkUnsent } from '../matchdaySafety';
import { useFlushUnsent } from '../useFlushUnsent';
import { OfflineBanner } from './OfflineBanner';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Field, Segmented } from '../../components/Controls';
import { newId } from '../../db/ids';
import type { Go } from '../../navigation';
import type { ClubBackend } from '../backend';
import { poolLetter, slotTime } from '../domain/engine';
import { duprCheck, duprCsv } from '../dupr';
import { publicSources } from '../index';
import { enteredPlayers, knockoutMatchesToAdd, planLateEntry, planReplacePlayer, planWithdraw } from '../plan';
import { isStaff, STAGE_LABEL, type ClubPlayer, type Entry, type ScorerLink, type ScorerView } from '../types';
import { appLink, DemoNote, errorText, fmtRating, Header, names, shareLink, Status, useLoad } from './common';
import { formatRule, ScorePad } from './ScorePad';
import { AccessCards } from './Access';
import { MatchdayShell, RefTabs } from './DeskFrame';
import { Legacy } from './InboxLegacy';
import { PageHead } from '../../rallyq/shell/Shell';
import { useClubBackend, useDesk } from './deskContext';
import { EntriesInbox } from './Inbox';
import { AddPanel } from './AddPanel';

/** Loads a tournament for an organiser screen, drawing any knockout round that's ready. */
export function useTournament(id: string, poll?: number) {
  const b = useClubBackend();
  const [tick, setTick] = useState(0);
  const state = useLoad(async () => {
    if (!b) throw new Error('Open Club mode first');
    const t = await b.tournamentBundle(id);
    if (!t.desk && !isStaff(t.role)) throw new Error('Only the club’s organisers can run a tournament');
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
      {s.error && <DeskAgain />}
    </main>
  );
}

/** Inside a desk link: the organiser changed the desk PIN (or the link), so type it again. */
function DeskAgain() {
  const desk = useDesk();
  if (!desk) return null;
  return <button type="button" className="btn btn-primary" onClick={desk.leave}>Type the desk PIN again</button>;
}

// ---------- Scorer links ----------

const courtName = (c?: number) => (c ? `Court ${c}` : 'Roaming referee (any court)');

const COURT_LINES = <svg viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true"><g><rect x="1" y="1" width="298" height="198" /><line x1="150" y1="1" x2="150" y2="199" strokeWidth="4" /><line x1="105" y1="1" x2="105" y2="199" /><line x1="195" y1="1" x2="195" y2="199" /><line x1="1" y1="100" x2="105" y2="100" /><line x1="195" y1="100" x2="299" y2="100" /></g></svg>;
const shortUrl = (u: string) => u.replace(/^https?:\/\//, '').replace(/^(.{14}).*(.{10})$/, '$1…$2');
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function ScorerLinks({ id, go, onBack }: { id: string; go?: Go; onBack: () => void }) {
  const { b, state } = useTournament(id);
  const [tick, setTick] = useState(0);
  const links = useLoad(async () => (b ? b.scorerLinks(id) : []), [b, id, tick]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = state.data;
  if (!d || !b) return shell('Referee links', onBack, state);
  const t = d.tournament;
  const all = links.data ?? [];
  const have = new Set(all.filter((l) => !l.revoked).map((l) => l.court ?? 0));
  const missing = Array.from({ length: t.courts }, (_, i) => i + 1).filter((c) => !have.has(c));

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setTick((x) => x + 1); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  const url = (l: ScorerLink) => appLink(`#/court/${l.token}`);
  const onCourt = (c?: number) => c ? d.matches.find((m) => m.court === c && m.status === 'live') : undefined;
  const label = (m: NonNullable<ReturnType<typeof onCourt>>) => {
    const div = d.divisions.find((x) => x.id === m.divisionId);
    const pm = new Map(d.players.map((p) => [p.id, p]));
    const e = (eid?: string) => { const x = d.entries.find((y) => y.id === eid); return x ? names(x.playerIds, pm) : 'To be decided'; };
    return `${e(m.entryA)} v ${e(m.entryB)}${div ? ` · ${div.name}` : ''}`;
  };
  // The first working link nobody has opened yet gets the one yellow button.
  const firstToSend = missing.length ? undefined : all.find((l) => !l.revoked && !l.lastUsedAt);
  const sorted = [...all].sort((x, y) => (x.court ?? 99) - (y.court ?? 99));

  return (
    <MatchdayShell go={go ?? (() => undefined)} active="referees" d={d}>
      <PageHead cap={t.name} title={<span id="links-title">Referee links</span>} />
      <RefTabs go={go} id={t.id} on="links" />
      <Legacy><DemoNote b={b} /></Legacy>
      <div className="note">For a court referee: send the court link and the referee PIN. They open it on their phone and score; no account, no app, only that court’s matches. A roaming referee link works on any court (they pick one). For a desk helper: send the desk link and desk PIN below; desk access does more, so share it only with people running the day.</div>
      {(missing.length > 0 || !have.has(0)) && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {missing.length > 0 && <button type="button" className="btn" disabled={busy} onClick={() => run(() => b.createScorerLinks(t.id, t.clubId, missing), `Made ${missing.length} court link${missing.length > 1 ? 's' : ''}`)}>{have.size ? `Add links for ${missing.length} more court${missing.length > 1 ? 's' : ''}` : `Create referee links (${t.courts})`}</button>}
          {!have.has(0) && <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => b.createScorerLinks(t.id, t.clubId, [null]), 'Made a roaming referee link')}>Add a roaming referee link</button>}
        </div>
      )}
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'note' : 'warn'}>{msg.text}</div>}
      <Legacy><Status error={links.error} loading={links.loading && !links.data} /></Legacy>
      {sorted.length > 0 && <div className="grid g2">{sorted.map((l) => {
        const m = onCourt(l.court);
        const text = `${t.name}: score ${courtName(l.court)}. Open this link and type the referee PIN: ${url(l)}`;
        return (
          <section key={l.id} className="card mini" aria-label={`${courtName(l.court)} referee link`} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200, ...(l.revoked ? { opacity: 0.6 } : {}) }}>
            {COURT_LINES}
            <div className="between"><b className="disp" style={{ fontSize: 26 }}>{courtName(l.court)}</b>
              <span className={l.revoked ? 'st off' : m ? 'st live' : l.lastUsedAt ? 'st ok' : 'st wait'}>{l.revoked ? 'Turned off' : m ? 'Live' : l.lastUsedAt ? 'Opened' : 'Not opened yet'}</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <b style={{ fontSize: 15 }}>{m ? label(m) : l.court ? 'No match on court' : 'For any court: the referee picks one'}</b>
              <span className="mut" style={{ fontSize: 12 }}>{l.lastUsedAt ? `Last used ${timeOf(l.lastUsedAt)}` : 'Not used yet'}</span>
              <span className="n" style={{ fontSize: 15, letterSpacing: '.02em' }}>{shortUrl(url(l))}</span>
            </div>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 'auto', gap: 8 }}>
              {!l.revoked && <>
                <a className={firstToSend?.id === l.id ? 'btn sm' : 'btn ghost sm'} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
                <button type="button" className="btn ghost sm" onClick={async () => setMsg({ ok: true, text: await shareLink(`${t.name}: score ${courtName(l.court)}`, url(l)) })}>Share link</button>
                <button type="button" className="tlink mut" disabled={busy} onClick={() => run(() => b.updateScorerLink(l.id, { revoked: true }), `${courtName(l.court)} link turned off`)}>Turn off</button>
              </>}
              {l.revoked && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(() => b.updateScorerLink(l.id, { revoked: false }), `${courtName(l.court)} link is back on`)}>Turn back on</button>}
            </div>
          </section>
        );
      })}</div>}
      <AccessCards b={b} tournamentId={t.id} name={t.name} finished={t.status === 'done'} />
    </MatchdayShell>
  );
}

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
      if (!/isn['’]t valid|No connection/.test(errorText(e))) throw e;
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
  // After a result is saved, the list says so and offers the next match.
  const [justSaved, setJustSaved] = useState(false);
  // One shared link for every referee: each picks their court once on this phone.
  const pickKey = `pq-court-pick:${token}`;
  const [pick, setPickState] = useState<number | null>(() => { try { const v = Number(localStorage.getItem(pickKey)); return v > 0 ? v : null; } catch { return null; } });
  const evKey = `pq-court-event:${token}`;
  const [ev, setEvState] = useState<string>(() => { try { return localStorage.getItem(evKey) ?? ''; } catch { return ''; } });
  const setEv = (v: string) => { setEvState(v); try { if (v) localStorage.setItem(evKey, v); else localStorage.removeItem(evKey); } catch { /* private mode */ } };
  const grpKey = `pq-court-group:${token}`;
  const [grp, setGrpState] = useState<string>(() => { try { return localStorage.getItem(grpKey) ?? ''; } catch { return ''; } });
  const setGrp = (v: string) => { setGrpState(v); try { if (v) localStorage.setItem(grpKey, v); else localStorage.removeItem(grpKey); } catch { /* private mode */ } };
  const setPick = (c: number | null) => { setPickState(c); try { if (c) localStorage.setItem(pickKey, String(c)); else localStorage.removeItem(pickKey); } catch { /* private mode */ } };
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

  // Scores kept on this phone while offline go out when the list opens, when the signal returns, and every 15 seconds.
  useFlushUnsent(!!pin && !!src && !!view && !open, (active) => flushLinkUnsent(token, (id, patch) => src!.scorerSave(token, pin, id, patch), active), () => setTick((x) => x + 1));

  async function enter() {
    if (!/^\d{4,6}$/.test(typed)) return setErr('Enter the PIN the organiser gave you');
    setBusy(true); setErr(null);
    try { const r = await openLink(token, typed); setSrc(r.src); setView(r.view); setPin(typed); setTyped(''); }
    catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  const title = view ? (view.court ? `Court ${view.court}` : 'Scoring') : 'Referee';
  if (!pin || !view || !src) {
    return (
      <main className="screen pq-matchday pq-proto pq-referee" aria-labelledby="court-title">
        <Header id="court-title" title={title} onBack={onBack} />
        <p className="small muted" style={{ margin: 0 }}>Referee: type the referee PIN the organiser gave you to score this court’s matches. No account needed.</p>
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
      <main className="screen pq-matchday pq-proto pq-referee" aria-labelledby="court-title">
        <Header id="court-title" title={`${current.division ?? ''} ${current.stage === 'pool' ? `Pool ${poolLetter(current.pool)}` : STAGE_LABEL[current.stage]}`.trim()} onBack={() => { setOpen(null); setTick((x) => x + 1); }} />
        {current.court && <p className="small" style={{ margin: 0, fontWeight: 600 }}>Court {current.court}</p>}
        <ScorePad
          key={current.id}
          matchKey={`link:${token}:${current.id}`}
          initialGames={current.games}
          format={current.format}
          nameA={a}
          nameB={bn}
          doubles={current.namesA.length > 1}
          playedOn={current.playedOn ?? t.startDate}
          send={(patch) => src.scorerSave(token, pin, current.id, patch)}
          onFinished={() => { setOpen(null); setJustSaved(true); setTick((x) => x + 1); }}
          canScore={current.status !== 'done' && current.status !== 'void'}
        />
      </main>
    );
  }

  const anyCourt = !view.court;
  const courts = Array.from({ length: Math.max(1, t.courts ?? 1) }, (_, i) => i + 1);
  const onCourt = anyCourt && pick ? view.matches.filter((m) => m.court === pick) : view.matches;
  const events = [...new Set(onCourt.map((m) => m.division).filter((x): x is string => !!x))];
  const evNow = events.includes(ev) ? ev : '';
  // A group can be run on any court: once the referee picks a group, show all of that group's matches, whichever court they were planned for.
  const groups = evNow ? [...new Set(view.matches.filter((m) => m.division === evNow && m.stage === 'pool').map((m) => String(m.pool ?? 1)))].sort() : [];
  const hasKo = !!evNow && view.matches.some((m) => m.division === evNow && m.stage !== 'pool');
  const grpOptions = [...groups, ...(hasKo ? ['ko'] : [])];
  // With an event chosen, the referee always works from a group (or the knockouts); the first one is chosen until they pick.
  const grpNow = grpOptions.includes(grp) ? grp : (grpOptions[0] ?? '');
  const mine = evNow && grpNow === 'ko' ? view.matches.filter((m) => m.division === evNow && m.stage !== 'pool')
    : evNow && grpNow ? view.matches.filter((m) => m.division === evNow && m.stage === 'pool' && String(m.pool ?? 1) === grpNow)
    : evNow ? onCourt.filter((m) => m.division === evNow) : onCourt;
  const live = mine.filter((m) => m.status === 'live');
  const waiting = mine.filter((m) => m.status === 'scheduled');
  const done = mine.filter((m) => m.status === 'done').reverse();
  if (anyCourt && !pick) {
    return (
      <main className="screen pq-matchday pq-proto pq-referee" aria-labelledby="court-title">
        <Header id="court-title" title="Which court are you on?" onBack={onBack} />
        <p className="small muted" style={{ margin: 0 }}>{view.club} · {t.name}</p>
        <section className="section" aria-label="Choose your court">
          {courts.map((c) => <button key={c} type="button" className="btn btn-primary pq-big" onClick={() => setPick(c)}>Court {c}</button>)}
        </section>
      </main>
    );
  }
  const row = (m: ScorerView['matches'][number], cta: string) => (
    <button key={m.id} type="button" className="match-row" aria-label={`${cta}: ${m.namesA.join(' / ')} against ${m.namesB.join(' / ')}`} onClick={() => { setJustSaved(false); setOpen(m.id); }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block' }}>{m.namesA.join(' / ')}</span>
        <span style={{ display: 'block' }}>{m.namesB.join(' / ')}</span>
        <span className="small muted">{[m.slot !== undefined ? slotTime(t.startTime, m.slot, t.slotMinutes) : '', !view.court && (!pick || grpNow) && m.court ? `Court ${m.court}` : '', m.division, m.stage === 'pool' ? `Pool ${poolLetter(m.pool)}` : STAGE_LABEL[m.stage]].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="small pq-score" style={{ textAlign: 'right' }}>{m.games.length ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : ''} <span className={m.status === 'live' ? 'pill pill-warn' : 'pill'}>{cta}</span></span>
    </button>
  );
  return (
    <main className="screen pq-matchday pq-proto pq-referee" aria-labelledby="court-title">
      <Header id="court-title" title={anyCourt && pick ? `Court ${pick}` : title} onBack={onBack} />
      <p className="small muted" style={{ margin: 0 }}>{view.club} · {t.name}{t.status === 'draft' ? ' · not started yet' : ''}</p>
      {anyCourt && pick && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setPick(null)}>Change court</button>}
      {events.length > 1 && <Segmented label="Which event are you refereeing?" value={evNow} options={[{ value: '', label: 'All' }, ...events.map((x) => ({ value: x, label: /double/i.test(x) ? 'Doubles' : /single/i.test(x) ? 'Singles' : x }))]} onChange={(v) => { setEv(v); setGrp(''); }} />}
      {grpOptions.length > 1 && <Segmented label="Which group?" value={grpNow} options={grpOptions.map((g) => ({ value: g, label: g === 'ko' ? 'Knockouts' : `Group ${poolLetter(Number(g))}` }))} onChange={setGrp} />}
      {err && <div role="status" className="msg msg-bad">{err}</div>}
      <OfflineBanner />
      {justSaved && (
        <div role="status" className="msg pq-saved-note">
          <b>Result saved</b>
          {waiting[0] && <> · <button type="button" className="link-btn" aria-label={`Start next: ${waiting[0].namesA.join(' / ')} vs ${waiting[0].namesB.join(' / ')}`} onClick={() => { setJustSaved(false); setOpen(waiting[0].id); }}>Start next: {waiting[0].namesA.join(' / ')} vs {waiting[0].namesB.join(' / ')}</button></>}
        </div>
      )}
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
              <span className="small pq-score">{m.games.length ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : 'Walkover'}</span>
            </div>
          ))}
        </section>
      )}
      <p className="small muted" style={{ margin: 0 }}>Updates every 15 seconds. Scores are kept on this phone if the signal drops, and sent when it’s back.</p>
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setPin(''); setView(null); }}>Stop scoring on this phone</button>
    </main>
  );
}

// ---------- Entries: withdraw, replace a player, late entry, walk-in players ----------

export function Entries({ id, go, onBack }: { id: string; go?: Go; onBack: () => void }) {
  const { b, state } = useTournament(id);
  const [divId, setDivId] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const d = state.data;
  const payments=useLoad(async()=>b && d?.tournament.entryMode==='registration'?b.registrations(id):null,[b,id,d?.tournament.entryMode]);
  const pmap = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  if (!d || !b) return shell('Entries', onBack, state);
  const t = d.tournament;
  // One Entries screen (Phase 3): before the draw, players' registrations are the entries.
  if (t.entryMode === 'registration' && !t.drawnAt && go) return <EntriesInbox id={id} go={go} onBack={onBack} />;
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
  // The simple way in: just a name and an event. The team joins the pool with the fewest teams. A doubles team made from a
  // team name alone gets a placeholder partner ("<name> (partner)"), which every screen hides.
  async function addTeam(name: string) {
    const clean = name.trim();
    if (!clean) return setMsg({ ok: false, text: 'Enter the team or player name' });
    // Check the event can take a new entry before creating anything on the roster.
    const need = div.kind === 'doubles' ? 2 : 1;
    const dry = planLateEntry(t, div, Array.from({ length: need }, (_, i) => `new-${i}`), d!.entries, d!.matches, newId);
    if (typeof dry === 'string') return setMsg({ ok: false, text: dry });
    setBusy(true); setMsg(null);
    try {
      const first = await b!.addPlayer(t.clubId, { name: clean });
      const ids = [first.id];
      if (need === 2) ids.push((await b!.addPlayer(t.clubId, { name: `${clean} (partner)` })).id);
      const plan = planLateEntry(t, div, ids, d!.entries, d!.matches, newId);
      if (typeof plan === 'string') throw new Error(plan);
      await b!.addLatePoolEntry(plan.entry, plan.matches);
      setMsg({ ok: true, text: `${clean} added to ${div.name}, Pool ${poolLetter(plan.entry.pool)}, with ${plan.matches.length} new match${plan.matches.length === 1 ? '' : 'es'}.` });
      setAdding(false); state.reload();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  function late(playerIds: string[]) {
    const plan = planLateEntry(t, div, playerIds, d!.entries, d!.matches, newId);
    if (typeof plan === 'string') return setMsg({ ok: false, text: plan });
    return run(() => b!.addLatePoolEntry(plan.entry, plan.matches),
      `${names(playerIds, pmap)} added to Pool ${poolLetter(plan.entry.pool)} with ${plan.matches.length} new match${plan.matches.length === 1 ? '' : 'es'}`);
  }

  return (
    <MatchdayShell go={go ?? (() => undefined)} active="entries" d={d}>
      <PageHead cap={`${t.name} · ${formatRule(div.format)}`} title={<span id="entries-title">Entries</span>}
        actions={<>
          <button type="button" className="btn btn-primary sm" aria-expanded={adding} onClick={() => setAdding(!adding)}>+ Add team</button>
          {t.entryMode === 'registration' && go ? <button type="button" className="btn ghost sm" onClick={() => go('club-inbox', t.id)}>Entries &amp; UPI</button> : null}
        </>} />
      <Legacy><DemoNote b={b} /></Legacy>
      {d.divisions.length > 1 && <div className="tabs" role="group" aria-label="Event">{d.divisions.map((x) => <button key={x.id} type="button" className={x.id === div.id ? 'tab on' : 'tab'} aria-pressed={x.id === div.id} onClick={() => { setDivId(x.id); setOpenEntry(null); }}>{x.name}</button>)}</div>}
      <p className="mut" style={{ margin: 0, fontSize: 14 }}>{entries.filter((e) => e.status !== 'withdrawn').length} active {div.kind === 'doubles' ? 'teams' : 'players'} in the draw. Withdraw, swap a player or add a late entry here.</p>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'note' : 'warn'}>{msg.text}</div>}
      {adding && <AddTeam divisions={d.divisions} divId={div.id} onDiv={(x) => { setDivId(x); setOpenEntry(null); }} busy={busy} onAdd={addTeam} onClose={() => setAdding(false)} />}
      <div className="card"><div className="scroll"><table className="tbl" aria-label="Entries"><thead><tr><th>#</th><th>Team</th><th>Pool</th><th>Status</th><th><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th></tr></thead><tbody>
      {entries.map((e, i) => {
        const out = e.status === 'withdrawn';
        const isOpen = openEntry === e.id;
        const paid = payments.data?.find((r) => r.entryId === e.id)?.payment === 'paid';
        return (
          <Fragment key={e.id}>
            <tr aria-label={names(e.playerIds, pmap)} style={out ? { opacity: 0.6 } : undefined}>
              <td className="n" style={{ fontSize: 20 }}>{i + 1}</td>
              <td><b>{names(e.playerIds, pmap)}</b>{(() => { const rated = e.playerIds.flatMap((pid) => { const p = pmap.get(pid); const r = div.kind === 'doubles' ? p?.duprDoubles : p?.duprSingles; return r !== undefined ? [`${(p?.name ?? 'Unknown').split(/\s+/)[0]} ${fmtRating(r)}`] : []; }); return rated.length ? <div className="mut" style={{ fontSize: 12 }}>DUPR {rated.join(' · ')}</div> : null; })()}</td>
              <td>Pool {poolLetter(e.pool)}</td>
              <td><span className={out ? 'st off' : 'st ok'}>{out ? 'Withdrawn' : 'Active'}</span>{paid && <span className="st ok" style={{ marginLeft: 6 }}>Paid</span>}</td>
              <td style={{ textAlign: 'right' }}>{!out && <button type="button" className="btn ghost sm" aria-expanded={isOpen} onClick={() => setOpenEntry(isOpen ? null : e.id)}>{isOpen ? 'Close' : 'Change'}</button>}</td>
            </tr>
            {isOpen && !out && <tr className="expand" aria-label={`Change ${names(e.playerIds, pmap)}`}><td colSpan={5}><Legacy><EntryActions e={e} pmap={pmap} free={free} busy={busy} onWithdraw={() => withdraw(e)} onReplace={(o, n) => replace(e, o, n)} /></Legacy></td></tr>}
          </Fragment>
        );
      })}
      </tbody></table></div></div>
      <Legacy>
        <AddPanel modes={[{ value: 'late', label: 'Late entry' }, { value: 'walkin', label: 'New player' }]}>
          {(mode, { setMode }) => mode === 'late'
            ? <LateEntry kind={div.kind} free={free} busy={busy} onAdd={late} />
            : <WalkIn b={b} clubId={t.clubId} busy={busy} onAdded={(p) => { setMsg({ ok: true, text: `${p.name} added to the club. Now choose them as a late entry.` }); setMode('late'); state.reload(); }} />}
        </AddPanel>
      </Legacy>
    </MatchdayShell>
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

/** Simple add: a name and an event. The team joins the pool with the fewest teams. */
function AddTeam({ divisions, divId, onDiv, busy, onAdd, onClose }: { divisions: { id: string; name: string }[]; divId: string; onDiv: (id: string) => void; busy: boolean; onAdd: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  return (
    <section className="card section" aria-label="Add a team">
      <h3 style={{ fontSize: 16 }}>Add a team</h3>
      <input className="input" style={{ fontSize: 16 }} aria-label="Team or player name" placeholder="Team or player name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      {divisions.length > 1 && (
        <select className="input" style={{ fontSize: 16 }} aria-label="Event" value={divId} onChange={(e) => onDiv(e.target.value)}>
          {divisions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      <p className="small muted" style={{ margin: 0 }}>Joins the pool with the fewest teams and plays everyone in it. Not possible once the knockouts start.</p>
      <div className="meta">
        <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => { onAdd(name); setName(''); }}>Add</button>
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
      </div>
    </section>
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

export function DuprExport({ id, go, onBack }: { id: string; go?: Go; onBack: () => void }) {
  const { b, state } = useTournament(id);
  const [ids, setIds] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const d = state.data;
  const pmap = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  if (!d || !b) return shell('File for DUPR', onBack, state);
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
    <MatchdayShell go={go ?? (() => undefined)} active="referees" d={d}>
      <PageHead cap={t.name} title={<span id="dupr-title">File for DUPR</span>} />
      <RefTabs go={go} id={t.id} on="results" />
      <Legacy><DemoNote b={b} /></Legacy>
      <section className="grid g4" aria-label="Ready for DUPR">
        <div className="card stat" style={{ padding: 18 }}><div className="cap">Ready to send</div><div className="n acc">{c.ready.length}</div><div className="mut" style={{ fontSize: 13 }}>matches</div></div>
        <div className="card stat" style={{ padding: 18 }}><div className="cap">Waiting for DUPR IDs</div><div className="n">{c.missingIds.length}</div><div className="mut" style={{ fontSize: 13 }}>matches</div></div>
        <div className="card stat" style={{ padding: 18 }}><div className="cap">Not finished yet</div><div className="n">{c.unfinished}</div><div className="mut" style={{ fontSize: 13 }}>matches</div></div>
        {c.noScores > 0 && <div className="card stat" style={{ padding: 18 }}><div className="cap">Walkovers</div><div className="n">{c.noScores}</div><div className="mut" style={{ fontSize: 13 }}>DUPR needs real scores</div></div>}
      </section>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'note' : 'warn'}>{msg.text}</div>}
      {c.playersMissing.length > 0 && (
        <section className="card" aria-label="Missing DUPR IDs" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="disp" style={{ fontSize: 24, margin: 0 }}>Add missing DUPR IDs</h2>
          <p className="mut" style={{ margin: 0, fontSize: 14 }}>Players find their ID in the DUPR app, under their name. It’s saved on their club profile for next time.</p>
          {c.playersMissing.map((p) => (
            <label key={p.id} className="between" style={{ gap: 8 }}>
              <span style={{ flex: 1 }}>{p.name}</span>
              <input className="inp" style={{ maxWidth: 180 }} aria-label={`DUPR ID for ${p.name}`} placeholder="DUPR ID" value={ids[p.id] ?? ''} onChange={(e) => setIds((x) => ({ ...x, [p.id]: e.target.value }))} />
            </label>
          ))}
          <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} disabled={busy || !Object.values(ids).some((v) => v.trim())} onClick={saveIds}>Save DUPR IDs</button>
        </section>
      )}
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={!c.ready.length} onClick={download}>Download the DUPR file ({c.ready.length})</button>
      <p className="mut" style={{ margin: 0, fontSize: 14 }}>Only finished matches with real scores, where every player has a DUPR ID, are included. You upload the file in DUPR yourself. You can download again later as more IDs are added.</p>
    </MatchdayShell>
  );
}
