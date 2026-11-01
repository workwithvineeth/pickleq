import { useMemo, useState } from 'react';
import type { Go } from '../../navigation';
import { backend } from '../index';
import { friendlyDate } from '../dates';
import { matchResult, poolLetter, standings } from '../domain/engine';
import { isStaff, type ClubPlayer, type Division } from '../types';
import { ResultsHero } from './Brand';
import { appLink, errorText, Header, Status, useLoad } from './common';

/** The organiser's link for this page (PaddleQ admins share it from Admin → Events). */
export const resultsDuprLink = (tournamentId: string) => appLink(`#/club-results-dupr/${tournamentId}`);

type Edit = { rating?: string; id?: string };

/**
 * Results by group with every player's DUPR rating and ID. The club's organisers fill in the missing ones (saved on the
 * player's club profile, so PaddleQ sees them at once) and download the results as a CSV or a PDF.
 */
export function ResultsDupr({ id, onBack }: { id: string; go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => { if (!b) throw new Error('Sign in first'); return b.tournamentBundle(id); }, [b, id]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const d = state.data;
  const pmap = useMemo(() => new Map((d?.players ?? []).map((p) => [p.id, p])), [d]);
  if (!d) return <main className="screen"><Header id="rd-title" title="Results and DUPR" onBack={onBack} /><Status error={state.error} loading={state.loading} /></main>;
  const t = d.tournament;
  const staff = isStaff(d.role);
  const ratingOf = (p: ClubPlayer, div: Division) => (div.kind === 'singles' ? p.duprSingles : p.duprDoubles);
  const key = (pid: string, div: Division) => `${pid}|${div.kind}`;
  const missing = new Set<string>();
  for (const div of d.divisions) for (const e of d.entries.filter((x) => x.divisionId === div.id && x.status !== 'withdrawn')) for (const pid of e.playerIds) {
    const p = pmap.get(pid); if (p && ratingOf(p, div) === undefined) missing.add(key(pid, div));
  }

  async function save() {
    const changes = Object.entries(edits);
    for (const [k, e] of changes) {
      if (e.rating?.trim() && !(Number(e.rating) >= 1 && Number(e.rating) <= 8)) return setMsg({ ok: false, text: `${pmap.get(k.split('|')[0])?.name}: a DUPR rating is a number like 3.25` });
      if (e.id?.trim() && !/^[A-Za-z0-9-]{3,20}$/.test(e.id.trim())) return setMsg({ ok: false, text: `${pmap.get(k.split('|')[0])?.name}: a DUPR ID is 3 to 20 letters or numbers` });
    }
    setBusy(true); setMsg(null);
    try {
      for (const [k, e] of changes) {
        const [pid, kind] = k.split('|');
        const patch: Parameters<NonNullable<typeof b>['updatePlayer']>[1] = {};
        if (e.rating?.trim()) patch[kind === 'singles' ? 'duprSingles' : 'duprDoubles'] = Math.round(Number(e.rating) * 1000) / 1000;
        if (e.id?.trim()) patch.duprId = e.id.trim().toUpperCase();
        if (Object.keys(patch).length) await b!.updatePlayer(pid, patch);
      }
      setEdits({}); setMsg({ ok: true, text: 'Saved. PaddleQ can see the new DUPR details now.' }); state.reload();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }

  function downloadCsv() {
    const rows: (string | number)[][] = [['Event', 'Group', 'Position', 'Player', 'DUPR rating', 'DUPR ID', 'W', 'L', 'Points for', 'Points against']];
    for (const div of d!.divisions) for (const g of groups(div)) g.rows.forEach((r, i) => {
      const e = d!.entries.find((x) => x.id === r.entryId);
      for (const pid of e?.playerIds ?? []) { const p = pmap.get(pid); rows.push([div.name, poolLetter(g.pool), i + 1, p?.name ?? '', p ? (ratingOf(p, div) ?? '') : '', p?.duprId ?? '', r.wins, r.losses, r.pointsFor, r.pointsAgainst]); }
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `${t.name.replace(/[^\w-]+/g, '-')}-results.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function groups(div: Division) {
    const ents = d!.entries.filter((e) => e.divisionId === div.id && e.status !== 'withdrawn');
    const pools = [...new Set(ents.map((e) => e.pool ?? 1))].sort((x, y) => x - y);
    return pools.map((pool) => {
      const ids = ents.filter((e) => (e.pool ?? 1) === pool).map((e) => e.id);
      const ms = d!.matches.filter((m) => m.divisionId === div.id && m.stage === 'pool' && (m.pool ?? 1) === pool);
      return { pool, rows: standings(ids, ms), matches: ms.filter((m) => m.status === 'done') };
    });
  }
  const nameOf = (eid?: string) => (d!.entries.find((e) => e.id === eid)?.playerIds ?? []).map((p) => pmap.get(p)?.name ?? '').join(' / ');
  const left = [...missing].filter((k) => !edits[k]?.rating?.trim()).length;

  return (
    <main className="screen wide-ok" aria-labelledby="rd-title">
      <Header id="rd-title" title="Results and DUPR" onBack={onBack} />
      <ResultsHero />
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, color: 'var(--accent)' }}>{t.name}</h2>
        <div className="small muted">{[t.venue, t.city, friendlyDate(t.startDate)].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="meta no-print">
        <span className={`pill${missing.size ? ' pill-warn' : ' pill-ok'}`}>{missing.size ? `${left} DUPR rating${left === 1 ? '' : 's'} missing` : 'All DUPR ratings in'}</span>
        <button type="button" className="btn btn-outline" onClick={downloadCsv}>Download results (CSV)</button>
        <button type="button" className="btn btn-outline" onClick={() => window.print()}>Download PDF</button>
      </div>
      {staff && missing.size > 0 && <p className="small muted no-print" style={{ margin: 0 }}>Type the missing DUPR ratings and IDs in the highlighted boxes, then tap Save.</p>}
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {d.divisions.map((div) => (
        <section key={div.id} className="section" aria-label={div.name}>
          <h2 style={{ fontSize: 18, color: 'var(--accent)' }}>{div.name}</h2>
          {groups(div).map((g) => (
            <section key={g.pool} className="card section" aria-label={`${div.name} Group ${poolLetter(g.pool)}`}>
              <h3 style={{ fontSize: 16 }}>Group {poolLetter(g.pool)}</h3>
              <table className="pool-table" aria-label={`Group ${poolLetter(g.pool)} table`} style={{ width: '100%', fontSize: 14 }}>
                <thead><tr><th style={{ textAlign: 'left' }}>{div.kind === 'doubles' ? 'Team' : 'Player'}</th><th>W</th><th>L</th><th>+/−</th></tr></thead>
                <tbody>{g.rows.map((r, i) => <tr key={r.entryId} style={{ fontWeight: i < 2 ? 600 : 400 }}><td style={{ textAlign: 'left' }}>{i + 1}. {nameOf(r.entryId)}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.diff > 0 ? '+' : ''}{r.diff}</td></tr>)}</tbody>
              </table>
              {g.rows.flatMap((r) => d.entries.find((e) => e.id === r.entryId)?.playerIds ?? []).map((pid) => {
                const p = pmap.get(pid); if (!p) return null;
                const k = key(pid, div); const rating = ratingOf(p, div);
                return (
                  <div key={k} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ flex: '1 1 120px', minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}</span>
                    {staff ? (
                      <>
                        <input className="input" style={{ width: 84, background: rating === undefined ? '#FBF0D9' : undefined, borderColor: rating === undefined ? '#9A6B1E' : undefined }} inputMode="decimal" aria-label={`${p.name} DUPR ${div.kind} rating`} placeholder="rating"
                          value={edits[k]?.rating ?? (rating !== undefined ? String(rating) : '')} onChange={(e) => setEdits((x) => ({ ...x, [k]: { ...x[k], rating: e.target.value } }))} />
                        <input className="input" style={{ width: 104, background: !p.duprId ? '#FBF0D9' : undefined, borderColor: !p.duprId ? '#9A6B1E' : undefined }} aria-label={`${p.name} DUPR ID`} placeholder="DUPR ID"
                          value={edits[k]?.id ?? p.duprId ?? ''} onChange={(e) => setEdits((x) => ({ ...x, [k]: { ...x[k], id: e.target.value } }))} />
                      </>
                    ) : <span className="small">{rating ?? '–'} · {p.duprId ?? '–'}</span>}
                  </div>
                );
              })}
              <div className="small" style={{ marginTop: 6 }}>
                {g.matches.map((m) => { const r = matchResult(m); return <div key={m.id} className="row" style={{ padding: '3px 0' }}><span style={{ fontWeight: m.winner === 'A' ? 600 : 400 }}>{nameOf(m.entryA)}</span><span>{r.pointsA}–{r.pointsB}</span><span style={{ fontWeight: m.winner === 'B' ? 600 : 400, textAlign: 'right' }}>{nameOf(m.entryB)}</span></div>; })}
              </div>
            </section>
          ))}
        </section>
      ))}
      {staff && <button type="button" className="btn btn-primary no-print" disabled={busy || !Object.keys(edits).length} onClick={save}>Save DUPR details</button>}
    </main>
  );
}
