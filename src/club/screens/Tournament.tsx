import { useEffect, useMemo, useState } from 'react';
import { Chips, Field, Segmented } from '../../components/Controls';
import { newId } from '../../db/db';
import type { Go } from '../../navigation';
import type { PublicTournament, TournamentBundle } from '../backend';
import { entryRating, formatFor, matchResult, poolLetter, RUNNERS_UP_TEXT, slotTime, standings, TIE_BREAK_TEXT, type StandingRow } from '../domain/engine';
import { backend, publicSourcesFor } from '../index';
import { checkDivisionSetup, knockoutMatchesToAdd, poolQualifiers, type NewDivisionInput } from '../plan';
import { isStaff, ROUND_LABEL, STAGE_LABEL, type KnockoutStage, type ClubMatch, type ClubPlayer, type DivisionGender, type DivisionKind, type Entry, type EntryMode } from '../types';
import { ListingCard } from './Inbox';
import { DayEstimateBox, defaultFormatDraft, draftToDivision, FormatFields, SLOT_OPTIONS, type FormatDraft } from './Formats';
import { PosterImage, PosterPicker } from './Poster';
import { WalkIn } from './Organiser';
import { appLink, DemoNote, errorText, fmtRating, Header, names, shareLink, Status, useLoad } from './common';

const today = () => new Date().toISOString().slice(0, 10);

interface DivDraft { name: string; kind: DivisionKind; fmt: FormatDraft; picked: string[]; teams: string[][]; gender: DivisionGender; maxDupr: string; duprCap: 'each' | 'average'; minAge: string; cap: string; fee: string }
const newDraft = (kind: DivisionKind): DivDraft => ({ name: kind === 'singles' ? 'Open Singles' : 'Open Doubles', kind, fmt: defaultFormatDraft(), picked: [], teams: [], gender: 'open', maxDupr: '', duprCap: 'each', minAge: '', cap: '', fee: '' });
/** What the organiser is posting: run on PICKLEQ with players picked now, run on PICKLEQ with players registering, or a board listing only. */
type PostKind = 'roster' | 'registration' | 'listed';
const optNum = (v: string) => (v.trim() === '' ? undefined : Number(v));

