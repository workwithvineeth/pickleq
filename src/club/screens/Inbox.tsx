import { useMemo, useState } from 'react';
import { Chips, Field, Segmented } from '../../components/Controls';
import { newId } from '../../db/ids';
import type { Go } from '../../navigation';
import type { ClubBackend, TournamentDetails } from '../backend';
import { backend } from '../index';
import { blankPerson, drawProblem, entryProblem, inboxCounts, planDraw, rulesLine, type DrawChoice } from '../registration';
import { isAdmin, isStaff, PAYMENT_LABEL, REG_STATUS_LABEL, type ClubTournament, type Division, type EntryPerson, type Listing, type Payment, type Registration, type RegistrationStatus } from '../types';
import { DemoNote, errorText, Header, shareLink, Status, useLoad } from './common';
import { eventShareLink, PersonFields } from './Events';
import { PosterPicker } from './Poster';
import { ImportEntries } from './Import';
import { DayEstimateBox, divisionToDraft, draftToDivision, FormatFields, SLOT_OPTIONS, type FormatDraft } from './Formats';
import { friendlyDate, friendlyDateTime } from '../dates';

type Filter = 'waiting' | 'accepted' | 'waitlist' | 'out' | 'all';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'waiting', label: 'To decide' }, { value: 'accepted', label: 'Accepted' }, { value: 'waitlist', label: 'Waitlist' }, { value: 'out', label: 'Not in' }, { value: 'all', label: 'All' },
];
const inFilter = (r: Registration, f: Filter) => f === 'all' || (f === 'waiting' ? r.status === 'pending' : f === 'out' ? r.status === 'rejected' || r.status === 'withdrawn' : r.status === f);
const person = (p: EntryPerson) => [p.name, p.dupr !== undefined ? `DUPR ${p.dupr}` : null, p.age ? `${p.age}` : null, p.gender === 'm' ? 'M' : p.gender === 'f' ? 'F' : p.gender === 'x' ? 'Other' : null].filter(Boolean).join(' · ');

