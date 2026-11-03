import { useState } from 'react';
import type { Go } from '../../navigation';
import { backend, rememberReturn, serverBackend } from '../index';
import { clubMode } from '../config';
import { friendlyDate } from '../dates';
import { poolLetter, standings, TIE_BREAK_TEXT } from '../domain/engine';
import { isStaff, KNOCKOUT_STAGES, STAGE_LABEL, type ClubMatch, type Division } from '../types';
import { isBronzeMatch, resultsChampions, resultsCsv, scoreText } from '../resultsReport';
import { ResultsHero } from './Brand';
import { displayPlayerName, appLink, errorText, Header, Status, useLoad } from './common';

export const resultsDuprLink = (id: string) => appLink(`#/club-results-dupr/${id}`);
type Edit = { singles?: string; doubles?: string; id?: string };

export function ResultsDupr({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const state = useLoad(async () => {
    const demo = clubMode() === 'demo' ? backend() : null;
    if (demo?.kind === 'demo') {
      try { return { bundle: await demo.resultsBundle(id), source: demo, admin: await demo.isPlatformAdmin() }; } catch { /* Real shared link while demo was open. */ }
    }
    const server = serverBackend();
    if (!server || !(await server.currentUser())) return null;
    const [bundle, admin] = await Promise.all([server.resultsBundle(id), server.isPlatformAdmin()]);
    return { bundle, source: server, admin };
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
  const champions = resultsChampions(data);
  const admin = state.data?.admin === true;
  const staff = isStaff(data.role) || admin;
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
        const patch = {
          ...(e.singles !== undefined ? { duprSingles: Math.round(Number(e.singles) * 1000) / 1000 } : {}),
          ...(e.doubles !== undefined ? { duprDoubles: Math.round(Number(e.doubles) * 1000) / 1000 } : {}),
          ...(e.id !== undefined ? { duprId: e.id.trim().toUpperCase() } : {}),
        };
        if (admin) await b.adminUpdateTournamentDupr(id, pid, patch);
        else await b.updatePlayer(pid, patch);
        saved++;
      }
      setEdits({}); state.reload(); setMsg({ ok: true, text: 'Saved. PaddleQ can see the new DUPR details now.' });
    } catch (e) { setMsg({ ok: false, text: `${saved ? `${saved} player(s) saved before the error. Remaining edits are kept. ` : ''}${errorText(e)}` }); }
    finally { setBusy(false); }
  }
  function player(pid: string, div: Division, editable = false) {
    const p = pmap.get(pid); if (!p) return <span key={pid}>Unknown player</span>;
    const rating = div.kind === 'singles' ? p.duprSingles : p.duprDoubles;
    return <div key={pid} className={`pq-result-player${editable ? ' pq-result-edit-player' : ''}`}><span>{displayPlayerName(p.name)}</span>
      <span className={`small${rating === undefined ? ' pq-result-missing' : ' muted'}`}>DUPR {div.kind}: {rating ?? 'Missing rating'}</span>
      {editable && staff && <div className="meta no-print">
        <label className="small">{div.kind === 'singles' ? 'Singles' : 'Doubles'} rating
          <input className={`input${rating === undefined ? ' pq-result-input-missing' : ''}`} inputMode="decimal" aria-label={`${p.name} DUPR ${div.kind} rating`} disabled={busy}
            value={edits[pid]?.[div.kind] ?? (rating === undefined ? '' : String(rating))} onChange={(e) => edit(pid, div.kind, e.target.value)} />
        </label>
        <label className="small">DUPR ID<input className={`input${!p.duprId ? ' pq-result-input-missing' : ''}`} aria-label={`${p.name} DUPR ID`} disabled={busy}
            value={edits[pid]?.id ?? p.duprId ?? ''} onChange={(e) => edit(pid, 'id', e.target.value)} /></label>
      </div>}
    </div>;
  }
  function side(ids: string[], div: Division) { return ids.length ? ids.map((pid) => player(pid, div)) : <span>To be decided / bye</span>; }
  function match(m: ClubMatch, div: Division) {
    return <article key={m.id} className="pq-result-match" aria-label={`${isBronzeMatch(m) ? 'Bronze' : STAGE_LABEL[m.stage]} match`}>
      <div className={m.winner === 'A' ? 'pq-result-winner' : ''}>{side(m.sideA, div)}</div><div className="small pq-result-score">{scoreText(m)}</div><div className={m.winner === 'B' ? 'pq-result-winner' : ''}>{side(m.sideB, div)}</div>
    </article>;
  }
  function csv() {
    const url = URL.createObjectURL(new Blob([resultsCsv(data)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${data.tournament.name.replace(/[^\w-]+/g, '-')}-results.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function savePage() {
    const source = document.querySelector('.pq-results-page'); if (!source) return;
    const doc = document.implementation.createHTMLDocument('Tournament results · PaddleQ');
    const charset = doc.createElement('meta'); charset.setAttribute('charset', 'utf-8'); doc.head.prepend(charset);
    const viewport = doc.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width, initial-scale=1'; doc.head.append(viewport);
    const policy = doc.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy'; policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'"; doc.head.append(policy);
    const css = doc.createElement('style');
    css.textContent = Array.from(document.styleSheets).flatMap((sheet) => { try { return Array.from(sheet.cssRules, (rule) => rule.cssText); } catch { return []; } }).join('\n');
    doc.head.append(css);
    const report = source.cloneNode(true) as HTMLElement;
    report.querySelectorAll('.no-print,button,input,script').forEach((node) => node.remove());
    const wrapper = doc.createElement('div'); wrapper.className = 'app pq-brand'; wrapper.append(report); doc.body.append(wrapper);
    const url = URL.createObjectURL(new Blob(['<!DOCTYPE html>\n' + doc.documentElement.outerHTML], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${data.tournament.name.replace(/[^\w-]+/g, '-')}-results.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="screen wide-ok pq-results-page" aria-labelledby="rd-title">
    <ResultsHero label="RESULTS" />
    <div className="pq-results-heading"><h1 id="rd-title" className="sr-only">Results and DUPR</h1><h2>{data.tournament.name}</h2>
      <p className="small muted">{[data.club.name, data.tournament.venue, data.tournament.city, friendlyDate(data.tournament.startDate), data.tournament.status === 'done' ? 'Finished' : data.tournament.status === 'live' ? 'Live' : 'Not started', `${data.matches.filter((m) => m.status !== 'void').length} matches on ${data.tournament.courts} courts`].filter(Boolean).join(' · ')}</p>
    </div>
    <div className="meta no-print pq-results-bar"><span className={`pill${missing.size ? ' pill-warn' : ' pill-ok'}`}>{missing.size ? `${missing.size} DUPR ratings missing` : 'All DUPR ratings in'}</span>
      <button className="btn btn-primary" disabled={dirty || busy} onClick={() => window.print()}>Save as PDF</button>
      <button className="btn btn-outline" disabled={dirty || busy} onClick={csv}>Download results (CSV)</button>
      <button className="btn btn-outline" disabled={dirty || busy} onClick={savePage}>Save this page</button>
      {staff && <button className="btn btn-outline" disabled={busy || !dirty} onClick={save}>Save DUPR details</button>}
      <button className="link-btn" onClick={onBack}>Back</button>
    </div>
    <p className="small muted no-print">{staff ? `${admin ? 'Admin' : 'Organiser'}: add or edit the ratings and IDs in the boxes below each group, then choose Save DUPR details. Saved details are available to authorised club organisers and PaddleQ admins.` : 'Results and saved DUPR details. Editing is available only to authorised club organisers and PaddleQ admins.'} These stored ratings have not been synchronised or verified with DUPR.</p>
    {staff && <p className="small muted no-print">Changes update this club’s player ratings wherever they appear. Ratings are stored to two decimal places.</p>}
    {dirty && <p role="status" className="small no-print">Save your edits before exporting. Exports use saved details.</p>}
    {msg && <div role={msg.ok ? 'status' : 'alert'} className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
    <section className="card section" aria-label="Champions"><h3>Champions</h3><div className="pq-results-champions">
      {champions.map((c) => <article className="pq-results-champion" key={c.division}><span className="small">{c.division}</span><b>{c.winner}</b><span className="small">Final against {c.opponent} · {c.score}</span></article>)}
      {!champions.length && <p className="small muted">Champions will appear after a completed final has a recorded winner.</p>}
    </div></section>
    {data.divisions.map((div) => <section key={div.id} className="section" aria-label={div.name}><h2>{div.name}</h2>
      {div.shape !== 'ko' && [...new Set(data.entries.filter((e) => e.divisionId === div.id).map((e) => e.pool ?? 1))].sort((a, b) => a - b).map((pool) => {
        const entries = data.entries.filter((e) => e.divisionId === div.id && (e.pool ?? 1) === pool);
        const matches = data.matches.filter((m) => m.divisionId === div.id && m.stage === 'pool' && (m.pool ?? 1) === pool);
        const rows = standings(entries.map((e) => e.id), matches);
        return <section key={pool} className="card section" aria-label={`${div.name} Group ${poolLetter(pool)}`}>
          <h3>Group {poolLetter(pool)}</h3><span className="sr-only">Pool standings</span>
          <table className="pool-table pq-results-table" aria-label={`Group ${poolLetter(pool)} table`}><thead><tr><th>{div.kind === 'doubles' ? 'Team' : 'Player'}</th><th><abbr title="Played">P</abbr></th><th>W</th><th>L</th><th><abbr title="Points for">PF</abbr></th><th><abbr title="Points against">PA</abbr></th><th>+/−</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={r.entryId} className={i < div.advance ? 'pq-result-qualifier' : ''}><td><span className="pq-result-position" aria-label={`Pool position ${i + 1}`}>{i + 1}</span>{entries.find((e) => e.id === r.entryId)?.playerIds.map((pid) => player(pid, div))}</td><td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.pointsFor}</td><td>{r.pointsAgainst}</td><td>{r.diff > 0 ? '+' : ''}{r.diff}</td></tr>)}</tbody>
          </table>
          {staff && <div className="pq-result-edit-list no-print" aria-label={`${div.name} Group ${poolLetter(pool)} DUPR details`}>
            {[...new Set(entries.flatMap((e) => e.playerIds))].map((pid) => player(pid, div, true))}
          </div>}
          <h4>Completed pool matches</h4>{matches.filter((m) => m.status === 'done').map((m) => match(m, div))}
        </section>;
      })}
      <section className="card section" aria-label={`${div.name} Knockout results`}><h3>Knockout results</h3>
        {!data.matches.some((m) => m.divisionId === div.id && (isBronzeMatch(m) || KNOCKOUT_STAGES.includes(m.stage as typeof KNOCKOUT_STAGES[number]))) && <p>No knockout matches yet.</p>}
        {KNOCKOUT_STAGES.map((stage) => {
          const matches = data.matches.filter((m) => m.divisionId === div.id && m.stage === stage).sort((a, b) => (a.bracketPos ?? 0) - (b.bracketPos ?? 0));
          if (stage === 'sf') return matches.map((m, index) => <section key={m.id}><h4>Semifinal {index + 1}</h4>{match(m, div)}</section>);
          const bronze = stage === 'final' ? data.matches.filter((m) => m.divisionId === div.id && isBronzeMatch(m)) : [];
          return <div key={stage}>{bronze.length > 0 && <section aria-label={div.name + ' Bronze match'}><h4>Bronze match</h4>{bronze.map((m) => match(m, div))}</section>}{matches.length > 0 && <section aria-label={`${div.name} ${STAGE_LABEL[stage]}`}><h4>{STAGE_LABEL[stage]}</h4>{matches.map((m) => match(m, div))}</section>}</div>;
        })}
      </section>
      {staff && div.shape === 'ko' && <section className="card section no-print" aria-label={`${div.name} DUPR details`}><h3>Edit DUPR details</h3>
        {[...new Set(data.entries.filter((e) => e.divisionId === div.id).flatMap((e) => e.playerIds))].map((pid) => player(pid, div, true))}
      </section>}
    </section>)}
    <p className="pq-results-footer">Results from PaddleQ · paddleq.in · {TIE_BREAK_TEXT}</p>
  </main>;
}