export function TournamentNew({ clubId, go, onBack }: { clubId: string; go: Go; onBack: () => void }) {
  const b = backend();
  const club = useLoad(async () => { if (!b) throw new Error('Open Club mode first'); return b.clubBundle(clubId); }, [b, clubId]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today());
  const [time, setTime] = useState('08:00');
  const [courts, setCourts] = useState(4);
  const [slot, setSlot] = useState(20);
  const [finishBy, setFinishBy] = useState('');
  const [divs, setDivs] = useState<DivDraft[]>([newDraft('singles')]);
  const [post, setPost] = useState<PostKind>('roster');
  const [city, setCity] = useState('');
  const [venue, setVenue] = useState('');
  const [about, setAbout] = useState('');
  const [upi, setUpi] = useState('');
  const [closes, setCloses] = useState('');
  const [contact, setContact] = useState('');
  const [link, setLink] = useState('');
  const [onBoard, setOnBoard] = useState(true);
  const [poster, setPoster] = useState<Blob | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const players = useMemo(() => [...(club.data?.players ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [club.data]);
  const pmap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const entryCount = (d: DivDraft) => (d.kind === 'singles' ? d.picked.length : d.teams.length);
  const update = (i: number, patch: Partial<DivDraft>) => setDivs((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  function toInput(d: DivDraft): NewDivisionInput {
    // Players who register: the format is chosen at the draw, once the number of entries is known.
    const f = draftToDivision(post === 'roster' ? d.fmt : { ...d.fmt, shape: 'rr' });
    const rules = { gender: d.gender, maxDupr: optNum(d.maxDupr), ...(d.kind === 'doubles' && d.duprCap === 'average' && d.maxDupr.trim() ? { duprCap: 'average' as const } : {}), minAge: optNum(d.minAge), cap: optNum(d.cap), fee: optNum(d.fee) };
    return { name: d.name, kind: d.kind, ...f, entries: post === 'roster' ? (d.kind === 'singles' ? d.picked.map((p) => [p]) : d.teams) : [], rules: post === 'roster' ? undefined : rules };
  }
  const mode: EntryMode = post === 'registration' ? 'registration' : 'roster';
  async function create() {
    if (!b) return;
    if (name.trim().length < 2) return setMsg('Give the tournament a name');
    if (post !== 'roster' && (!city.trim() || !venue.trim())) return setMsg('Add the city and venue');
    if (post === 'listed' && !contact.trim() && !link.trim()) return setMsg('Add a contact number or a link so players can enter');
    if (upi.trim() && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(upi.trim())) return setMsg('A UPI ID looks like name@bank');
    if (link.trim() && !/^https:\/\/[^\s<>"]+$/.test(link.trim())) return setMsg('A link starts with https://');
    for (const d of divs) { const e = checkDivisionSetup(toInput(d), post === 'roster' ? 'roster' : 'registration'); if (e) return setMsg(`${d.name || 'Event'}: ${e}`); }
    setBusy(true); setMsg(null);
    const opt = (v: string) => v.trim() || undefined;
    try {
      const id = await b.createTournament({
        clubId, name, startDate: date, startTime: time, courts, slotMinutes: slot, divisions: divs.map(toInput), entryMode: mode, listingOnly: post === 'listed',
        details: { city: opt(city), venue: opt(venue), about: opt(about), upiId: post === 'registration' ? opt(upi) : undefined, entriesClose: post === 'registration' ? opt(closes) : undefined, contact: post === 'listed' ? opt(contact) : undefined, link: post === 'listed' ? opt(link) : undefined },
      });
      // A poster problem doesn't lose the tournament either: it can be added again from the tournament's page.
      if (poster) {
        const bundle = await b.tournamentBundle(id);
        await b.setPoster(bundle.tournament, poster).catch(() => undefined);
      }
      // Put it on the board now if asked; a listing problem doesn't lose the tournament (it can be posted again from its page).
      if (post === 'listed' || (post === 'registration' && onBoard)) await b.submitListing(id, post === 'listed' ? 'listed' : 'run').catch(() => undefined);
      go('club-tournament', id, { replace: true });
    } catch (e) { setMsg(errorText(e)); setBusy(false); }
  }

  return (
    <main className="screen" aria-labelledby="tnew-title">
      <Header id="tnew-title" title="New tournament" onBack={onBack} />
      <Status error={club.error} loading={club.loading && !club.data} />
      <Field label="How do players enter?">
        <Segmented<PostKind> label="How do players enter?" value={post} options={[{ value: 'roster', label: 'I pick them' }, { value: 'registration', label: 'They register' }, { value: 'listed', label: 'List only' }]} onChange={setPost} />
      </Field>
      <p className="small muted" style={{ margin: 0 }}>{post === 'roster' ? 'Choose the players from your club now (good for club nights).' : post === 'registration' ? 'Players enter in the app with a link or from the events board. You accept entries, then make the draw.' : 'Free: it shows on the events board and players contact you to enter. Nothing is run on PICKLEQ.'}</p>
      <Field label="Tournament name"><input className="input" aria-label="Tournament name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="First match"><input className="input" type="time" aria-label="First match" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      {post !== 'roster' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Field label="City"><input className="input" aria-label="City" value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} /></Field>
            <Field label="Venue"><input className="input" aria-label="Venue" value={venue} maxLength={120} onChange={(e) => setVenue(e.target.value)} /></Field>
          </div>
          <Field label="About (optional)"><textarea className="input" aria-label="About" value={about} maxLength={1000} onChange={(e) => setAbout(e.target.value)} placeholder="Format, prizes, what to bring" /></Field>
        </>
      )}
      {post !== 'roster' && <PosterPicker onPicked={(blob) => setPoster(blob)} />}
      {post === 'registration' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Field label="Entries close"><input className="input" type="date" aria-label="Entries close" value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
            <Field label="Your UPI ID (fees)"><input className="input" aria-label="Your UPI ID" placeholder="name@bank" value={upi} maxLength={130} onChange={(e) => setUpi(e.target.value)} /></Field>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Players pay you directly by UPI or at the venue. PICKLEQ never holds the money; you mark entries paid.</p>
          <label className="check-row"><input type="checkbox" checked={onBoard} onChange={(e) => setOnBoard(e.target.checked)} /><span>Show it on the PICKLEQ events board</span></label>
        </>
      )}
      {post === 'listed' && (
        <>
          <Field label="Contact number for entries"><input className="input" aria-label="Contact number for entries" inputMode="tel" value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} /></Field>
          <Field label="Your sign-up page (optional)"><input className="input" aria-label="Your sign-up page" placeholder="https://…" value={link} maxLength={300} onChange={(e) => setLink(e.target.value)} /></Field>
        </>
      )}
      {post !== 'listed' && <><Field label="Courts"><Chips label="Courts" value={courts} options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: n, label: String(n) }))} onChange={setCourts} /></Field>
      <Field label="Minutes per match slot"><Chips label="Minutes per match slot" value={slot} options={SLOT_OPTIONS.map((n) => ({ value: n, label: String(n) }))} onChange={setSlot} /></Field></>}
      {divs.map((d, i) => (
        <section key={i} className="card section" aria-label={`Event ${i + 1}`}>
          <input className="input" aria-label={`Event ${i + 1} name`} value={d.name} onChange={(e) => update(i, { name: e.target.value })} />
          <Segmented label={`Event ${i + 1} type`} value={d.kind} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} onChange={(k) => update(i, { kind: k, picked: [], teams: [] })} />
          {post !== 'roster' && <DivisionRulesFields d={d} label={`Event ${i + 1}`} onChange={(patch) => update(i, patch)} />}
          {post === 'registration' && <p className="small muted" style={{ margin: 0 }}>You choose the format (round robin, pools and knockouts, or knockout only, and the points for each round) when you make the draw, once you know how many entered.</p>}
          {post === 'roster' && <FormatFields label={`Event ${i + 1}`} entries={entryCount(d)} value={d.fmt} onChange={(patch) => update(i, { fmt: { ...d.fmt, ...patch } })} />}
          {post === 'roster' && <EntryPicker d={d} players={players} pmap={pmap} onChange={(patch) => update(i, patch)} label={`Event ${i + 1}`} />}
          {divs.length > 1 && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDivs((ds) => ds.filter((_, j) => j !== i))}>Remove this event</button>}
        </section>
      ))}
      <button type="button" className="btn btn-outline" onClick={() => setDivs((ds) => [...ds, newDraft(ds.some((x) => x.kind === 'doubles') ? 'singles' : 'doubles')])}>Add another event</button>
      {post === 'roster' && b && club.data && <WalkIn b={b} clubId={clubId} onAdded={(p) => { setMsg(null); club.reload(); setDivs((ds) => ds.map((d, j) => (j === ds.length - 1 ? { ...d, picked: [...d.picked, p.id] } : d))); }} />}
      {post === 'roster' && <DayEstimateBox events={divs.map((d) => ({ name: d.name, entries: entryCount(d), ...d.fmt }))} courts={courts} slotMinutes={slot} startTime={time} finishBy={finishBy} onFinishBy={setFinishBy} onUse={(i, c) => update(i, { fmt: { ...divs[i].fmt, ...c } })} />}
      {post !== 'listed' && <p className="small muted" style={{ margin: 0 }}>Players are seeded by DUPR and spread across pools so the strongest don’t meet early. Each match gets a court and a time, and nobody is booked on two courts at once.</p>}
      {post !== 'roster' && <p className="small muted" style={{ margin: 0 }}>Your club’s first listing is checked by PICKLEQ before it shows on the board. Adults only (18+).</p>}
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <button type="button" className="btn btn-primary" disabled={busy || !club.data} onClick={create}>{post === 'listed' ? 'Post the listing' : post === 'registration' ? 'Create and open entries' : 'Create tournament'}</button>
    </main>
  );
}

