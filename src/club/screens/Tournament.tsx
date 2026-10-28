import { useEffect, useMemo, useState } from 'react';
import { Chips, Field, Segmented } from '../../components/Controls';
import { newId } from '../../db/db';
import type { BestOf, Format, PointsTo } from '../../domain/types';
import type { Go } from '../../navigation';
import type { PublicTournament, TournamentBundle } from '../backend';
import { entryRating, matchResult, poolLetter, slotTime, standings } from '../domain/engine';
import { backend, demoBackend, serverBackend } from '../index';
import { clubMode } from '../config';
import { checkDivision, knockoutMatchesToAdd, type NewDivisionInput } from '../plan';
import { isStaff, STAGE_LABEL, type ClubMatch, type ClubPlayer, type DivisionKind, type Entry } from '../types';
import { WalkIn } from './Organiser';
import { appLink, DemoNote, errorText, fmtRating, Header, names, shareLink, Status, useLoad } from './common';

const today = () => new Date().toISOString().slice(0, 10);

type Shape = 'rr' | 'pools-ko';
interface DivDraft { name: string; kind: DivisionKind; shape: Shape; pools: number; advance: number; pointsTo: PointsTo; golden: boolean; koBestOf: BestOf; koGolden: boolean; picked: string[]; teams: string[][] }
const newDraft = (kind: DivisionKind): DivDraft => ({ name: kind === 'singles' ? 'Open Singles' : 'Open Doubles', kind, shape: 'pools-ko', pools: 2, advance: 2, pointsTo: 11, golden: true, koBestOf: 3, koGolden: false, picked: [], teams: [] });
const SCORING = [{ value: 'golden', label: 'Golden point' }, { value: 'win2', label: 'Win by 2' }];

