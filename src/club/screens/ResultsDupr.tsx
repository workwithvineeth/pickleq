import { useState } from 'react';
import type { Go } from '../../navigation';
import { backend, rememberReturn, serverBackend } from '../index';
import { clubMode } from '../config';
import { friendlyDate } from '../dates';
import { poolLetter, standings } from '../domain/engine';
import { isStaff, KNOCKOUT_STAGES, STAGE_LABEL, type ClubMatch, type Division } from '../types';
import { resultsCsv, resultsPdf, scoreText } from '../resultsReport';
import { ResultsHero } from './Brand';
import { appLink, errorText, Header, Status, useLoad } from './common';

export const resultsDuprLink = (id: string) => appLink(`#/club-results-dupr/${id}`);
type Edit = { singles?: string; doubles?: string; id?: string };

export function ResultsDupr({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const state = useLoad(async () => {
    const demo = clubMode() === 'demo' ? backend() : null;
    if (demo?.kind === 'demo') {
      try { return { bundle: await demo.resultsBundle(id), source: demo }; } catch { /* Real shared link while demo was open. */ }
    }
    const server = serverBackend();
    if (!server || !(await server.currentUser())) return null;
    return { bundle: await server.resultsBundle(id), source: server };
  }, [id]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const d = state.data?.bundle;
  const b = state.data?.source;
  if (!d) return <main className="screen"><Header id="rd-title" title="Results and DUPR" onBack={onBack} />
    <Status error={state.error} loading={state.loading} />
    {!state.loading && !state.error && <><p>Sign in to view this tournament’s results and DUPR details.</p>
      <button className="btn btn-primary" onClick={() => { rememberReturn(`#/club-results-dupr/${id}`); go('club-signin'); }}>Sign in to view results</button></>}
  </main>;
  const data = d;
  const staff = isStaff(data.role);
  const dirty = Object.keys(edits).length > 0;
  const pmap = new Map(data.players.map((p) => [p.id, p]));
  const missing = new Set<string>();
  for (const div of data.divisions) for (const e of data.entries.filter((e) => e.divisionId === div.id)) for (const pid of e.playerIds) {
    const p = pmap.get(pid);
    if (p && (div.kind === 'singles' ? p.duprSingles : p.duprDoubles) === undefined) missing.add(`${pid}|${div.kind}`);
  }
  function edit(pid: string, field: keyof Edit, value: string) { setEdits((x) => ({ ...x, [pid]: { ...x[pid], [field]: value } })); }
  async function save() {
    if (!b || busy) return;
    for (const [pid, e] of Object.entries(edits)) {
      for (const v of [e.singles, e.doubles]) if (v !== undefined && (!v.trim() || !Number.isFinite(Number(v)) || Number(v) < 1 || Number(v) > 8)) {
        return setMsg({ ok: false, text: `${pmap.get(pid)?.name}: a DUPR rating is a number from 1 to 8` });
      }
      if (e.id !== undefined && !/^[A-Za-z0-9-]{3,20}$/.test(e.id.trim())) return setMsg({ ok: false, text: `${pmap.get(pid)?.name}: a DUPR ID is 3 to 20 letters or numbers` });
    }
    setBusy(true); setMsg(null);
    let saved = 0;
    try {
      for (const [pid, e] of Object.entries(edits)) {
        await b.updatePlayer(pid, {
          ...(e.singles !== undefined ? { duprSingles: Math.round(Number(e.singles) * 1000) / 1000 } : {}),
          ...(e.doubles !== undefined ? { duprDoubles: Math.round(Number(e.doubles) * 1000) / 1000 } : {}),
          ...(e.id !== undefined ? { duprId: e.id.trim().toUpperCase() } : {}),
        });
        saved++;
      }
      setEdits({}); state.reload(); setMsg({ ok: true, text: 'Saved. PaddleQ can see the new DUPR details now.' });
    } catch (e) { setMsg({ ok: false, text: `${saved ? `${saved} player(s) saved before the error. Remaining edits are kept. ` : ''}${errorText(e)}` }); }
    finally { setBusy(false); }
  }
  function player(pid: string, div: Division, editable = false) {
    const p = pmap.get(pid); if (!p) return <span key={pid}>Unknown player</span>;
    const rating = div.kind === 'singles' ? p.duprSingles : p.duprDoubles;
    return <div key={pid} className="pq-result-player"><span>{p.name}</span>
      <span className={`small${rating === undefined ? ' pq-result-missing' : ' muted'}`}>DUPR {div.kind}: {rating ?? 'Missing rating'}</span>
      {editable && staff && <div className="meta no-print">
        <label className="small">{div.kind === 'singles' ? 'Singles' : 'Doubles'} rating
          <input className="input" style={{ width: 100 }} inputMode="decimal" aria-label={`${p.name} DUPR ${div.kind} rating`} disabled={busy}
            value={edits[pid]?.[div.kind] ?? (rating === undefined ? '' : String(rating))} onChange={(e) => edit(pid, div.kind, e.target.value)} />
        </label>
        <label className="small">DUPR ID<input className="input" style={{ width: 125 }} aria-label={`${p.name} DUPR ID`} disabled={busy}
            value={edits[pid]?.id ?? p.duprId ?? ''} onChange={(e) => edit(pid, 'id', e.target.value)} /></label>
      </div>}
    </div>;
  }
  function side(ids: string[], div: Division) { return ids.length ? ids.map((pid) => player(pid, div)) : <span>To be decided / bye</span>; }
  function match(m: ClubMatch, div: Division) {
    return <article key={m.id} className="pq-result-match" aria-label={`${STAGE_LABEL[m.stage]} match`}>
      <div>{side(m.sideA, div)}</div><div className="small">{scoreText(m)}{m.winner ? ` · Winner: ${m.winner === 'A' ? 'first side' : 'second side'}` : ''}</div><div>{side(m.sideB, div)}</div>
    </article>;
  }
  function csv() {
    const url = URL.createObjectURL(new Blob([resultsCsv(data)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${data.tournament.name.replace(/[^\w-]+/g, '-')}-results.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="screen wide-ok" aria-labelledby="rd-title">
    <Header id="rd-title" title="Results and DUPR" onBack={onBack} /><ResultsHero /><h2>{data.tournament.name}</h2>
    <p className="small muted">{[data.club.name, data.tournament.venue, data.tournament.city, friendlyDate(data.tournament.startDate)].filter(Boolean).join(' · ')}</p>
    <p className="small muted">Stored DUPR details entered by organisers. These ratings have not been synchronised or verified with DUPR.</p>
    <div className="meta no-print"><span className={`pill${missing.size ? ' pill-warn' : ' pill-ok'}`}>{missing.size ? `${missing.size} DUPR ratings missing` : 'All DUPR ratings in'}</span>
      <button className="btn btn-outline" disabled={dirty || busy} onClick={csv}>Download results (CSV)</button>
      <button className="btn btn-outline" disabled={dirty || busy} onClick={async () => { try { await resultsPdf(data); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } }}>Download PDF</button>
    </div>
    {dirty && <p role="status" className="small no-print">Save your edits before exporting. Exports use saved details.</p>}
    {msg && <div role={msg.ok ? 'status' : 'alert'} className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
    {data.divisions.map((div) => <section key={div.id} className="section" aria-label={div.name}><h2>{div.name}</h2>
      {div.shape !== 'ko' && [...new Set(data.entries.filter((e) => e.divisionId === div.id).map((e) => e.pool ?? 1))].sort((a, b) => a - b).map((pool) => {
        const entries = data.entries.filter((e) => e.divisionId === div.id && (e.pool ?? 1) === pool);
        const matches = data.matches.filter((m) => m.divisionId === div.id && m.stage === 'pool' && (m.pool ?? 1) === pool);
        const rows = standings(entries.map((e) => e.id), matches);
        return <section key={pool} className="card section" aria-label={`${div.name} Group ${poolLetter(pool)}`}>
          <h3>Group {poolLetter(pool)} · Pool standings</h3>
          <table className="pool-table pq-results-table" aria-label={`Group ${poolLetter(pool)} table`}><thead><tr><th>Player / team</th><th>W</th><th>L</th><th>+/−</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={r.entryId}><td><span className="small">Pool position {i + 1}</span>{entries.find((e) => e.id === r.entryId)?.playerIds.map((pid) => player(pid, div))}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.diff}</td></tr>)}</tbody>
          </table>
          <h4>Completed pool matches</h4>{matches.filter((m) => m.status === 'done').map((m) => match(m, div))}
        </section>;
      })}
      <section className="card section" aria-label={`${div.name} Knockout results`}><h3>Knockout results</h3>
        {!data.matches.some((m) => m.divisionId === div.id && KNOCKOUT_STAGES.includes(m.stage as typeof KNOCKOUT_STAGES[number])) && <p>No knockout matches yet.</p>}
        {KNOCKOUT_STAGES.map((stage) => {
          const matches = data.matches.filter((m) => m.divisionId === div.id && m.stage === stage).sort((a, b) => (a.bracketPos ?? 0) - (b.bracketPos ?? 0));
          return matches.length > 0 && <section key={stage} aria-label={`${div.name} ${STAGE_LABEL[stage]}`}><h4>{STAGE_LABEL[stage]}</h4>{matches.map((m) => match(m, div))}</section>;
        })}
      </section>
      {staff && <section className="card section no-print" aria-label={`${div.name} DUPR details`}><h3>Edit DUPR details</h3>
        {[...new Set(data.entries.filter((e) => e.divisionId === div.id).flatMap((e) => e.playerIds))].map((pid) => player(pid, div, true))}
      </section>}
    </section>)}
    {staff && <button className="btn btn-primary no-print" disabled={busy || !dirty} onClick={save}>Save DUPR details</button>}
  </main>;
}