function DivisionRulesFields({ d, label, onChange }: { d: DivDraft; label: string; onChange: (p: Partial<DivDraft>) => void }) {
  const genders: { value: DivisionGender; label: string }[] = [{ value: 'open', label: 'Open' }, { value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }, ...(d.kind === 'doubles' ? [{ value: 'mixed' as const, label: 'Mixed' }] : [])];
  const num = (k: 'maxDupr' | 'minAge' | 'cap' | 'fee', v: string, decimal = false) => onChange({ [k]: v.replace(decimal ? /[^\d.]/g : /\D/g, '') });
  return (
    <div className="section">
      <Field label="Who can enter"><Segmented label={`${label} gender`} value={d.gender} options={genders} onChange={(g) => onChange({ gender: g })} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <Field label="DUPR cap (optional)"><input className="input" aria-label={`${label} DUPR cap`} inputMode="decimal" placeholder="e.g. 3.5" value={d.maxDupr} onChange={(e) => num('maxDupr', e.target.value, true)} /></Field>
        <Field label="Age group (optional)"><input className="input" aria-label={`${label} age group`} inputMode="numeric" placeholder="e.g. 35 for 35+" value={d.minAge} onChange={(e) => num('minAge', e.target.value)} /></Field>
        <Field label="Most entries (optional)"><input className="input" aria-label={`${label} most entries`} inputMode="numeric" placeholder="e.g. 16" value={d.cap} onChange={(e) => num('cap', e.target.value)} /></Field>
        <Field label="Entry fee, ₹ (optional)"><input className="input" aria-label={`${label} entry fee`} inputMode="numeric" placeholder={d.kind === 'doubles' ? 'per team' : 'per player'} value={d.fee} onChange={(e) => num('fee', e.target.value)} /></Field>
      </div>
      {d.kind === 'doubles' && d.maxDupr.trim() !== '' && (
        <Field label="The DUPR cap is for">
          <Segmented label={`${label} DUPR cap is for`} value={d.duprCap} options={[{ value: 'each', label: 'Each player' }, { value: 'average', label: 'Team average' }]} onChange={(v) => onChange({ duprCap: v })} />
        </Field>
      )}
    </div>
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
      {!staff && <PosterImage src={t.posterUrl} name={t.name} />}
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
          {t.entryMode === 'registration' && <button type="button" className="btn btn-primary" onClick={() => go('club-inbox', t.id)}>{t.drawnAt ? 'Entries inbox' : 'Entries inbox and draw'}</button>}
          <button type="button" className="btn btn-outline" onClick={() => go('club-desk', t.id)}>Desk view</button>
          <button type="button" className="btn btn-outline" onClick={() => go('club-scorers', t.id)}>Scorer links</button>
          <button type="button" className="btn btn-outline" onClick={() => go('club-entries', t.id)}>Entries</button>
          <button type="button" className="btn btn-outline" onClick={() => go('club-dupr', t.id)}>Send to DUPR</button>
        </nav>
      )}
      {staff && b && <ListingCard b={b} t={t} role={d.role} onChanged={state.reload} />}
      {t.entryMode === 'registration' && !t.drawnAt && <p className="small muted" style={{ margin: 0 }}>Players are registering. The pools and schedule appear here once you make the draw in the entries inbox.</p>}
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
export function DivisionBody({ d, divisionId, view, onScore, label }: { d: Pick<TournamentBundle, 'divisions' | 'entries' | 'matches'> & { tournament: { startTime: string; slotMinutes: number } }; divisionId: string; view: View; onScore?: (matchId: string) => void; label: (e?: Entry) => string }) {
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
    if (division.shape === 'ko') return <p className="small muted">This event is a knockout only: see Knockouts.</p>;
    const pools = [...new Set(entries.map((e) => e.pool ?? 1))].sort((a, b) => a - b);
    const poolMatches = matches.filter((m) => m.stage === 'pool');
    const q = (division.extra ?? 0) > 0 ? poolQualifiers(division, entries, poolMatches) : null;
    const bestIds = new Set(q ? q.runnersUp.slice(0, q.extra).map((r) => r.entryId) : []);
    return (
      <section className="section" aria-label="Pools">
        {pools.map((p) => {
          const ids = entries.filter((e) => (e.pool ?? 1) === p).map((e) => e.id);
          return <PoolTable key={p} title={`Pool ${poolLetter(p)}`} rows={standings(ids, poolMatches, (id) => emap.get(id)?.seed ?? 99)} through={(r) => r.rank <= division.advance} best={(r) => bestIds.has(r.entryId)} label={(id) => label(emap.get(id))} />;
        })}
        {q && q.runnersUp.length > 0 && (
          <div className="card section">
            <h3 style={{ fontSize: 16 }}>Best {division.advance === 1 ? 'runners-up' : `${division.advance + 1}-placed`} ({q.extra} go through)</h3>
            <PoolTable title={`Best ${division.advance === 1 ? 'runners-up' : 'next-placed'}`} bare rows={q.runnersUp.map((r, i) => ({ ...r, rank: i + 1 }))} through={(r) => r.rank <= q.extra} label={(id) => `${label(emap.get(id))} (${poolLetter(emap.get(id)?.pool)})`} />
            <p className="small muted" style={{ margin: 0 }}>{RUNNERS_UP_TEXT}</p>
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>P played · W won · L lost · PF points scored · PA points conceded · +/− points difference.</p>
        <p className="small muted" style={{ margin: 0 }}>{TIE_BREAK_TEXT}</p>
      </section>
    );
  }
  const ko = matches.filter((m) => m.stage !== 'pool').sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.bracketPos ?? 0) - (b.bracketPos ?? 0));
  const rounds = [...new Set(ko.map((m) => m.round ?? 1))];
  return (
    <section className="section" aria-label="Knockouts">
      {division.advance === 0 && division.shape !== 'ko' && <p className="small muted">This event has no knockouts.</p>}
      {division.advance > 0 && ko.length === 0 && <p className="small muted">Knockouts are drawn once every pool match is finished.</p>}
      {rounds.map((r) => {
        const ms = ko.filter((m) => (m.round ?? 1) === r);
        const stage = ms[0].stage as KnockoutStage;
        const f = formatFor(division, stage);
        return (
          <div key={r} className="section">
            <h3 style={{ fontSize: 16 }}>{ROUND_LABEL[stage] ?? STAGE_LABEL[stage]}</h3>
            <p className="small muted" style={{ margin: 0 }}>{f.bestOf === 3 ? 'Best of 3 games' : 'One game'} to {f.pointsTo}{f.golden ? ', golden point' : ''}</p>
            {ms.map((m) => <FixtureRow key={m.id} m={m} a={label(emap.get(m.entryA ?? ''))} b={m.entryB ? label(emap.get(m.entryB)) : 'Bye'} onScore={onScore} />)}
          </div>
        );
      })}
    </section>
  );
}