export function TournamentNew({ clubId, go, onBack }: { clubId: string; go: Go; onBack: () => void }) {
  const b = backend();
  const club = useLoad(async () => { if (!b) throw new Error('Open Club mode first'); return b.clubBundle(clubId); }, [b, clubId]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today());
  const [time, setTime] = useState('08:00');
  const [courts, setCourts] = useState(4);
  const [slot, setSlot] = useState(20);
  const [divs, setDivs] = useState<DivDraft[]>([newDraft('singles')]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const players = useMemo(() => [...(club.data?.players ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [club.data]);
  const pmap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const update = (i: number, patch: Partial<DivDraft>) => setDivs((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  function toInput(d: DivDraft): NewDivisionInput {
    const fmt: Format = { pointsTo: d.pointsTo, bestOf: 1, scoring: 'sideout', golden: d.golden };
    const rr = d.shape === 'rr';
    return { name: d.name, kind: d.kind, format: fmt, koFormat: { ...fmt, bestOf: d.koBestOf, golden: d.koGolden }, pools: rr ? 1 : d.pools, advance: rr ? 0 : d.advance, entries: d.kind === 'singles' ? d.picked.map((p) => [p]) : d.teams };
  }
  async function create() {
    if (!b) return;
    if (name.trim().length < 2) return setMsg('Give the tournament a name');
    for (const d of divs) { const e = checkDivision(toInput(d)); if (e) return setMsg(`${d.name || 'Event'}: ${e}`); }
    setBusy(true); setMsg(null);
    try { go('club-tournament', await b.createTournament({ clubId, name, startDate: date, startTime: time, courts, slotMinutes: slot, divisions: divs.map(toInput) }), { replace: true }); }
    catch (e) { setMsg(errorText(e)); setBusy(false); }
  }

  return (
    <main className="screen" aria-labelledby="tnew-title">
      <Header id="tnew-title" title="New tournament" onBack={onBack} />
      <Status error={club.error} loading={club.loading && !club.data} />
      <Field label="Tournament name"><input className="input" aria-label="Tournament name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="First match"><input className="input" type="time" aria-label="First match" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      <Field label="Courts"><Chips label="Courts" value={courts} options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: n, label: String(n) }))} onChange={setCourts} /></Field>
      <Field label="Minutes per match slot"><Chips label="Minutes per match slot" value={slot} options={[15, 20, 25, 30, 40].map((n) => ({ value: n, label: String(n) }))} onChange={setSlot} /></Field>
      {divs.map((d, i) => (
        <section key={i} className="card section" aria-label={`Event ${i + 1}`}>
          <input className="input" aria-label={`Event ${i + 1} name`} value={d.name} onChange={(e) => update(i, { name: e.target.value })} />
          <Segmented label={`Event ${i + 1} type`} value={d.kind} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} onChange={(k) => update(i, { kind: k, picked: [], teams: [] })} />
          <Field label="Format"><Segmented label={`Event ${i + 1} format`} value={d.shape} options={[{ value: 'rr', label: 'Round robin' }, { value: 'pools-ko', label: 'Pools, then knockouts' }]} onChange={(v) => update(i, { shape: v })} /></Field>
          {d.shape === 'rr' && <p className="small muted" style={{ margin: 0 }}>Everyone plays everyone once. The table decides the winner.</p>}
          {d.shape === 'pools-ko' && <>
            <Field label="Pools"><Chips label={`Event ${i + 1} pools`} value={d.pools} options={[1, 2, 3, 4, 6, 8].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => update(i, { pools: v })} /></Field>
            <Field label="Go through to knockouts, per pool"><Chips label={`Event ${i + 1} going through`} value={d.advance} options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => update(i, { advance: v })} /></Field>
          </>}
          <Field label="Games to"><Chips label={`Event ${i + 1} games to`} value={d.pointsTo} options={[11, 15, 21].map((n) => ({ value: n as PointsTo, label: String(n) }))} onChange={(v) => update(i, { pointsTo: v })} /></Field>
          <Field label={d.shape === 'rr' ? 'At level scores' : 'Pool games, at level scores'}><Segmented label={`Event ${i + 1} scoring`} value={d.golden ? 'golden' : 'win2'} options={SCORING} onChange={(v) => update(i, { golden: v === 'golden' })} /></Field>
          <p className="small muted" style={{ margin: 0 }}>{d.golden ? `Golden point: at ${d.pointsTo - 1}–${d.pointsTo - 1} the next point wins.` : `Win by 2: play on past ${d.pointsTo} until someone leads by 2.`}</p>
          {d.shape === 'pools-ko' && <>
            <Field label="Knockout matches"><Chips label={`Event ${i + 1} knockout matches`} value={d.koBestOf} options={[{ value: 1 as BestOf, label: 'One game' }, { value: 3 as BestOf, label: 'Best of 3' }]} onChange={(v) => update(i, { koBestOf: v })} /></Field>
            <Field label="Knockout games, at level scores"><Segmented label={`Event ${i + 1} knockout scoring`} value={d.koGolden ? 'golden' : 'win2'} options={SCORING} onChange={(v) => update(i, { koGolden: v === 'golden' })} /></Field>
          </>}
          <EntryPicker d={d} players={players} pmap={pmap} onChange={(patch) => update(i, patch)} label={`Event ${i + 1}`} />
          {divs.length > 1 && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDivs((ds) => ds.filter((_, j) => j !== i))}>Remove this event</button>}
        </section>
      ))}
      <button type="button" className="btn btn-outline" onClick={() => setDivs((ds) => [...ds, newDraft(ds.some((x) => x.kind === 'doubles') ? 'singles' : 'doubles')])}>Add another event</button>
      {b && club.data && <WalkIn b={b} clubId={clubId} onAdded={(p) => { setMsg(null); club.reload(); setDivs((ds) => ds.map((d, j) => (j === ds.length - 1 ? { ...d, picked: [...d.picked, p.id] } : d))); }} />}
      <p className="small muted" style={{ margin: 0 }}>Players are seeded by DUPR and spread across pools so the strongest don’t meet early. Each match gets a court and a time, and nobody is booked on two courts at once.</p>
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <button type="button" className="btn btn-primary" disabled={busy || !club.data} onClick={create}>Create tournament</button>
    </main>
  );
}

function EntryPicker({ d, players, pmap, onChange, label }: { d: DivDraft; players: ClubPlayer[]; pmap: Map<string, ClubPlayer>; onChange: (p: Partial<DivDraft>) => void; label: string }) {
  const [q, setQ] = useState('');
  const inTeam = new Set(d.teams.flat());
  const shown = players.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) && !inTeam.has(p.id));
  const toggle = (id: string) => onChange({ picked: d.picked.includes(id) ? d.picked.filter((x) => x !== id) : [...d.picked, id] });
  function pairUp() {
    // Balanced teams: strongest with weakest of the players chosen.
    const sorted = [...d.picked].sort((a, b) => (entryRating([b], pmap, 'doubles') ?? 0) - (entryRating([a], pmap, 'doubles') ?? 0));
    const teams: string[][] = [];
    while (sorted.length >= 2) teams.push([sorted.shift() as string, sorted.pop() as string]);
    onChange({ teams: [...d.teams, ...teams], picked: sorted });
  }
  return (
    <div className="section">
      <div className="label">{d.kind === 'singles' ? `${d.picked.length} players entered` : `${d.teams.length} teams · ${d.picked.length} players chosen`}</div>
      {d.kind === 'doubles' && d.teams.map((t, i) => (
        <div key={i} className="row"><span>{t.map((id) => pmap.get(id)?.name).join(' / ')}</span><button type="button" className="link-btn" aria-label={`Split team ${i + 1}`} onClick={() => onChange({ teams: d.teams.filter((_, j) => j !== i) })}>Split</button></div>
      ))}
      {d.kind === 'doubles' && d.picked.length === 2 && <button type="button" className="btn btn-outline" onClick={() => onChange({ teams: [...d.teams, d.picked], picked: [] })}>Make these two a team</button>}
      {d.kind === 'doubles' && d.picked.length > 2 && <button type="button" className="btn btn-outline" onClick={pairUp}>Pair the chosen players by rating</button>}
      <input className="input" aria-label={`${label} find player`} placeholder="Find a player" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {shown.map((p) => (
          <label key={p.id} className="check-row">
            <input type="checkbox" checked={d.picked.includes(p.id)} onChange={() => toggle(p.id)} />
            <span style={{ flex: 1 }}>{p.name}</span>
            <span className="small muted">{fmtRating(d.kind === 'singles' ? p.duprSingles : p.duprDoubles)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

type View = 'schedule' | 'pools' | 'knockouts';

export function TournamentView({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) throw new Error('Open Club mode first');
    const t = await b.tournamentBundle(id);
    // Create knockout rounds as soon as they're ready (staff only).
    if (isStaff(t.role)) {
      const add = knockoutMatchesToAdd(t.tournament, t.divisions, t.entries, t.matches, newId);
      if (add.length) { await b.addMatches(add); return b.tournamentBundle(id); }
    }
    return t;
  }, [b, id]);
  // Remember the event and tab you were on, so coming back from scoring a match lands in the same place.
  const placeKey = `pq-club-place-${id}`;
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(placeKey) ?? 'null') as { div: string; view: View } | null; } catch { return null; } })();
  const [div, setDivState] = useState<string | null>(saved?.div ?? null);
  const [view, setViewState] = useState<View>(saved?.view ?? 'schedule');
  const remember = (next: { div: string | null; view: View }) => { try { sessionStorage.setItem(placeKey, JSON.stringify(next)); } catch { /* private mode */ } };
  const setDiv = (v: string) => { setDivState(v); remember({ div: v, view }); };
  const setView = (v: View) => { setViewState(v); remember({ div, view: v }); };
  const [msg, setMsg] = useState<string | null>(null);
  const d = state.data;
  if (!d) return <main className="screen wide-ok" aria-labelledby="t-title"><Header id="t-title" title="Tournament" onBack={onBack} /><Status error={state.error} loading={state.loading} /></main>;
  const staff = isStaff(d.role);
  const t = d.tournament;
  const division = d.divisions.find((x) => x.id === div) ?? d.divisions[0];
  const link = appLink(`#/results/${t.publicSlug}`);
  const pmap = new Map(d.players.map((p) => [p.id, p]));
  async function set(patch: Parameters<NonNullable<typeof b>['updateTournament']>[1], ok: string) {
    try { await b?.updateTournament(t.id, patch); setMsg(ok); state.reload(); } catch (e) { setMsg(errorText(e)); }
  }
  return (
    <main className="screen wide-ok" aria-labelledby="t-title">
      <Header id="t-title" title={t.name} onBack={onBack} />
      <DemoNote b={b} />
      <p className="small muted" style={{ margin: 0 }}>{d.club.name} · {t.startDate} · from {t.startTime} · {t.courts} courts · {t.status === 'live' ? 'Live' : t.status === 'done' ? 'Finished' : 'Not started'}</p>
      {staff && (
        <div className="meta">
          {t.status === 'draft' && <button type="button" className="btn btn-primary" onClick={() => set({ status: 'live' }, 'The tournament is live')}>Start tournament</button>}
          {t.status === 'live' && <button type="button" className="btn btn-outline" onClick={() => set({ status: 'done' }, 'Marked as finished')}>Mark as finished</button>}
          <button type="button" className="btn btn-outline" onClick={() => set({ isPublic: !t.isPublic }, t.isPublic ? 'Results link turned off' : 'Results link is on')}>{t.isPublic ? 'Turn off results link' : 'Turn on results link'}</button>
        </div>
      )}
      {staff && (
        <nav className="meta" aria-label="Run the tournament">
          <button type="button" className="btn btn-outline" onClick={() => go('club-desk', t.id)}>Desk view</button>
          <button type="button" className="btn btn-outline" onClick={() => go('club-scorers', t.id)}>Scorer links</button>
          <button type="button" className="btn btn-outline" onClick={() => go('club-entries', t.id)}>Entries</button>
          <button type="button" className="btn btn-outline" onClick={() => go('club-dupr', t.id)}>Send to DUPR</button>
        </nav>
      )}
      {t.isPublic && (
        <button type="button" className="banner-btn" style={{ background: 'var(--card)', color: 'var(--text)' }} onClick={async () => setMsg(await shareLink(`${t.name} results`, link))}>
          <span>Share the results link (no login needed)</span><span>›</span>
        </button>
      )}
      {msg && <div role="status" className="msg msg-ok">{msg}</div>}
      {d.divisions.length > 1 && <Segmented label="Event" value={division.id} options={d.divisions.map((x) => ({ value: x.id, label: x.name }))} onChange={setDiv} />}
      <Segmented label="Tournament view" value={view} options={[{ value: 'schedule', label: 'Schedule' }, { value: 'pools', label: 'Pools' }, { value: 'knockouts', label: 'Knockouts' }]} onChange={setView} />
      <DivisionBody d={d} divisionId={division.id} view={view} onScore={staff ? (mid) => go('club-score', mid) : undefined} label={(e) => (e ? `${names(e.playerIds, pmap)}${e.status === 'withdrawn' ? ' (withdrawn)' : ''}` : 'To be decided')} />
    </main>
  );
}

