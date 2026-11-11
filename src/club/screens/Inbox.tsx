import { Fragment, useMemo, useState } from 'react';
import { Chips, Field, Segmented } from '../../components/Controls';
import { OrgShell, PageHead } from '../../rallyq/shell/Shell';
import { Legacy, SR } from './InboxLegacy';
import { newId } from '../../db/ids';
import type { Go } from '../../navigation';
import type { ClubBackend, TournamentDetails } from '../backend';
import { backend } from '../index';
import { blankPerson, drawProblem, entryProblem, inboxCounts, planDraw, rulesLine, type DrawChoice } from '../registration';
import { isAdmin, isApproved, isStaff, PAYMENT_LABEL, REG_STATUS_LABEL, type ClubTournament, type Division, type EntryPerson, type Listing, type Payment, type Registration, type RegistrationStatus } from '../types';
import { DemoNote, errorText, Header, shareLink, Status, useLoad } from './common';
import { eventShareLink, PersonFields } from './Events';
import { PosterPicker } from './Poster';
import { ImportEntries } from './Import';
import { AddPanel } from './AddPanel';
import { DayEstimateBox, divisionToDraft, draftToDivision, FormatFields, SLOT_OPTIONS, type FormatDraft } from './Formats';
import { friendlyDate, friendlyDateTime } from '../dates';

type Filter = 'check' | 'waiting' | 'accepted' | 'waitlist' | 'out' | 'all';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'check', label: 'To check' }, { value: 'waiting', label: 'To decide' }, { value: 'accepted', label: 'Accepted' }, { value: 'waitlist', label: 'Waitlist' }, { value: 'out', label: 'Not in' }, { value: 'all', label: 'All' },
];
const isOut = (r: Registration) => r.status === 'rejected' || r.status === 'withdrawn';
const toCheck = (r: Registration) => r.payment === 'claimed' && !isOut(r);
const inFilter = (r: Registration, f: Filter) => f === 'all' || (f === 'check' ? toCheck(r) : f === 'waiting' ? r.status === 'pending' : f === 'out' ? isOut(r) : r.status === f);
const dupr = (p: EntryPerson) => `${p.name.split(/\s+/)[0]} ${p.dupr !== undefined ? p.dupr.toFixed(2) : 'Unrated'}`;
const STATUS_CLS: Record<RegistrationStatus, string> = { pending: 'st wait', accepted: 'st ok', waitlist: 'st wait', rejected: 'st no', withdrawn: 'st off' };

