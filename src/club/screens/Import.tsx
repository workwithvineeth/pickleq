import { useMemo, useState } from 'react';
import { Field, Segmented } from '../../components/Controls';
import type { ClubBackend, ImportResult } from '../backend';
import { buildImport, FIELD_LABEL, FIELDS, guessMapping, importSummary, parseTable, type Field as SheetField, type ImportSettings, type Mapping } from '../importSheet';
import type { ClubTournament, Division, Registration } from '../types';
import { errorText } from './common';

/**
 * Import entries from a Google Form: upload the response sheet as CSV, or paste rows copied from Google Sheets.
 * The organiser checks the column guesses and the preview, then imports. Importing again later adds only new rows.
 */
export function ImportEntries({ b, t, divisions, regs, onDone, onClose }: { b: ClubBackend; t: ClubTournament; divisions: Division[]; regs: Registration[]; onDone: (r: ImportResult) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [map, setMap] = useState<Mapping | null>(null);
  const singlesDivs = divisions.filter((d) => d.kind === 'singles');
  const doublesDivs = divisions.filter((d) => d.kind === 'doubles');
  const [s, setS] = useState<ImportSettings>({ singles: singlesDivs[0]?.id, doubles: doublesDivs[0]?.id, adults: false, status: 'accepted', payment: 'unpaid' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const rows = useMemo(() => parseTable(text), [text]);
  const header = rows[0] ?? [];
  const mapping = map ?? (header.length ? guessMapping(header) : null);
  const preview = useMemo(() => (mapping && rows.length > 1 ? buildImport(rows, mapping, divisions, s, regs) : []), [rows, mapping, divisions, s, regs]);
  const sum = importSummary(preview);
  const noAges = mapping ? mapping.age === -1 : true;

  async function readFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) return setMsg('That file is too big. Download just the responses sheet as CSV.');
    setMsg(null); setMap(null); setResult(null);
    setText(await f.text());
  }
  async function go() {
    const ready = preview.filter((r) => !r.problem && !r.already && r.divisionId);
    if (!ready.length) return setMsg('Nothing new to import.');
    setBusy(true); setMsg(null);
    try {
      const r = await b.importEntries(t.id, ready.map((x) => ({ divisionId: x.divisionId as string, players: x.players, status: s.status, payment: x.payment })));
      setResult(r); onDone(r);
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <section className="card section" aria-label="Import entries">
      <div className="row"><h2 style={{ fontSize: 16 }}>Import entries from a Google Form</h2><button type="button" className="link-btn" onClick={onClose}>Close</button></div>
      <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>In the Google Form: <b>Responses → Link to Sheets</b>.</li>
        <li>In the sheet: <b>File → Download → CSV</b>, then choose the file below. Or select all the rows (with the heading row) and copy, then paste below.</li>
        <li>Check the columns and the list, then import. Importing again after new responses adds only the new people.</li>
      </ol>
      <label className="btn btn-outline" style={{ alignSelf: 'flex-start' }}>
        Choose CSV file
        <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" aria-label="Choose CSV file" style={{ display: 'none' }} onChange={(e) => readFile(e.target.files?.[0])} />
      </label>
      <textarea className="input" aria-label="Paste rows from Google Sheets" placeholder="…or paste the rows here, including the heading row" rows={4} value={text} onChange={(e) => { setText(e.target.value); setMap(null); setResult(null); }} />
      {rows.length === 1 && <p className="small muted" style={{ margin: 0 }}>Only a heading row: no responses yet.</p>}
      {mapping && rows.length > 1 && (
        <>
          <details className="card" style={{ padding: 10 }} open={mapping.name === -1}>
            <summary>Columns ({header.length} found · check these)</summary>
            <div className="section">
              {FIELDS.map((f: SheetField) => (
                <label key={f} className="row small" style={{ gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{FIELD_LABEL[f]}</span>
                  <select className="input" style={{ width: '55%', minWidth: 0 }} aria-label={`Column for ${FIELD_LABEL[f]}`} value={mapping[f]} onChange={(e) => setMap({ ...mapping, [f]: Number(e.target.value) })}>
                    <option value={-1}>Not in the sheet</option>
                    {header.map((h, i) => <option key={i} value={i}>{h.slice(0, 50) || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>
          {mapping.kind >= 0 ? <>
            {singlesDivs.length > 0 && <Field label="Singles answers go to"><select className="input" aria-label="Singles answers go to" value={s.singles ?? ''} onChange={(e) => setS({ ...s, singles: e.target.value || undefined })}><option value="">Don’t import</option>{singlesDivs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>}
            {doublesDivs.length > 0 && <Field label="Doubles answers go to"><select className="input" aria-label="Doubles answers go to" value={s.doubles ?? ''} onChange={(e) => setS({ ...s, doubles: e.target.value || undefined })}><option value="">Don’t import</option>{doublesDivs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>}
          </> : (
            <Field label="Every row goes to"><select className="input" aria-label="Every row goes to" value={s.singles ?? s.doubles ?? ''} onChange={(e) => { const d = divisions.find((x) => x.id === e.target.value); setS({ ...s, singles: d?.kind === 'singles' ? d.id : undefined, doubles: d?.kind === 'doubles' ? d.id : undefined }); }}>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          )}
          <Field label="Imported entries are"><Segmented label="Imported entries are" value={s.status} options={[{ value: 'accepted', label: 'Accepted' }, { value: 'pending', label: 'To decide' }]} onChange={(v) => setS({ ...s, status: v })} /></Field>
          <Field label="Payment"><Segmented label="Imported payment" value={s.payment} options={[{ value: 'unpaid', label: 'Not paid' }, { value: 'venue', label: 'At the venue' }, { value: 'paid', label: 'Paid' }]} onChange={(v) => setS({ ...s, payment: v })} /></Field>
          {noAges && <label className="check-row"><input type="checkbox" checked={s.adults} onChange={(e) => setS({ ...s, adults: e.target.checked })} /><span>Every player is 18 or over (the sheet has no ages)</span></label>}
          <section className="section" aria-label="Import preview">
            <div className="row"><span>Ready to import</span><b>{sum.ready}</b></div>
            <div className="row"><span>Already entered (skipped)</span><b>{sum.already}</b></div>
            <div className="row"><span>Problems (left out)</span><b>{sum.problems}</b></div>
            {preview.filter((r) => r.problem).map((r) => (
              <div key={r.row} className="msg msg-bad small">Row {r.row}{r.players[0]?.name ? ` (${r.players.map((p) => p.name).filter(Boolean).join(' / ')})` : ''}: {r.problem}</div>
            ))}
            {preview.filter((r) => !r.problem && !r.already).slice(0, 60).map((r) => (
              <div key={r.row} className="small">✓ {r.players.map((p) => `${p.name}${p.dupr !== undefined ? ` (${p.dupr})` : ''}`).join(' / ')} · {divisions.find((d) => d.id === r.divisionId)?.name}</div>
            ))}
          </section>
          <p className="small muted" style={{ margin: 0 }}>Fix problems in the sheet and import again, or add those players by hand. Only {t.name}’s organisers see phone numbers.</p>
        </>
      )}
      {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
      {result && (
        <div role="status" className="msg msg-ok">
          Imported {result.added} {result.added === 1 ? 'entry' : 'entries'}{result.waitlisted ? ` (${result.waitlisted} on the waitlist: event full)` : ''}{result.skipped ? ` · ${result.skipped} already entered` : ''}.
          {result.problems.map((p) => <div key={p.row} className="small">Not imported: {p.error}</div>)}
        </div>
      )}
      {mapping && rows.length > 1 && <button type="button" className="btn btn-primary" disabled={busy || sum.ready === 0 || (noAges && !s.adults)} onClick={go}>{noAges && !s.adults ? 'Confirm the players are 18+ first' : `Import ${sum.ready} ${sum.ready === 1 ? 'entry' : 'entries'}`}</button>}
    </section>
  );
}