/** Shared by the club's tournament view and the public results page. */
function DivisionBody({ d, divisionId, view, onScore, label }: { d: Pick<TournamentBundle, 'divisions' | 'entries' | 'matches'> & { tournament: { startTime: string; slotMinutes: number } }; divisionId: string; view: View; onScore?: (matchId: string) => void; label: (e?: Entry) => string }) {
  const division = d.divisions.find((x) => x.id === divisionId);
  const entries = d.entries.filter((e) => e.divisionId === divisionId);
  const emap = new Map(entries.map((e) => [e.id, e]));
  const matches = d.matches.filter((m) => m.divisionId === divisionId);
  if (!division) return null;
  if (view === 'schedule') {
    const bySlot = new Map<number, ClubMatch[]>();
    for (const m of [...matches].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.court ?? 0) - (b.court ?? 0))) bySlot.set(m.slot ?? -1, [...(bySlot.get(m.slot ?? -1) ?? []), m]);
    return (
      <section className="section" aria-label="Schedule">
        {[...bySlot.entries()].map(([slot, ms]) => (
          <div key={slot} className="section">
            <div className="label">{slot >= 0 ? slotTime(d.tournament.startTime, slot, d.tournament.slotMinutes) : 'Time to be set'}</div>
            {ms.map((m) => <FixtureRow key={m.id} m={m} a={label(emap.get(m.entryA ?? ''))} b={label(emap.get(m.entryB ?? ''))} onScore={onScore} />)}
          </div>
        ))}
      </section>
    );
  }
  if (view === 'pools') {
    const pools = [...new Set(entries.map((e) => e.pool ?? 1))].sort((a, b) => a - b);
    return (
      <section className="section" aria-label="Pools">
        {pools.map((p) => {
          const ids = entries.filter((e) => (e.pool ?? 1) === p).map((e) => e.id);
          const rows = standings(ids, matches.filter((m) => m.stage === 'pool'), (id) => emap.get(id)?.seed ?? 99);
          return (
            <div key={p} className="card section">
              <h3 style={{ fontSize: 16 }}>Pool {poolLetter(p)}</h3>
              <table className="table" aria-label={`Pool ${poolLetter(p)}`}>
                <thead><tr><th>#</th><th>Name</th><th>P</th><th>W</th><th>+/−</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.entryId} style={r.rank <= division.advance ? { fontWeight: 600 } : undefined}>
                      <td>{r.rank}</td><td>{label(emap.get(r.entryId))}{r.rank <= division.advance && <span className="pill pill-ok" style={{ marginLeft: 6 }}>Through</span>}</td>
                      <td>{r.played}</td><td>{r.wins}</td><td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        <p className="small muted" style={{ margin: 0 }}>Ties are split by: wins, then head-to-head between the tied players, then points difference, then points won, then seed.</p>
      </section>
    );
  }
  const ko = matches.filter((m) => m.stage !== 'pool').sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.bracketPos ?? 0) - (b.bracketPos ?? 0));
  const rounds = [...new Set(ko.map((m) => m.round ?? 1))];
  return (
    <section className="section" aria-label="Knockouts">
      {division.advance === 0 && <p className="small muted">This event has no knockouts.</p>}
      {division.advance > 0 && ko.length === 0 && <p className="small muted">Knockouts are drawn once every pool match is finished.</p>}
      {rounds.map((r) => {
        const ms = ko.filter((m) => (m.round ?? 1) === r);
        return (
          <div key={r} className="section">
            <h3 style={{ fontSize: 16 }}>{STAGE_LABEL[ms[0].stage]}{ms[0].stage === 'final' ? '' : 's'}</h3>
            {ms.map((m) => <FixtureRow key={m.id} m={m} a={label(emap.get(m.entryA ?? ''))} b={label(emap.get(m.entryB ?? ''))} onScore={onScore} />)}
          </div>
        );
      })}
    </section>
  );
}

function FixtureRow({ m, a, b, onScore }: { m: ClubMatch; a: string; b: string; onScore?: (id: string) => void }) {
  const r = matchResult(m);
  const winner = r.winner ?? (m.status === 'done' ? m.winner : undefined);
  const where = `${m.court ? `Court ${m.court}` : ''}${m.stage === 'pool' && m.pool ? ` · Pool ${poolLetter(m.pool)}` : ''}`;
  const score = m.games.length ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : '';
  const body = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: winner === 'A' ? 600 : 400 }}>{a}</span>
        <span style={{ display: 'block', fontWeight: winner === 'B' ? 600 : 400 }}>{b}</span>
        <span className="small muted">{where}</span>
      </span>
      <span className="small" style={{ textAlign: 'right' }}>
        {m.status === 'void' ? <span className="pill">Cancelled</span> : m.status === 'done' && !m.games.length ? 'Walkover' : m.status === 'done' ? score : m.status === 'live' ? <span className="pill pill-warn">Live {score}</span> : onScore ? <span className="pill">Score</span> : <span className="pill">To play</span>}
      </span>
    </>
  );
  return onScore && m.status !== 'done' && m.status !== 'void'
    ? <button type="button" className="match-row" aria-label={`Score ${a} against ${b}`} onClick={() => onScore(m.id)}>{body}</button>
    : <div className="match-row">{body}</div>;
}