/** A pool table: P · W · L · PF · PA · +/−. Names wrap so it fits a 320 px phone. */
function PoolTable({ title, rows, through, best, label, bare }: { title: string; rows: StandingRow[]; through: (r: StandingRow) => boolean; best?: (r: StandingRow) => boolean; label: (id: string) => string; bare?: boolean }) {
  const table = (
    <table className="table pool-table" aria-label={title} style={{ fontSize: 13, tableLayout: 'auto', width: '100%' }}>
      <thead><tr><th>#</th><th style={{ width: '100%' }}>Name</th><th>P</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>+/−</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const pill = through(r) ? 'Through' : best?.(r) ? 'Best runner-up' : null;
          return (
            <tr key={r.entryId} style={pill ? { fontWeight: 600 } : undefined}>
              <td>{r.rank}</td><td style={{ wordBreak: 'break-word' }}>{label(r.entryId)}{pill && <><br /><span className="pill pill-ok">{pill}</span></>}</td>
              <td>{r.played}</td><td>{r.wins}</td><td>{r.losses}</td><td>{r.pointsFor}</td><td>{r.pointsAgainst}</td><td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  if (bare) return table;
  return <div className="card section"><h3 style={{ fontSize: 16 }}>{title}</h3>{table}</div>;
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
        {m.status === 'void' ? <span className="pill">Cancelled</span> : m.status === 'done' && !m.entryB && !m.sideB.length && m.stage !== 'pool' ? 'Through (bye)' : m.status === 'done' && !m.games.length ? 'Walkover' : m.status === 'done' ? score : m.status === 'live' ? <span className="pill pill-warn">Live {score}</span> : onScore ? <span className="pill">Score</span> : <span className="pill">To play</span>}
      </span>
    </>
  );
  return onScore && m.status !== 'done' && m.status !== 'void'
    ? <button type="button" className="match-row" aria-label={`Score ${a} against ${b}`} onClick={() => onScore(m.id)}>{body}</button>
    : <div className="match-row">{body}</div>;
}

/** Public results: no login, names and scores only. Refreshes every 20 seconds while the tournament is live. */
export function Results({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [tick, setTick] = useState(0);
  const state = useLoad<PublicTournament | null>(async () => {
    let lastError: unknown = null;
    for (const src of await publicSourcesFor(slug)) {
      try { const r = await src.publicTournament(slug); if (r) return r; } catch (e) { lastError = e; }
    }
    if (lastError) throw lastError;
    return null;
  }, [slug, tick]);
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
                return { ...m, clubId: '', sideA: [], sideB: [], format: formatFor(dv, m.stage), updatedAt: '' };
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