/** The organiser's entries inbox: accept or turn down entries, track payments, add offline entries, close entries and make the draw. */
export function EntriesInbox({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) throw new Error('Open Club mode first');
    const t = await b.tournamentBundle(id);
    if (!isStaff(t.role)) throw new Error('Only coaches and admins can see entries');
    return { t, regs: await b.registrations(id) };
  }, [b, id]);
  const [divId, setDivId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('waiting');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [importing, setImporting] = useState(false);
  const d = state.data;
  if (!d || !b) return <main className="screen" aria-labelledby="inbox-title"><Header id="inbox-title" title="Entries inbox" onBack={onBack} /><Status error={state.error} loading={state.loading} /></main>;
  const t = d.t.tournament;
  const div = d.t.divisions.find((x) => x.id === divId) ?? d.t.divisions[0];
  const regs = d.regs.filter((r) => r.divisionId === div.id);
  const counts = inboxCounts(regs, div.rules?.cap);
  const shown = regs.filter((r) => inFilter(r, filter));

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setEditing(null); setRejecting(null); state.reload(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  const who = (r: Registration) => r.players.map((p) => p.name).join(' / ');
  const setStatus = (r: Registration, status: RegistrationStatus, note?: string) => run(() => b.updateRegistration(r.id, { status, ...(note !== undefined ? { note } : {}) }), `${who(r)}: ${REG_STATUS_LABEL[status].toLowerCase()}`);
  const setPaid = (r: Registration, payment: Payment) => run(() => b.updateRegistration(r.id, { payment }), `${who(r)}: ${PAYMENT_LABEL[payment].toLowerCase()}`);
  const drawn = !!t.drawnAt;

  return (
    <main className="screen" aria-labelledby="inbox-title">
      <Header id="inbox-title" title="Entries inbox" onBack={onBack} />
      <DemoNote b={b} />
      <p className="small muted" style={{ margin: 0 }}>{t.name} · {drawn ? 'Draw made' : t.registrationOpen ? 'Entries open' : 'Entries closed'}</p>
      {!drawn && (
        <div className="meta">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => run(() => b.updateTournamentDetails(t.id, { registrationOpen: !t.registrationOpen }), t.registrationOpen ? 'Entries closed. Players can’t enter any more.' : 'Entries are open again')}>{t.registrationOpen ? 'Close entries' : 'Reopen entries'}</button>
          <button type="button" className="btn btn-outline" onClick={async () => setMsg({ ok: true, text: await shareLink(`${t.name}: enter now`, eventShareLink(t.publicSlug)) })}>Share the entry link</button>
          <button type="button" className="btn btn-primary" aria-expanded={importing} onClick={() => setImporting((x) => !x)}>Import entries</button>
        </div>
      )}
      {!drawn && importing && <ImportEntries b={b} t={t} divisions={d.t.divisions} regs={d.regs} onClose={() => setImporting(false)} onDone={() => state.reload()} />}
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {d.t.divisions.length > 1 && <Segmented label="Event" value={div.id} options={d.t.divisions.map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => { setDivId(v); setEditing(null); }} />}
      <section className="card section" aria-label={`${div.name} entries`}>
        <div className="small muted">{rulesLine(div.kind, div.rules)}</div>
        <div className="row"><span>Accepted</span><b>{counts.accepted}{div.rules?.cap !== undefined ? ` of ${div.rules.cap}` : ''}</b></div>
        <div className="row"><span>To decide</span><b>{counts.pending}</b></div>
        <div className="row"><span>Waitlist</span><b>{counts.waitlist}</b></div>
        {(div.rules?.fee ?? 0) > 0 && <div className="row"><span>Accepted but not marked paid</span><b>{counts.unpaidAccepted}</b></div>}
      </section>
      <Chips label="Show entries" value={filter} options={FILTERS} onChange={setFilter} />
      {shown.length === 0 && <p className="small muted" style={{ margin: 0 }}>No entries here.</p>}
      {shown.map((r) => (
        <section key={r.id} className="card section" aria-label={who(r)} style={r.status === 'rejected' || r.status === 'withdrawn' ? { opacity: 0.65 } : undefined}>
          <div className="row"><b>{who(r)}</b><span className={`pill${r.status === 'accepted' ? ' pill-ok' : r.status === 'pending' ? ' pill-warn' : ''}`}>{REG_STATUS_LABEL[r.status]}</span></div>
          {r.players.map((p, i) => (
            <div key={i} className="small" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>{person(p)}</span>
              {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a>}
              {p.duprId && <span className="muted">ID {p.duprId}</span>}
            </div>
          ))}
          <div className="small muted">{r.source === 'offline' ? 'Added by organiser' : 'Entered online'} · {friendlyDateTime(r.createdAt)} · {PAYMENT_LABEL[r.payment]}{r.paymentRef ? ` (ref ${r.paymentRef})` : ''}</div>
          {r.note && <div className="small">Note to player: {r.note}</div>}
          {r.entryId && <div className="small muted">In the draw</div>}
          {!r.entryId && editing !== r.id && rejecting !== r.id && (
            <div className="meta">
              {r.status !== 'accepted' && r.status !== 'withdrawn' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus(r, 'accepted')}>Accept</button>}
              {(r.status === 'pending' || r.status === 'accepted') && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setStatus(r, 'waitlist')}>Waitlist</button>}
              {r.status !== 'rejected' && r.status !== 'withdrawn' && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setRejecting(r.id); setReason(''); }}>Turn down…</button>}
              {(div.rules?.fee ?? 0) > 0 && r.status !== 'withdrawn' && (r.payment === 'paid'
                ? <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setPaid(r, 'unpaid')}>Mark not paid</button>
                : <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setPaid(r, 'paid')}>Mark paid</button>)}
              {r.status !== 'withdrawn' && <button type="button" className="link-btn" onClick={() => setEditing(r.id)}>Edit</button>}
            </div>
          )}
          {rejecting === r.id && (
            <>
              <input className="input" aria-label={`Reason for ${who(r)}`} placeholder="Reason the player will see (optional)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="meta">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus(r, 'rejected', reason)}>Turn down</button>
                <button type="button" className="btn btn-outline" onClick={() => setRejecting(null)}>Cancel</button>
              </div>
            </>
          )}
          {editing === r.id && <EntryForm b={b} t={t} divisions={d.t.divisions} start={r} busy={busy} onCancel={() => setEditing(null)} onSave={(players, divisionId) => run(() => b.updateRegistration(r.id, { players, divisionId }), `${players.map((p) => p.name).join(' / ')} updated`)} />}
        </section>
      ))}
      {!drawn && (
        <details className="card section">
          <summary style={{ fontWeight: 600, cursor: 'pointer' }}>Add an entry yourself (offline)</summary>
          <p className="small muted" style={{ margin: 0 }}>For players who entered by phone or at the desk. A phone number is optional here.</p>
          <EntryForm b={b} t={t} divisions={d.t.divisions} divisionId={div.id} busy={busy} offline onSave={(players, divisionId, extra) => run(() => b.addOfflineEntry({ tournamentId: t.id, divisionId, clubId: t.clubId, players, status: extra?.status ?? 'accepted', payment: extra?.payment ?? 'unpaid' }), `${players.map((p) => p.name).join(' / ')} added`)} />
        </details>
      )}
      <Draw b={b} t={t} divisions={d.t.divisions} regs={d.regs} onDrawn={() => { state.reload(); setMsg({ ok: true, text: 'Draw made. Pools and the schedule are ready.' }); }} go={go} />
    </main>
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
function Draw({ b, t, divisions, regs, onDrawn, go }: { b: ClubBackend; t: ClubTournament; divisions: Division[]; regs: Registration[]; onDrawn: () => void; go: Go }) {
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
      <section className="card section" aria-label="Draw">
        <h2 style={{ fontSize: 16 }}>Draw made</h2>
        <p className="small muted" style={{ margin: 0 }}>Pools and the schedule are ready. Late changes (withdrawals, substitutes) are in Entries.</p>
        <div className="meta">
          <button type="button" className="btn btn-primary" onClick={() => go('club-tournament', t.id)}>See the draw</button>
          <button type="button" className="btn btn-outline" onClick={() => go('club-desk', t.id)}>Desk view</button>
        </div>
      </section>
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
    <section className="card section" aria-label="Draw">
      <h2 style={{ fontSize: 16 }}>Make the draw</h2>
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
        ? <div className="meta"><button type="button" className="btn btn-primary" disabled={busy || problems.length > 0} onClick={draw}>Yes, make the draw</button><button type="button" className="btn btn-outline" onClick={() => setConfirm(false)}>Not yet</button></div>
        : <button type="button" className="btn btn-primary" disabled={problems.length > 0} onClick={() => setConfirm(true)}>Make the draw</button>)}
    </section>
  );
}

// ---------- The events board card on a tournament page ----------

const LISTING_TEXT: Record<string, string> = {
  none: 'Not on the PaddleQ events board.',
  pending: 'Waiting for PaddleQ to check it. That’s only needed for your club’s first listing.',
  approved: 'On the PaddleQ events board.',
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
      setMsg({ ok: true, text: l === 'none' ? 'Taken off the events board' : st === 'approved' ? 'It’s on the events board.' : 'Sent to PaddleQ to check. It goes on the board once approved.' });
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
          {(status === 'none' || status === 'rejected') && t.entryMode === 'registration' && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => list('run')}>Put it on the board</button>}
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