/** The organiser's entries inbox: accept or turn down entries, match UPI payments, add offline entries, close entries and make the draw. */
export function EntriesInbox({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) throw new Error('Open Club mode first');
    const t = await b.tournamentBundle(id);
    if (!isStaff(t.role)) throw new Error('Only coaches and admins can see entries');
    return { t, regs: await b.registrations(id) };
  }, [b, id]);
  const [divId, setDivId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ id: string; panel: 'pay' | 'more' | 'edit' | 'reject' } | null>(null);
  const [ticked, setTicked] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const d = state.data;
  if (!d || !b) return <main className="screen pq-matchday pq-proto" aria-labelledby="inbox-title"><Header id="inbox-title" title="Entries & UPI" onBack={onBack} /><Status error={state.error} loading={state.loading} /></main>;
  const t = d.t.tournament;
  const div = d.t.divisions.find((x) => x.id === divId) ?? d.t.divisions[0];
  const regs = d.regs.filter((r) => r.divisionId === div.id);
  const counts = inboxCounts(regs, div.rules?.cap);
  const nCheck = regs.filter(toCheck).length;
  const f: Filter = filter ?? (counts.pending === 0 && nCheck > 0 ? 'check' : 'waiting');
  const needle = q.trim().toLowerCase();
  const shown = regs.filter((r) => inFilter(r, f) && (!needle || r.players.some((p) => p.name.toLowerCase().includes(needle)) || (r.paymentRef ?? '').toLowerCase().includes(needle)));
  const fee = div.rules?.fee ?? 0;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setOpen(null); setTicked(null); state.reload(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  const who = (r: Registration) => r.players.map((p) => p.name).join(' / ');
  const setStatus = (r: Registration, status: RegistrationStatus, note?: string) => run(() => b.updateRegistration(r.id, { status, ...(note !== undefined ? { note } : {}) }), `${who(r)}: ${REG_STATUS_LABEL[status].toLowerCase()}`);
  const setPaid = (r: Registration, payment: Payment) => run(() => b.updateRegistration(r.id, { payment }), `${who(r)}: ${PAYMENT_LABEL[payment].toLowerCase()}`);
  const drawn = !!t.drawnAt;
  const toggle = (r: Registration, panel: 'pay' | 'more' | 'edit' | 'reject') => { setTicked(null); setOpen((o) => (o?.id === r.id && o.panel === panel ? null : { id: r.id, panel })); };

  /** The one action a row asks for next (the first one on the screen gets the yellow button). */
  const nextAction = (r: Registration): { label: string; act: () => void } | null => {
    if (r.entryId || r.status === 'withdrawn') return null;
    if (r.status === 'pending') return { label: 'Accept', act: () => setStatus(r, 'accepted') };
    if (fee > 0 && r.payment === 'claimed') return { label: open?.id === r.id && open.panel === 'pay' ? 'Close' : 'Check payment', act: () => toggle(r, 'pay') };
    if (fee > 0 && r.status === 'accepted' && r.payment !== 'paid') return { label: 'Mark paid', act: () => setPaid(r, 'paid') };
    return null;
  };
  const firstAct = shown.find((r) => nextAction(r));
  const cap = div.rules?.cap;

  return (
    <OrgShell go={go} active="entries" clubName={d.t.club.name} clubId={d.t.club.id} tournament={{ id: t.id, name: t.name, slug: t.publicSlug }}>
      <PageHead cap={`${t.name} · ${drawn ? 'Draw made' : t.registrationOpen ? 'Entries open' : 'Entries closed'}${t.entriesClose && !drawn ? ` · entries close ${friendlyDate(t.entriesClose)}` : ''}`}
        title={<span id="inbox-title">{drawn ? 'Registrations and payments' : 'Entries & UPI'}</span>}
        actions={<>
          {!drawn && isApproved(t) && <button type="button" className="btn ghost sm" onClick={async () => setMsg({ ok: true, text: await shareLink(`${t.name}: enter now`, eventShareLink(t.publicSlug)) })}>Share the entry link</button>}
          {!drawn && <button type="button" className="btn ghost sm" disabled={busy || !isApproved(t)} onClick={() => run(() => b.updateTournamentDetails(t.id, { registrationOpen: !t.registrationOpen }), t.registrationOpen ? 'Entries closed. Players can’t enter any more.' : 'Entries are open again')}>{t.registrationOpen ? 'Close entries' : 'Open registration'}</button>}
          {drawn && <button type="button" className="btn ghost sm" onClick={() => go('club-entries', t.id)}>Entries, withdrawals and late entries</button>}
        </>} />
      <Legacy><DemoNote b={b} /></Legacy>
      {msg && <div role="status" className="note" style={{ margin: 0 }}>{msg.ok ? '' : 'Not saved: '}{msg.text}</div>}
      {d.t.divisions.length > 1 && (
        <div className="tabs" role="group" aria-label="Event">{d.t.divisions.map((x) => <button key={x.id} type="button" className={`tab${x.id === div.id ? ' on' : ''}`} aria-pressed={x.id === div.id} onClick={() => { setDivId(x.id); setOpen(null); }}>{x.name}</button>)}</div>
      )}
      <section className="grid g4" aria-label={`${div.name} entries`}>
        <div className="card stat" style={{ padding: 18 }}><div className="cap">To check</div><div className={`n${nCheck ? ' acc' : ''}`}>{nCheck}</div><div className="mut" style={{ fontSize: 13 }}>UPI payments to match</div></div>
        <div className="card stat" style={{ padding: 18 }}><div className="cap">Accepted</div><div className="n">{counts.accepted}</div><div className="mut" style={{ fontSize: 13 }}>{cap !== undefined ? `of ${cap} spots` : 'teams in'}{fee > 0 && counts.unpaidAccepted ? ` · ${counts.unpaidAccepted} not paid yet` : ''}</div></div>
        <div className="card stat" style={{ padding: 18 }}><div className="cap">To decide</div><div className="n">{counts.pending}</div><div className="mut" style={{ fontSize: 13 }}>new entries</div></div>
        <div className="card stat" style={{ padding: 18 }}><div className="cap">Waitlist</div><div className="n">{counts.waitlist}</div><div className="mut" style={{ fontSize: 13 }}>move up when a spot frees</div></div>
      </section>
      <p className="mut" style={{ margin: 0, fontSize: 13 }}>{rulesLine(div.kind, div.rules)}</p>
      {!drawn && (
        <Legacy>
          <AddPanel modes={[{ value: 'one', label: 'Person or team' }, { value: 'import', label: 'Import a sheet' }]}>
            {(mode, { close }) => mode === 'import'
              ? <ImportEntries b={b} t={t} divisions={d.t.divisions} regs={d.regs} onClose={close} onDone={() => state.reload()} />
              : <>
                <p className="small muted" style={{ margin: 0 }}>For players who entered by phone or at the desk. A phone number is optional here.</p>
                <EntryForm b={b} t={t} divisions={d.t.divisions} divisionId={div.id} busy={busy} offline onSave={(players, divisionId, extra) => run(() => b.addOfflineEntry({ tournamentId: t.id, divisionId, clubId: t.clubId, players, status: extra?.status ?? 'accepted', payment: extra?.payment ?? 'unpaid' }), `${players.map((p) => p.name).join(' / ')} added`)} />
              </>}
          </AddPanel>
        </Legacy>
      )}
      <div className="between">
        <div className="tabs" role="group" aria-label="Show entries">{FILTERS.map((x) => {
          const n = regs.filter((r) => inFilter(r, x.value)).length;
          return <button key={x.value} type="button" className={`tab${x.value === f ? ' on' : ''}`} aria-pressed={x.value === f} onClick={() => { setFilter(x.value); setOpen(null); }}>{x.label}<span aria-hidden="true" className="mut"> {n}</span></button>;
        })}</div>
        <label className="search"><span style={SR}>Search by team or UPI reference</span><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg><input className="inp" placeholder="Search team or UPI reference" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="card">
        {shown.length > 0 && <div className="scroll"><table className="tbl" aria-label={`${div.name} entries list`}><thead><tr><th>Team and DUPR</th><th>Category</th><th>Payment</th><th>UPI reference</th><th>Status</th><th><span style={SR}>Actions</span></th></tr></thead><tbody>
          {shown.map((r) => {
            const a = nextAction(r);
            const panel = open?.id === r.id ? open.panel : null;
            return <Fragment key={r.id}>
              <tr aria-label={who(r)} style={isOut(r) ? { opacity: 0.65 } : undefined}>
                <td><b>{who(r)}</b><div className="mut" style={{ fontSize: 12 }}>{r.players.map(dupr).join(' · ')}</div><div className="mut" style={{ fontSize: 12 }}>{r.source === 'offline' ? 'Added by organiser' : 'Entered online'} · {friendlyDateTime(r.createdAt)}</div></td>
                <td>{div.name}</td>
                <td>{PAYMENT_LABEL[r.payment]}</td>
                <td className="n" style={{ fontSize: 20, letterSpacing: '.05em' }}>{r.paymentRef ?? <span className="mut" style={{ fontSize: 13, letterSpacing: 0 }}>—</span>}</td>
                <td><span className={STATUS_CLS[r.status]}>{r.entryId ? 'In the draw' : REG_STATUS_LABEL[r.status]}</span>{r.note && <div className="mut" style={{ fontSize: 12, marginTop: 4 }}>Note to player: {r.note}</div>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {a && <button type="button" className={firstAct?.id === r.id && !panel ? 'btn sm' : 'btn ghost sm'} disabled={busy} onClick={a.act}>{a.label}</button>}
                  {!r.entryId && r.status !== 'withdrawn' && <button type="button" className="tlink mut" style={{ marginLeft: 10 }} aria-expanded={panel === 'more'} onClick={() => toggle(r, 'more')}>More</button>}
                </td>
              </tr>
              {panel && <tr className="expand"><td colSpan={6}>
                {panel === 'pay' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 28px', alignItems: 'center', padding: '6px 2px' }}>
                  <span><span className="cap" style={{ display: 'block' }}>Amount</span><b>₹{fee}{div.kind === 'doubles' ? ' per player' : ''}</b></span>
                  <span><span className="cap" style={{ display: 'block' }}>UPI reference</span><span className="n" style={{ fontSize: 26, letterSpacing: '.06em' }}>{r.paymentRef ?? 'None given'}</span></span>
                  <button type="button" className={ticked === r.id ? 'check on' : 'check'} aria-pressed={ticked === r.id} onClick={() => setTicked(ticked === r.id ? null : r.id)}><span className="bx" aria-hidden="true">{ticked === r.id ? '✓' : ''}</span>It matches a payment in my bank app</button>
                  <span className="row" style={{ marginLeft: 'auto', gap: 10 }}>
                    <button type="button" className="tlink mut" disabled={busy} onClick={() => setPaid(r, 'unpaid')}>Not in my bank app</button>
                    <button type="button" className="btn sm" disabled={busy || ticked !== r.id} onClick={() => setPaid(r, 'paid')}>Confirm paid</button>
                  </span>
                </div>}
                {panel === 'more' && <div className="row" style={{ flexWrap: 'wrap', gap: 8, padding: '6px 2px' }}>
                  {r.players.map((p, i) => <span key={i} className="mut" style={{ fontSize: 13 }}>{p.name}{p.phone ? <> · <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a></> : null}{p.duprId ? ` · DUPR ID ${p.duprId}` : ''}</span>)}
                  <span style={{ flexBasis: '100%' }} />
                  {r.status === 'waitlist' || r.status === 'rejected' ? <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setStatus(r, 'accepted')}>Accept</button> : null}
                  {(r.status === 'pending' || r.status === 'accepted') && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setStatus(r, 'waitlist')}>Waitlist</button>}
                  {r.status !== 'rejected' && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => { setOpen({ id: r.id, panel: 'reject' }); setReason(''); }}>Turn down…</button>}
                  {fee > 0 && r.payment === 'paid' && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setPaid(r, 'unpaid')}>Mark not paid</button>}
                  {fee > 0 && r.payment === 'claimed' && <button type="button" className="btn ghost sm" onClick={() => toggle(r, 'pay')}>Check payment</button>}
                  <button type="button" className="tlink" onClick={() => setOpen({ id: r.id, panel: 'edit' })}>Edit</button>
                </div>}
                {panel === 'reject' && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 2px' }}>
                  <input className="inp" aria-label={`Reason for ${who(r)}`} placeholder="Reason the player will see (optional)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn alt sm" disabled={busy} onClick={() => setStatus(r, 'rejected', reason)}>Turn down</button>
                    <button type="button" className="btn ghost sm" onClick={() => setOpen(null)}>Cancel</button>
                  </div>
                </div>}
                {panel === 'edit' && <Legacy><EntryForm b={b} t={t} divisions={d.t.divisions} start={r} busy={busy} onCancel={() => setOpen(null)} onSave={(players, divisionId) => run(() => b.updateRegistration(r.id, { players, divisionId }), `${players.map((p) => p.name).join(' / ')} updated`)} /></Legacy>}
              </td></tr>}
            </Fragment>;
          })}
        </tbody></table></div>}
        {shown.length === 0 && <div className="empty">{needle ? 'No team or UPI reference matches that.' : f === 'check' ? 'No payments to check. You’re all caught up.' : 'No entries here.'}</div>}
      </div>
      {fee > 0 && <div className="note">Match the UPI reference with your bank app before you confirm. RallyQ never holds money: players pay your club directly. Accepted teams go into the draw.</div>}
      <Draw b={b} t={t} divisions={d.t.divisions} regs={d.regs} primary={!firstAct} onDrawn={() => { state.reload(); setMsg({ ok: true, text: 'Draw made. Pools and the schedule are ready.' }); }} go={go} />
    </OrgShell>
  );
}