/** Public results: no login, names and scores only. Refreshes every 20 seconds while the tournament is live. */
export function Results({ slug, onBack }: { slug: string; onBack: () => void }) {
  const src = clubMode() === 'demo' ? demoBackend() : serverBackend() ?? demoBackend();
  const [tick, setTick] = useState(0);
  const state = useLoad<PublicTournament | null>(() => src.publicTournament(slug), [slug, tick]);
  const [div, setDiv] = useState<string | null>(null);
  const [view, setView] = useState<View>('pools');
  const d = state.data;
  useEffect(() => {
    if (d?.status !== 'live') return;
    const h = window.setInterval(() => setTick((x) => x + 1), 20000);
    return () => window.clearInterval(h);
  }, [d?.status]);
  const division = d?.divisions.find((x) => x.id === div) ?? d?.divisions[0];
  return (
    <main className="screen" aria-labelledby="results-title">
      <Header id="results-title" title={d?.name ?? 'Results'} onBack={onBack} />
      <Status error={state.error} loading={state.loading && !d} />
      {!state.loading && !d && !state.error && <p className="muted">These results aren’t available. The link may be turned off.</p>}
      {d && division && (
        <>
          <p className="small muted" style={{ margin: 0 }}>{d.club} · {d.startDate}{d.status === 'live' ? ' · Live, updates every 20 seconds' : d.status === 'done' ? ' · Finished' : ''}</p>
          {d.divisions.length > 1 && <Segmented label="Event" value={division.id} options={d.divisions.map((x) => ({ value: x.id, label: x.name }))} onChange={setDiv} />}
          <Segmented label="Results view" value={view} options={[{ value: 'pools', label: 'Pools' }, { value: 'knockouts', label: 'Knockouts' }, { value: 'schedule', label: 'Matches' }]} onChange={setView} />
          <DivisionBody
            d={{
              divisions: d.divisions.map((x) => ({ ...x, tournamentId: '', clubId: '', sort: 0 })),
              entries: d.entries.map((e) => ({ ...e, clubId: '', playerIds: e.names })),
              matches: d.matches.map((m): ClubMatch => {
                const dv = d.divisions.find((x) => x.id === m.divisionId) ?? division;
                return { ...m, clubId: '', sideA: [], sideB: [], format: m.stage === 'pool' ? dv.format : dv.koFormat, updatedAt: '' };
              }),
              tournament: { startTime: d.startTime, slotMinutes: d.slotMinutes },
            }}
            divisionId={division.id} view={view} label={(e) => (e ? e.playerIds.join(' / ') : 'To be decided')}
          />
          <p className="small muted" style={{ margin: 0 }}>Scored with PICKLEQ.</p>
        </>
      )}
    </main>
  );
}