function EntryForm({ b, t, divisions, divisionId, start, busy, offline, onSave, onCancel }: {
  b: ClubBackend; t: ClubTournament; divisions: Division[]; divisionId?: string; start?: Registration; busy: boolean; offline?: boolean;
  onSave: (players: EntryPerson[], divisionId: string, extra?: { status: RegistrationStatus; payment: Payment }) => void; onCancel?: () => void;
}) {
  const [div, setDiv] = useState(start?.divisionId ?? divisionId ?? divisions[0].id);
  const d = divisions.find((x) => x.id === div) ?? divisions[0];
  const [players, setPlayers] = useState<EntryPerson[]>(() => start?.players.map((p) => ({ ...p })) ?? [blankPerson(), blankPerson()]);
  const [payment, setPayment] = useState<Payment>('unpaid');
  const [msg, setMsg] = useState<string | null>(null);
  const need = d.kind === 'doubles' ? 2 : 1;
  const list = [0, 1].slice(0, need).map((i) => players[i] ?? blankPerson());
  async function save() {
    const local = entryProblem(d.kind, d.rules, list, !offline && start?.source === 'online');
    if (local) return setMsg(local);
    const server = await b.checkEntry(d.id, list, start?.id).catch((e: unknown) => errorText(e));
    if (server) return setMsg(server);
    setMsg(null);
    onSave(list, d.id, offline ? { status: 'accepted', payment } : undefined);
    if (offline) setPlayers([blankPerson(), blankPerson()]);
  }
  return (
    <div className="section">
      {divisions.length > 1 && (
        <select className="input" aria-label="Event for this entry" value={div} onChange={(e) => setDiv(e.target.value)}>
          {divisions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      {list.map((p, i) => <PersonFields key={i} label={need === 2 ? `Player ${i + 1}` : 'Player'} p={p} onChange={(np) => setPlayers((ps) => { const a = [...ps]; a[i] = np; return a; })} />)}
      {offline && (d.rules?.fee ?? 0) > 0 && <Segmented label="Payment" value={payment} options={[{ value: 'unpaid', label: 'Not paid' }, { value: 'venue', label: 'At the venue' }, { value: 'paid', label: 'Paid' }]} onChange={setPayment} />}
      {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
      <div className="meta">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{offline ? 'Add entry' : 'Save'}</button>
        {onCancel && <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>{t.name}: everyone must be 18 or over and meet the event’s rules.</p>
    </div>
  );
}

/** Making the draw: choose the format for each event, see when the day finishes, then create entries, matches, courts and times in one go. */
function Draw({ b, t, divisions, regs, onDrawn, go, primary = true }: { b: ClubBackend; t: ClubTournament; divisions: Division[]; regs: Registration[]; onDrawn: () => void; go: Go; primary?: boolean }) {
  const withEntries = divisions.map((d) => ({ d, n: regs.filter((r) => r.divisionId === d.id && r.status === 'accepted').length })).filter((x) => x.n > 0);
  const [drafts, setDrafts] = useState<Record<string, FormatDraft>>({});
  const [courts, setCourts] = useState(t.courts);
  const [slot, setSlot] = useState(t.slotMinutes);
  const [start, setStart] = useState(t.startTime);
  const [finishBy, setFinishBy] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Until the organiser chooses, each event starts as a round robin (small events) or knockout only (bigger ones).
  const draft = (d: Division, n: number): FormatDraft => drafts[d.id] ?? { ...divisionToDraft(d), ...(n > 8 ? { shape: 'ko' as const } : { shape: 'rr' as const }) };
  const choice = (d: Division, n: number): DrawChoice => ({ divisionId: d.id, ...draftToDivision(draft(d, n)) });
  const problems = useMemo(() => withEntries.map(({ d, n }) => drawProblem(d, n, choice(d, n))).filter(Boolean) as string[], [withEntries, drafts]); // eslint-disable-line react-hooks/exhaustive-deps
  if (t.drawnAt) {
    return (
      <section className="card" aria-label="Draw" style={{ padding: 22 }}><Legacy className="section">
        <h2 className="disp" style={{ fontSize: 24 }}>Draw made</h2>
        <p className="small muted" style={{ margin: 0 }}>Pools and the schedule are ready. Late changes (withdrawals, substitutes) are in Entries.</p>
        <div className="meta">
          <button type="button" className={primary ? 'btn' : 'btn alt'} onClick={() => go('club-tournament', t.id)}>See the draw</button>
          <button type="button" className="btn ghost" onClick={() => go('club-desk', t.id)}>Desk view</button>
        </div>
      </Legacy></section>
    );
  }
  if (!isApproved(t)) {
    return (
      <section className="card" aria-label="Draw" style={{ padding: 22 }}><Legacy className="section">
        <h2 className="disp" style={{ fontSize: 24 }}>Make the draw</h2>
        <p className="small muted" style={{ margin: 0 }}>You can make the draw once RallyQ approves this tournament. Keep adding and accepting entries meanwhile; submit it from the tournament page.</p>
        <button type="button" className="btn ghost" onClick={() => go('club-tournament', t.id)}>Tournament page</button>
      </Legacy></section>
    );
  }
  const timing = courts !== t.courts || slot !== t.slotMinutes || start !== t.startTime ? { courts, slotMinutes: slot, startTime: start } : undefined;
  async function draw() {
    const plan = planDraw(t, divisions, regs, withEntries.map(({ d, n }) => choice(d, n)), newId, timing);
    if (typeof plan === 'string') return setMsg(plan);
    setBusy(true); setMsg(null);
    try { await b.applyDraw(t.id, plan); onDrawn(); } catch (e) { setMsg(errorText(e)); setBusy(false); }
  }
  const set = (d: Division, n: number, patch: Partial<FormatDraft>) => { setConfirm(false); setDrafts((c) => ({ ...c, [d.id]: { ...draft(d, n), ...patch } })); };
  return (
    <section className="card" aria-label="Draw" style={{ padding: 22 }}><Legacy className="section">
      <h2 className="disp" style={{ fontSize: 24 }}>Make the draw</h2>
      <p className="small muted" style={{ margin: 0 }}>You choose the format for each event. Accepted entries are seeded by DUPR, and every match gets a court and a time. Entries close when you draw.</p>
      {withEntries.length === 0 && <p className="small muted" style={{ margin: 0 }}>Accept some entries first.</p>}
      {withEntries.length > 0 && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <Field label="First match"><input className="input" type="time" aria-label="Draw first match" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Courts"><input className="input" type="number" min={1} max={64} aria-label="Draw courts" value={courts} onChange={(e) => setCourts(Math.max(1, Math.min(64, Number(e.target.value) || 1)))} /></Field>
        </div>
        <Field label="Minutes per match"><Chips label="Draw minutes per match" value={slot} options={SLOT_OPTIONS.map((n) => ({ value: n, label: String(n) }))} onChange={setSlot} /></Field>
      </>}
      {withEntries.map(({ d, n }) => (
        <section key={d.id} className="section" aria-label={`Format for ${d.name}`} style={{ borderTop: '1px solid var(--line, #ddd)', paddingTop: 8 }}>
          <b>{d.name} · {n} {d.kind === 'doubles' ? 'teams' : 'players'}</b>
          <FormatFields label={d.name} entries={n} value={draft(d, n)} onChange={(patch) => set(d, n, patch)} />
        </section>
      ))}
      {withEntries.length > 0 && <DayEstimateBox events={withEntries.map(({ d, n }) => ({ name: d.name, entries: n, ...draft(d, n) }))} courts={courts} slotMinutes={slot} startTime={start} finishBy={finishBy} onFinishBy={setFinishBy}
        onUse={(i, c) => { const x = withEntries[i]; set(x.d, x.n, c); }} />}
      {problems.map((p) => <div key={p} className="msg msg-bad small">{p}</div>)}
      {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
      {withEntries.length > 0 && (confirm
        ? <div className="meta"><button type="button" className={primary ? 'btn' : 'btn alt'} disabled={busy || problems.length > 0} onClick={draw}>Yes, make the draw</button><button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Not yet</button></div>
        : <button type="button" className={primary ? 'btn' : 'btn alt'} disabled={problems.length > 0} onClick={() => setConfirm(true)}>Make the draw</button>)}
    </Legacy></section>
  );
}

// ---------- The events board card on a tournament page ----------

const LISTING_TEXT: Record<string, string> = {
  none: 'Not on the RallyQ events board.',
  pending: 'Waiting for RallyQ to check it. That’s only needed for your club’s first listing.',
  approved: 'On the RallyQ events board.',
  rejected: 'Not approved for the board.',
};

export function ListingCard({ b, t, role, onChanged }: { b: ClubBackend; t: ClubTournament; role: string; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<TournamentDetails>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const admin = isAdmin(role as never);
  const v = (k: keyof TournamentDetails) => String(f[k] ?? t[k as keyof ClubTournament] ?? '');
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setEditing(false); setF({}); onChanged(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  async function list(l: Listing) {
    setBusy(true); setMsg(null);
    try {
      const st = await b.submitListing(t.id, l);
      setMsg({ ok: true, text: l === 'none' ? 'Taken off the events board' : st === 'approved' ? 'It’s on the events board.' : 'It goes on the board once RallyQ approves the tournament.' });
      onChanged();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  const status = t.listing === 'none' || !t.listing ? 'none' : t.listingStatus ?? 'none';
  const text = (k: keyof TournamentDetails, label: string, extra: Record<string, unknown> = {}) => (
    <Field label={label}><input className="input" aria-label={label} value={v(k)} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} {...extra} /></Field>
  );
  return (
    <section className="card section" aria-label="Events board">
      <div className="row"><h2 style={{ fontSize: 16 }}>Events board</h2>{status !== 'none' && <span className={`pill${status === 'approved' ? ' pill-ok' : status === 'rejected' ? ' pill-warn' : ''}`}>{status === 'approved' ? (t.listing === 'listed' ? 'Listed' : 'On the board') : status === 'pending' ? 'Being checked' : 'Not approved'}</span>}</div>
      {isStaff(role as never)
        ? <PosterPicker b={b} t={t} current={t.posterUrl} onChanged={onChanged} />
        : null}
      <p className="small muted" style={{ margin: 0 }}>{LISTING_TEXT[status]}{status === 'rejected' && t.rejectReason ? ` Reason: ${t.rejectReason}. Fix it and post again.` : ''}</p>
      <div className="small">{[t.venue, t.city].filter(Boolean).join(', ') || 'No venue yet'}{t.entriesClose ? ` · entries close ${friendlyDate(t.entriesClose)}` : ''}{t.upiId ? ` · UPI ${t.upiId}` : ''}</div>
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {!editing && admin && (
        <div className="meta">
          {(status === 'none' || status === 'rejected') && t.entryMode === 'registration' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => list('run')}>{isApproved(t) ? 'Publish on events board' : 'Queue for publication'}</button>}
          {(status === 'none' || status === 'rejected') && t.entryMode !== 'registration' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => list('listed')}>List it on the board</button>}
          {status !== 'none' && status !== 'rejected' && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => list('none')}>Take it off the board</button>}
          <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>Edit details</button>
        </div>
      )}
      {!admin && <p className="small muted" style={{ margin: 0 }}>Club admins post to the board.</p>}
      {editing && (
        <>
          {text('city', 'City', { maxLength: 60 })}
          {text('venue', 'Venue', { maxLength: 120 })}
          <Field label="About"><textarea className="input" aria-label="About" maxLength={1000} value={v('about')} onChange={(e) => setF((x) => ({ ...x, about: e.target.value }))} /></Field>
          {t.entryMode === 'registration' && text('entriesClose', 'Entries close', { type: 'date' })}
          {t.entryMode === 'registration' && text('upiId', 'Your UPI ID, for entry fees (optional)', { placeholder: 'name@bank', maxLength: 130 })}
          {t.entryMode !== 'registration' && text('contact', 'Contact number for entries', { inputMode: 'tel', maxLength: 120 })}
          {t.entryMode !== 'registration' && text('link', 'Your sign-up page (optional)', { placeholder: 'https://…', maxLength: 300 })}
          <div className="meta">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => b.updateTournamentDetails(t.id, f), 'Details saved')}>Save details</button>
            <button type="button" className="btn btn-outline" onClick={() => { setEditing(false); setF({}); }}>Cancel</button>
          </div>
        </>
      )}
    </section>
  );
}
