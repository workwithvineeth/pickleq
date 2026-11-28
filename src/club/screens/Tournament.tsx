import { LiveCourts } from './LiveCourts';
import { MatchDna } from '../../rallyq/arena/MatchDna';
import { usePublicScores } from './usePublicScores';
import { TournamentEntrySummary } from './MatchdayHeader';
import { PublicScoreAnnouncement } from './PublicScoreAnnouncement';
import { isBronzeMatch, resultsChampions } from '../resultsReport';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Chips, Field, Segmented } from '../../components/Controls';
import { newId } from '../../db/ids';
import { routeHash, type Go } from '../../navigation';
import { clubMark, ModeButton, OrgShell, PageHead, PublicShell } from '../../rallyq/shell/Shell';
import { Legacy } from './InboxLegacy';
import { ChampionHero, ResultsPosters, type ChampionInfo } from './ResultsPosters';
import type { ClubBackend, PublicTournament, TournamentBundle } from '../backend';
import { crossoverPairs, entryRating, formatFor, matchResult, nextStage, stageForSize, playerRating, poolLetter, RUNNERS_UP_TEXT, slotTime, standings, tieBreakText, type StandingRow } from '../domain/engine';
import { backend, publicSourcesFor, rememberReturn } from '../index';
import { KnockoutsWaiting } from './KnockoutsWaiting';
import { checkDivisionSetup, knockoutMatchesToAdd, poolQualifiers, poolsComplete, type NewDivisionInput } from '../plan';
import { APPROVAL_NOTE, GO_LIVE_NOTE, isAdmin, isApproved, isStaff, ROUND_LABEL, STAGE_LABEL, type KnockoutStage, type ClubMatch, type ClubPlayer, type Division, type DivisionGender, type DivisionKind, type Entry, type EntryMode } from '../types';
import { ListingCard } from './Inbox';
import { LifecycleCard } from './Lifecycle';
import { PromoStudio } from './PromoStudio';
import { ApprovalCard } from './Approvals';
import { DayEstimateBox, defaultFormatDraft, draftToDivision, FormatFields, ScoringDefaultsFields, SLOT_OPTIONS, type FormatDraft } from './Formats';
import { ClubLogo, PosterImage, PosterPicker } from './Poster';
import { WalkIn } from './Organiser';
import { displayPlayerName, appLink, DemoNote, errorText, fmtRating, names, shareLink, Status, useLoad } from './common';
import { friendlyDate, friendlyTime } from '../dates';
import { preflight, type PreflightItem } from '../preflight';
import { count } from '../count';

const today = () => new Date().toISOString().slice(0, 10);

interface DivDraft { name: string; kind: DivisionKind; fmt: FormatDraft; picked: string[]; teams: string[][]; gender: DivisionGender; maxDupr: string; duprCap: 'each' | 'average'; minAge: string; cap: string; fee: string }
/** Switching Singles/Doubles renames a default name ("Open Singles" ⇄ "Open Doubles", "Men's Singles 35+" ⇄ "Men's Doubles 35+"); a custom name stays. */
/** The Promote → Results card starts with this event's champions (the shown category first), once a final is confirmed. */
export function promoPodium(d: Parameters<typeof resultsChampions>[0], divisionId?: string) {
  const all = resultsChampions(d);
  const pick = all.find((c) => c.division === d.divisions.find((x) => x.id === divisionId)?.name) ?? all[0];
  return pick ? { champions: pick.winner, runnersUp: pick.opponent, score: pick.score } : undefined;
}
export const renameForKind = (name: string, kind: DivisionKind): string => {
  const from = kind === 'doubles' ? /\bSingles\b/ : /\bDoubles\b/;
  return name.replace(from, kind === 'doubles' ? 'Doubles' : 'Singles');
};
const newDraft = (kind: DivisionKind): DivDraft => ({ name: kind === 'singles' ? 'Open Singles' : 'Open Doubles', kind, fmt: defaultFormatDraft(), picked: [], teams: [], gender: 'open', maxDupr: '', duprCap: 'each', minAge: '', cap: '', fee: '' });
/** What the organiser is posting: run on RallyQ with players picked now, run on RallyQ with players registering, or a board listing only. */
type PostKind = 'roster' | 'registration' | 'listed';
type NewField = 'name' | 'city' | 'venue' | 'contact' | 'upi' | 'link' | `event${number}`;
const optNum = (v: string) => (v.trim() === '' ? undefined : Number(v));

export function TournamentNew({ clubId, go, onBack }: { clubId: string; go: Go; onBack: () => void }) {
  const b = backend();
  const club = useLoad(async () => {
    if (!b) throw new Error('Open Club mode first');
    const membership = (await b.myClubs()).find((item) => item.club.id === clubId);
    if (membership && isStaff(membership.role)) {
      const bundle = await b.clubBundle(clubId);
      return { club: bundle.club, players: bundle.players, platformDraft: false };
    }
    if (!(await b.isPlatformAdmin())) throw new Error('Only authorised organisers can create tournaments');
    const detail = await b.adminClub(clubId);
    return { club: { name: detail.name, trusted: false }, players: [] as ClubPlayer[], platformDraft: true };
  }, [b, clubId]);
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
  const [onBoard, setOnBoard] = useState(false);
  const [poster, setPoster] = useState<Blob | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [bad, setBad] = useState<{ field: NewField; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Picking players makes the draw at once, so only trusted clubs (approved automatically) get that option.
  const pickOk = !!club.data?.club.trusted;
  useEffect(() => { if (club.data && ((!pickOk && post === 'roster') || (club.data.platformDraft && post !== 'registration'))) setPost('registration'); }, [club.data, pickOk, post]);
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
  function invalid(field: NewField, text: string) {
    setBad({ field, text }); setMsg(null);
    const el = document.getElementById(`tnew-${field}`);
    el?.scrollIntoView?.({ block: 'center' }); el?.focus({ preventScroll: true });
  }
  async function create(send = false) {
    if (!b) return;
    if (name.trim().length < 2) return invalid('name', 'Give the tournament a name');
    if (post !== 'roster' && !city.trim()) return invalid('city', 'Add the city');
    if (post !== 'roster' && !venue.trim()) return invalid('venue', 'Add the venue');
    if (post === 'listed' && !contact.trim() && !link.trim()) return invalid('contact', 'Add a contact number or a link so players can enter');
    if (upi.trim() && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(upi.trim())) return invalid('upi', 'A UPI ID looks like name@bank');
    if (link.trim() && !/^https:\/\/[^\s<>"]+$/.test(link.trim())) return invalid('link', 'A link starts with https://');
    for (const [i, d] of divs.entries()) { const e = checkDivisionSetup(toInput(d), post === 'roster' ? 'roster' : 'registration'); if (e) return invalid(`event${i}`, `${d.name || 'Event'}: ${e}`); }
    setBusy(true); setMsg(null); setBad(null);
    const opt = (v: string) => v.trim() || undefined;
    try {
      const id = await b.createTournament({
        clubId, name, startDate: date, startTime: time, courts, slotMinutes: slot, divisions: divs.map(toInput), entryMode: mode, listingOnly: post === 'listed', registrationOpen: false, platformDraft: club.data?.platformDraft,
        details: { city: opt(city), venue: opt(venue), about: opt(about), upiId: post === 'registration' ? opt(upi) : undefined, entriesClose: post === 'registration' ? opt(closes) : undefined, contact: post === 'listed' ? opt(contact) : undefined, link: post === 'listed' ? opt(link) : undefined },
      });
      if (club.data?.platformDraft) { go('admin-club', clubId, { replace: true }); return; }
      // A poster problem doesn't lose the tournament either: it can be added again from the tournament's page.
      if (poster) {
        const bundle = await b.tournamentBundle(id);
        await b.setPoster(bundle.tournament, poster).catch(() => undefined);
      }
      // Put it on the board now if asked; a listing problem doesn't lose the tournament (it can be posted again from its page).
      if (post === 'listed' || (post === 'registration' && onBoard)) await b.submitListing(id, post === 'listed' ? 'listed' : 'run').catch(() => undefined);
      // A failed send keeps the draft: the tournament page's approval card shows it unsent, with Submit for approval.
      if (send) await b.submitTournament(id).catch(() => undefined);
      go('club-tournament', id, { replace: true });
    } catch (e) { setMsg(errorText(e)); setBusy(false); }
  }

  const errProps = (f: NewField) => (bad?.field === f ? { 'aria-invalid': true, 'aria-describedby': `tnew-${f}-error` } : {});
  const errBelow = (f: NewField) => bad?.field === f && <p id={`tnew-${f}-error`} role="alert" style={{ color: 'var(--coral, #FF655C)', fontSize: 13, margin: '4px 0 0' }}>{bad.text}</p>;
  return (
    <OrgShell go={go} active="tournaments" clubName={club.data?.club.name} clubId={clubId}>
      <PageHead cap={club.data?.club.name ?? 'Your club'} title={<span id="tnew-title">Create tournament</span>} actions={<button type="button" className="btn ghost sm" onClick={onBack}>Back</button>} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <section className="card" style={{ flex: '999 1 560px', minWidth: 0, padding: 22 }}><Legacy style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Status error={club.error} loading={club.loading && !club.data} />
      <Field label="How do players enter?">
        <Segmented<PostKind> label="How do players enter?" value={post} options={[...(pickOk ? [{ value: 'roster' as PostKind, label: 'I add the players' }] : []), { value: 'registration', label: 'Players request entry' }, ...(club.data?.platformDraft ? [] : [{ value: 'listed' as const, label: 'Listing only' }])]} onChange={setPost} />
      </Field>
      {club.data && !pickOk && <p className="small muted" style={{ margin: 0 }}>{GO_LIVE_NOTE} {APPROVAL_NOTE}</p>}
      <p className="small muted" style={{ margin: 0 }}>{post === 'roster' ? 'Choose the players from your club now (good for club nights).' : post === 'registration' ? 'Players enter in the app with a link or from the events board. You accept entries, then make the draw.' : 'Free: it shows on the events board and players contact you to enter. Nothing is run on RallyQ.'}</p>
      <Field label="Tournament name"><input id="tnew-name" className="input" aria-label="Tournament name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} {...errProps('name')} />{errBelow('name')}</Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <Field label="Date"><input className="input" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="First match"><input className="input" type="time" aria-label="First match" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      {post !== 'roster' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Field label="City"><input id="tnew-city" className="input" aria-label="City" value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} {...errProps('city')} />{errBelow('city')}</Field>
            <Field label="Venue"><input id="tnew-venue" className="input" aria-label="Venue" value={venue} maxLength={120} onChange={(e) => setVenue(e.target.value)} {...errProps('venue')} />{errBelow('venue')}</Field>
          </div>
          <Field label="About (optional)"><textarea className="input" aria-label="About" value={about} maxLength={1000} onChange={(e) => setAbout(e.target.value)} placeholder="Format, prizes, what to bring" /></Field>
        </>
      )}
      {post !== 'roster' && <PosterPicker onPicked={(blob) => setPoster(blob)} />}
      {post === 'registration' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Field label="Entries close"><input className="input" type="date" aria-label="Entries close" value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
            <Field label="Your UPI ID (fees)"><input id="tnew-upi" className="input" aria-label="Your UPI ID" placeholder="name@bank" value={upi} maxLength={130} onChange={(e) => setUpi(e.target.value)} {...errProps('upi')} />{errBelow('upi')}</Field>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Players pay you directly by UPI or at the venue. RallyQ never holds the money; you mark entries paid.</p>
          <label className="check-row"><input type="checkbox" checked={onBoard} onChange={(e) => setOnBoard(e.target.checked)} /><span>Show it on the RallyQ events board</span></label>
        </>
      )}
      {post === 'listed' && (
        <>
          <Field label="Contact number for entries"><input id="tnew-contact" className="input" aria-label="Contact number for entries" inputMode="tel" value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} {...errProps('contact')} />{errBelow('contact')}</Field>
          <Field label="Your sign-up page (optional)"><input id="tnew-link" className="input" aria-label="Your sign-up page" placeholder="https://…" value={link} maxLength={300} onChange={(e) => setLink(e.target.value)} {...errProps('link')} />{errBelow('link')}</Field>
        </>
      )}
      {post !== 'listed' && <><Field label="Courts"><Chips label="Courts" value={courts} options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: n, label: String(n) }))} onChange={setCourts} /></Field>
      <Field label="Minutes per match slot"><Chips label="Minutes per match slot" value={slot} options={SLOT_OPTIONS.map((n) => ({ value: n, label: String(n) }))} onChange={setSlot} /></Field></>}
      {divs.map((d, i) => (
        <section key={i} className="card section" aria-label={`Event ${i + 1}`}>
          <input id={`tnew-event${i}`} className="input" aria-label={`Event ${i + 1} name`} value={d.name} onChange={(e) => update(i, { name: e.target.value })} {...errProps(`event${i}`)} />{errBelow(`event${i}`)}
          <Segmented label={`Event ${i + 1} type`} value={d.kind} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} onChange={(k) => update(i, { kind: k, picked: [], teams: [], name: renameForKind(d.name, k) })} />
          {post !== 'roster' && <DivisionRulesFields d={d} label={`Event ${i + 1}`} onChange={(patch) => update(i, patch)} />}
          {post === 'registration' && <ScoringDefaultsFields label={`Event ${i + 1}`} value={d.fmt} onChange={(fmt) => update(i, { fmt })} />}
          {post === 'registration' && <p className="small muted" style={{ margin: 0 }}>You choose the shape (round robin, pools and knockouts, or knockout only) when you make the draw, once you know how many entered.</p>}
          {post === 'roster' && <FormatFields label={`Event ${i + 1}`} entries={entryCount(d)} value={d.fmt} onChange={(patch) => update(i, { fmt: { ...d.fmt, ...patch } })} />}
          {post === 'roster' && <EntryPicker d={d} players={players} pmap={pmap} onChange={(patch) => update(i, patch)} label={`Event ${i + 1}`} />}
          {divs.length > 1 && <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDivs((ds) => ds.filter((_, j) => j !== i))}>Remove this event</button>}
        </section>
      ))}
      <button type="button" className="btn btn-outline" onClick={() => setDivs((ds) => [...ds, newDraft(ds.some((x) => x.kind === 'doubles') ? 'singles' : 'doubles')])}>Add another event</button>
      {post === 'roster' && b && club.data && <WalkIn b={b} clubId={clubId} onAdded={(p) => { setMsg(null); club.reload(); setDivs((ds) => ds.map((d, j) => (j === ds.length - 1 ? { ...d, picked: [...d.picked, p.id] } : d))); }} />}
      {post === 'roster' && <DayEstimateBox events={divs.map((d) => ({ name: d.name, entries: entryCount(d), ...d.fmt }))} courts={courts} slotMinutes={slot} startTime={time} finishBy={finishBy} onFinishBy={setFinishBy} onUse={(i, c) => update(i, { fmt: { ...divs[i].fmt, ...c } })} />}
      {post !== 'listed' && <p className="small muted" style={{ margin: 0 }}>Players with a DUPR rating are seeded across pools, so the top seeds start in different pools; players without one show as Unrated. Each match gets a court and a time, and nobody is booked on two courts at once.</p>}
      {post !== 'roster' && <p className="small muted" style={{ margin: 0 }}>Your club’s first listing is checked by RallyQ before it shows on the board. Adults only (18+).</p>}
      {msg && <div role="status" className="warn">{msg}</div>}
      <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn" disabled={busy || !club.data} onClick={() => create(post === 'registration' && !club.data?.platformDraft)}>{post === 'listed' ? 'Submit listing for approval' : post === 'registration' ? (club.data?.platformDraft ? 'Save draft' : 'Save and send to RallyQ') : 'Create tournament'}</button>
        {post === 'registration' && !club.data?.platformDraft && <button type="button" className="tlink" disabled={busy || !club.data} onClick={() => create(false)}>Save draft</button>}
      </div>
      </Legacy></section>
      {post !== 'roster' && <aside className="card" aria-label="Preview on Events" style={{ flex: '1 1 300px', minWidth: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 20 }}>
        <div className="cap">Preview on Events</div>
        <div className="row" style={{ gap: 10 }}><span className="tile">{clubMark(club.data?.club.name ?? 'Club')}</span><span><span className="cap" style={{ display: 'block' }}>Hosted by</span><b style={{ fontSize: 14 }}>{club.data?.club.name ?? 'Your club'}</b></span></div>
        <div className="disp" style={{ fontSize: 28, overflowWrap: 'anywhere' }}>{name.trim() || 'Tournament name'}</div>
        <div className="mut" style={{ fontSize: 13 }}>{[friendlyDate(date), time && friendlyTime(time), venue.trim() || city.trim(), post !== 'listed' ? `${courts} court${courts === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{divs.filter((d) => d.name.trim()).map((d, i) => <span key={i} className="chip">{d.name}</span>)}</div>
        <span className="st wait" style={{ alignSelf: 'flex-start' }}>{post === 'registration' && onBoard ? 'Shows on Events once RallyQ approves it' : post === 'listed' ? 'Listing: checked by RallyQ first' : 'Not on the Events board'}</span>
      </aside>}
      </div>
    </OrgShell>
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
      <div className="label">{d.kind === 'singles' ? `${count(d.picked.length, 'player')} entered` : `${count(d.teams.length, 'team')} · ${count(d.picked.length, 'player')} chosen`}</div>
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

export type View = 'schedule' | 'pools' | 'knockouts';

/** Pill tabs in the v1.2 look. A labelled group of toggle buttons, so screen readers hear which one is on. */
function Tabs<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" className={o.value === value ? 'tab on' : 'tab'} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
const cardPad = { padding: 20, display: 'flex', flexDirection: 'column', gap: 12 } as const;
const small = { fontSize: 12, margin: 0 } as const;
/** The DUPR of each player who has one, in entry order: "DUPR 3.95 · 4.10". Empty when nobody is rated (no "Unrated" noise). */
function duprLine(ids: string[], pmap: Map<string, ClubPlayer>, kind: DivisionKind): string {
  const rated = ids.map((id) => playerRating(pmap.get(id), kind)).filter((r): r is number => r !== undefined);
  return rated.length ? `DUPR ${rated.map((r) => r.toFixed(2)).join(' · ')}` : '';
}

export function TournamentView({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) throw new Error('Open Club mode first');
    const t = await b.tournamentBundle(id);
    // Create knockout rounds as soon as they're ready (staff only).
    if (isStaff(t.role) && isApproved(t.tournament)) {
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
  const [confirmDone, setConfirmDone] = useState(false);
  const d = state.data;
  if (!d) return (
    <OrgShell go={go} active="draw">
      <PageHead cap="Pools & knockouts" title="Tournament" actions={<><ModeButton /><button type="button" className="btn ghost sm" onClick={onBack}>Back</button></>} />
      <Status error={state.error} loading={state.loading} />
    </OrgShell>
  );
  const staff = isStaff(d.role);
  const t = d.tournament;
  const approved = isApproved(t);
  const division = d.divisions.find((x) => x.id === div) ?? d.divisions[0];
  const link = appLink(`#/results/${t.publicSlug}`);
  const pmap = new Map(d.players.map((p) => [p.id, p]));
  async function set(patch: Parameters<NonNullable<typeof b>['updateTournament']>[1], ok: string) {
    try { await b?.updateTournament(t.id, patch); setMsg(ok); state.reload(); } catch (e) { setMsg(errorText(e)); }
  }
  async function addKnockouts(x: Division, n: number) {
    try { await b?.addKnockoutStage(x, n); setMsg(n === 2 ? `${x.name}: the final is ready to score` : `${x.name}: semi-finals are ready to score`); state.reload(); } catch (e) { setMsg(errorText(e)); }
  }
  // Round-robin-only events that are fully played: offer knockouts (TPC follow-up, Phase 3).
  const rrDone = d.divisions.filter((x) => x.advance === 0 && x.shape !== 'ko' && d.matches.some((m) => m.divisionId === x.id && m.stage === 'pool') && poolsComplete(x.id, d.matches) && !d.matches.some((m) => m.divisionId === x.id && m.stage !== 'pool' && m.status !== 'void'));
  // One ball-yellow button: the next step for this tournament.
  const next: 'entries' | 'start' | 'desk' | 'results' | 'share' | null = !staff ? (t.isPublic && approved ? 'share' : null) : !approved ? 'entries' : t.status === 'draft' ? 'start' : t.status === 'done' ? 'results' : 'desk';
  const cls = (k: typeof next) => (k === next ? 'btn' : 'btn ghost');
  const status = t.cancelledAt ? <span className="st no">Cancelled</span> : t.status === 'live' ? <span className="chip live">Live</span> : t.status === 'done' ? <span className="st off">Finished</span> : t.registrationOpen ? <span className="st ok">Entries open</span> : !t.drawnAt ? <span className="st off">Entries not open yet</span> : <span className="st off">Entries closed</span>;
  const teams = division ? d.entries.filter((e) => e.divisionId === division.id && e.status !== 'withdrawn').length : 0;
  return (
    <OrgShell go={go} active="draw" clubName={d.club.name} clubId={d.club.id} tournament={{ id: t.id, name: t.name, slug: t.publicSlug }}>
      <PageHead
        cap={<>Pools &amp; knockouts{division ? ` · ${division.name}${teams ? ` · ${teams} ${division.kind === 'singles' ? 'players' : 'teams'} in the draw` : ' · no draw yet'}` : ''}</>}
        title={t.name}
        sub={<span className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{status}<span>{[friendlyDate(t.startDate), friendlyTime(t.startTime), t.venue].filter(Boolean).join(' · ')}</span></span>}
        actions={<><ModeButton /><button type="button" className="btn ghost sm" onClick={onBack}>Back</button></>}
      />
      {t.cancelledAt && <div role="status" className="warn">This tournament was cancelled{t.cancelReason ? `: ${t.cancelReason}` : ''}.</div>}
      {msg && <div role="status" className="note">{msg}</div>}
      {staff && approved && t.status === 'live' && <KnockoutsWaiting divisions={d.divisions} matches={d.matches.filter((m) => m.status !== 'void')} who={(m) => `${names(m.sideA, pmap)} v ${names(m.sideB, pmap)}`} onOpen={() => go('club-desk', t.id)} openLabel="Open at the desk" />}
      {staff && !approved && (
        <nav className="row" style={{ flexWrap: 'wrap' }} aria-label="Set up the tournament">
          <button type="button" className={cls('entries')} onClick={() => go('club-entries', t.id)}>Entries</button>
        </nav>
      )}
      {staff && approved && (
        <nav className="row" style={{ flexWrap: 'wrap' }} aria-label="Run the tournament">
          {t.status === 'draft' && <button type="button" className={cls('start')} onClick={() => set({ status: 'live' }, 'The tournament is live')}>Start tournament</button>}
          <button type="button" className={cls('desk')} onClick={() => go('club-desk', t.id)}>Desk view</button>
          <button type="button" className="btn ghost" onClick={() => go('club-scorers', t.id)}>Referee links</button>
          {t.status !== 'draft' && <button type="button" className="btn ghost" onClick={() => go('club-dupr', t.id)}>File for DUPR</button>}
          {t.status !== 'draft' && <button type="button" className={cls('results')} onClick={() => go('club-results-dupr', t.id)}>Results &amp; DUPR</button>}
        </nav>
      )}
      {staff && b && t.status !== 'done' && approved && <Preflight b={b} d={d} go={go} />}
      {staff && approved && t.status === 'live' && rrDone.map((x) => {
        const n = d.entries.filter((e) => e.divisionId === x.id && e.status !== 'withdrawn').length;
        return (
          <section key={x.id} className="card" style={cardPad} aria-label={`${x.name}: round robin finished`}>
            <h2 className="disp" style={{ fontSize: 24 }}>{x.name}: every round-robin game is played</h2>
            <p className="mut" style={{ margin: 0 }}>It was set up as round robin only, so no knockouts were made. Crown the table winner by marking the tournament finished, or add knockouts from the table now.</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {n >= 4 && <button type="button" className="btn alt" onClick={() => void addKnockouts(x, 4)}>Add semi-finals and a final (top 4)</button>}
              {n >= 2 && <button type="button" className="btn ghost" onClick={() => void addKnockouts(x, 2)}>Add a final (top 2)</button>}
            </div>
          </section>
        );
      })}
      <div className="between">
        {d.divisions.length > 1 ? <Tabs label="Event" value={division.id} options={d.divisions.map((x) => ({ value: x.id, label: x.name }))} onChange={setDiv} /> : <span />}
        <nav className="row" style={{ flexWrap: 'wrap' }} aria-label="Tournament sections">
          {staff && approved && <button type="button" className="btn ghost sm" onClick={() => go('club-entries', t.id)}>{t.entryMode === 'registration' && !t.drawnAt ? 'Entries and draw' : 'Entries'}</button>}
          <Tabs<View> label="Tournament view" value={view} options={[{ value: 'schedule', label: 'Schedule' }, { value: 'pools', label: 'Pools' }, { value: 'knockouts', label: 'Knockouts' }]} onChange={setView} />
        </nav>
      </div>
      {t.entryMode === 'registration' && !t.drawnAt && <p className="note" style={{ margin: 0 }}>Players are registering. The pools and schedule appear here once you make the draw in Entries.</p>}
      {division && view === 'pools' && division.shape !== 'ko' && <DrawPools d={d} division={division} pmap={pmap} />}
      {division && <DivisionBody d={d} divisionId={division.id} view={view} onScore={staff ? (mid) => go('club-score', mid) : undefined} label={(e) => (e ? `${names(e.playerIds, pmap)}${e.status === 'withdrawn' ? ' (withdrawn)' : ''}` : 'To be decided')} />}
      {t.isPublic && approved && (
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="between">
            <span><b>Results link</b><span className="mut" style={{ display: 'block', fontSize: 13 }}>Anyone with the link sees pools, knockouts and scores. No login needed.</span></span>
            <button type="button" className={cls('share')} onClick={async () => setMsg(await shareLink(`${t.name} results`, link))}>Share the results link (no login needed)</button>
          </div>
        </div>
      )}
      {staff && approved && !t.isPublic && <div><button type="button" className="btn ghost" onClick={() => set({ isPublic: true }, 'Results link is on')}>Turn on the results link</button></div>}
      {/* Cards shared with other organiser pages keep their own look until those pages are rebuilt. */}
      <div className="pq-matchday pq-proto" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {staff && b && <ApprovalCard b={b} t={t} onChanged={state.reload} />}
        {staff && b && <ListingCard b={b} t={t} role={d.role} onChanged={state.reload} />}
        {staff && !t.cancelledAt && (
          <details className="card section">
            <summary><b>Promote this tournament</b> <span className="small muted">· posts, story, results card, A4 poster with QR</span></summary>
            <PromoStudio events={[{ id: t.id, name: t.name, club: d.club.name, startDate: t.startDate, startTime: t.startTime, courts: t.courts, slug: t.publicSlug, podium: promoPodium(d, division?.id) }]} />
          </details>
        )}
        <TournamentEntrySummary d={d} b={b} go={go} />
        {!staff && <PosterImage src={t.posterUrl} name={t.name} size="thumb" />}
      </div>
      {staff && approved && t.status === 'done' && isAdmin(d.role) && (
        <section className="card" style={cardPad} aria-label="Share your experience">
          <h2 className="disp" style={{ fontSize: 24 }}>That’s a wrap! How did it go?</h2>
          <p className="mut" style={{ margin: 0 }}>Two lines from you help other clubs try RallyQ. It takes 30 seconds.</p>
          <div><button type="button" className="btn ghost" onClick={() => go('club-view', d.club.id)}>Share your experience</button></div>
        </section>
      )}
      {staff && approved && (
        <section className="card" style={cardPad} aria-label="When it’s over">
          <h2 className="disp" style={{ fontSize: 24 }}>When it’s over</h2>
          {t.status === 'live' && !confirmDone && <div><button type="button" className="btn ghost" onClick={() => setConfirmDone(true)}>Mark as finished</button></div>}
          {t.status === 'live' && confirmDone && (
            <section className="panel2" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Finish the tournament">
              <p style={{ margin: 0 }}>Mark it as finished? The referee links and the desk link stop working. You can reopen it later if needed.</p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="btn alt" onClick={() => { setConfirmDone(false); void set({ status: 'done' }, 'Marked as finished'); }}>Yes, mark as finished</button>
                <button type="button" className="btn ghost" onClick={() => setConfirmDone(false)}>Cancel</button>
              </div>
            </section>
          )}
          {t.status === 'done' && <div><button type="button" className="btn ghost" onClick={() => set({ status: 'live' }, 'Reopened: the tournament is live again')}>Reopen tournament</button></div>}
          {t.status === 'draft' && <p className="mut" style={{ margin: 0 }}>Start the tournament first; you can mark it finished after the final.</p>}
          {t.isPublic && <button type="button" className="tlink" style={{ alignSelf: 'flex-start' }} onClick={() => set({ isPublic: false }, 'Results link turned off')}>Turn off the results link</button>}
        </section>
      )}
      <div className="pq-matchday pq-proto" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {b && isAdmin(d.role) && <LifecycleCard b={b} d={d} go={go} onChanged={state.reload} />}
        <DemoNote b={b} />
      </div>
    </OrgShell>
  );
}

/** The draw at a glance: each pool's teams in seed order with every player's DUPR. */
function DrawPools({ d, division, pmap }: { d: TournamentBundle; division: Division; pmap: Map<string, ClubPlayer> }) {
  const entries = d.entries.filter((e) => e.divisionId === division.id);
  const pools = [...new Set(entries.map((e) => e.pool ?? 1))].sort((a, b) => a - b);
  if (!entries.length) return null;
  return (
    <section aria-label="The draw" className="grid g4">
      {pools.map((p) => (
        <section key={p} className="card" aria-label={`Pool ${poolLetter(p)} draw`} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="between"><b className="disp" style={{ fontSize: 22 }}>Pool {poolLetter(p)}</b><span className="cap">Team · DUPR</span></div>
          {entries.filter((e) => (e.pool ?? 1) === p).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99)).map((e, i) => {
            const avg = entryRating(e.playerIds, pmap, division.kind);
            return (
              <div key={e.id} className="card2" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14 }}>
                <span className="between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><b>{i + 1}. </b>{names(e.playerIds, pmap)}{e.status === 'withdrawn' ? ' (withdrawn)' : ''}</span>
                  {e.playerIds.length > 1 && avg !== undefined && <span className="n" style={{ fontSize: 16 }}>{avg.toFixed(2)}</span>}
                </span>
                <span className="mut" style={{ fontSize: 12 }}>{duprLine(e.playerIds, pmap, division.kind)}</span>
              </div>
            );
          })}
        </section>
      ))}
    </section>
  );
}

/** "Ready for the day?": entries, draw, referee links, PINs and finish time, each with a way to fix it. */
function Preflight({ b, d, go }: { b: ClubBackend; d: TournamentBundle; go: Go }) {
  const t = d.tournament;
  const extra = useLoad(async () => {
    const [links, access, regs] = await Promise.all([
      b.scorerLinks(t.id),
      b.tournamentAccess(t.id),
      t.entryMode === 'registration' && !t.drawnAt ? b.registrations(t.id) : Promise.resolve([]),
    ]);
    const accepted: Record<string, number> = {};
    for (const r of regs) if (r.status === 'accepted') accepted[r.divisionId] = (accepted[r.divisionId] ?? 0) + 1;
    return { linkCourts: links.filter((l) => !l.revoked).map((l) => l.court ?? 0), pins: !!access?.refereePin && !!access?.deskPin, accepted };
  }, [b, t.id, t.drawnAt]);
  const [open, setOpen] = useState(false);
  if (!extra.data) return null;
  const items = preflight({ t, divisions: d.divisions, entries: d.entries, matches: d.matches, ...extra.data });
  const done = items.filter((x) => x.ok).length;
  const all = done === items.length;
  const fix = (x: PreflightItem) => x.fix && (
    <button type="button" className="tlink" style={{ marginLeft: 10 }} onClick={() => go(x.fix === 'inbox' ? 'club-inbox' : x.fix === 'links' ? 'club-scorers' : 'club-entries', t.id)}>
      {x.fix === 'inbox' ? 'Open the entries inbox' : x.fix === 'links' ? 'Create referee links' : 'Open entries'}
    </button>
  );
  return (
    <section className="card" style={cardPad} aria-label="Ready for the day?">
      <div className="between">
        <h2 className="disp" style={{ fontSize: 24 }}>{all ? 'Ready for the day ✓' : 'Ready for the day?'}</h2>
        <span className={all ? 'st ok' : 'st wait'}>{done} of {items.length} done</span>
      </div>
      {(!all || open) && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {items.map((x) => (
            <li key={x.key} className={x.ok ? 'check on' : 'check'} style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <span className="bx" aria-hidden="true">{x.ok ? '✓' : ''}</span>
              <span style={{ flex: '1 1 200px', minWidth: 0 }}><span className="sr-only">{x.ok ? 'Done: ' : 'To do: '}</span>{x.text}{!x.ok && fix(x)}</span>
            </li>
          ))}
        </ul>
      )}
      {all && <button type="button" className="tlink" style={{ alignSelf: 'flex-start' }} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide the checks' : 'Show the checks'}</button>}
    </section>
  );
}

type BodyData = Pick<TournamentBundle, 'divisions' | 'entries' | 'matches'> & { tournament: { startTime: string; slotMinutes: number }; players?: ClubPlayer[] };

/** Shared by the club's tournament view, the desk and the public results page.
 * DUPR per player shows everywhere: organiser pages load the players, the public feed carries each player's DUPR (`duprs`). */
export function DivisionBody({ d, divisionId, view, onScore, label }: { d: BodyData; divisionId: string; view: View; onScore?: (matchId: string) => void; label: (e?: Entry) => string }) {
  const division = d.divisions.find((x) => x.id === divisionId);
  const entries = d.entries.filter((e) => e.divisionId === divisionId);
  const emap = new Map(entries.map((e) => [e.id, e]));
  const matches = d.matches.filter((m) => m.divisionId === divisionId);
  const pmap = useMemo(() => (d.players ? new Map(d.players.map((p) => [p.id, p])) : null), [d.players]);
  if (!division) return null;
  const dupr = (id?: string) => { const e = emap.get(id ?? ''); return e && pmap ? duprLine(e.playerIds, pmap, division.kind) : undefined; };
  const name = (id?: string) => label(emap.get(id ?? ''));
  const time = (m: ClubMatch) => (m.slot !== undefined ? slotTime(d.tournament.startTime, m.slot, d.tournament.slotMinutes) : undefined);
  if (view === 'schedule') {
    const sorted = [...matches].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.court ?? 0) - (b.court ?? 0));
    const slots = [...new Set(sorted.map((m) => m.slot ?? -1))];
    const courts = [...new Set(sorted.filter((m) => m.court).map((m) => m.court as number))].sort((a, b) => a - b);
    const noCourt = sorted.some((m) => !m.court);
    const cell = (ms: ClubMatch[]) => (ms.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{ms.map((m) => <FixtureRow key={m.id} m={m} a={name(m.entryA)} b={m.entryB || m.stage === 'pool' ? name(m.entryB) : 'Bye'} onScore={onScore} />)}</div> : <span className="mut">—</span>);
    return (
      <section className="card" aria-label="Schedule">
        {sorted.length === 0 ? <p className="empty" style={{ margin: 0 }}>No matches yet. They appear here once the draw is made.</p> : (
          <div className="scroll">
            <table className="tbl" aria-label="Schedule by court" style={{ minWidth: Math.max(320, 90 + (courts.length + (noCourt ? 1 : 0)) * 210) }}>
              <thead><tr><th>Time</th>{courts.map((c) => <th key={c}>Court {c}</th>)}{noCourt && <th>Court to be set</th>}</tr></thead>
              <tbody>
                {slots.map((s) => {
                  const ms = sorted.filter((m) => (m.slot ?? -1) === s);
                  return (
                    <tr key={s} style={{ verticalAlign: 'top' }}>
                      <td className="n" style={{ fontSize: 18, whiteSpace: 'nowrap' }}>{s >= 0 ? slotTime(d.tournament.startTime, s, d.tournament.slotMinutes) : <span className="mut" style={{ fontSize: 13 }}>Time to be set</span>}</td>
                      {courts.map((c) => <td key={c}>{cell(ms.filter((m) => m.court === c))}</td>)}
                      {noCourt && <td>{cell(ms.filter((m) => !m.court))}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }
  if (view === 'pools') {
    if (division.shape === 'ko') return <p className="mut" style={{ margin: 0 }}>This event is a knockout only: see Knockouts.</p>;
    const pools = [...new Set(entries.map((e) => e.pool ?? 1))].sort((a, b) => a - b);
    const poolMatches = matches.filter((m) => m.stage === 'pool');
    const q = (division.extra ?? 0) > 0 ? poolQualifiers(division, entries, poolMatches) : null;
    // "Through" only once a pool's matches are all played; before that the table is just the current order.
    const poolDone = (p: number) => { const ms = poolMatches.filter((m) => (m.pool ?? 1) === p && m.status !== 'void'); return ms.length > 0 && ms.every((m) => m.status === 'done'); };
    const allDone = poolMatches.length > 0 && poolMatches.every((m) => m.status === 'done' || m.status === 'void');
    const bestIds = new Set(q && allDone ? q.runnersUp.slice(0, q.extra).map((r) => r.entryId) : []);
    return (
      <section aria-label="Pools" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pools.map((p) => {
          // Withdrawn teams never rank: they sit at the bottom, unranked and labelled (audit 21 Nov, B5).
          const inPool = entries.filter((e) => (e.pool ?? 1) === p);
          const ids = inPool.filter((e) => e.status !== 'withdrawn').map((e) => e.id);
          const out = inPool.filter((e) => e.status === 'withdrawn').map((e): StandingRow => ({ entryId: e.id, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0, rank: 0 }));
          return <PoolTable key={p} title={`Pool ${poolLetter(p)}`} rows={[...standings(ids, poolMatches, (id) => emap.get(id)?.seed ?? 99), ...out]} through={(r) => poolDone(p) && r.rank <= division.advance} best={(r) => bestIds.has(r.entryId)} label={name} dupr={pmap ? dupr : undefined} matches={poolMatches} />;
        })}
        {q && q.runnersUp.length > 0 && (
          <div className="card" style={cardPad}>
            <h3 className="disp" style={{ fontSize: 24 }}>Best {division.advance === 1 ? 'runners-up' : `${division.advance + 1}-placed`} ({q.extra} go through)</h3>
            <PoolTable title={`Best ${division.advance === 1 ? 'runners-up' : 'next-placed'}`} bare rows={q.runnersUp.map((r, i) => ({ ...r, rank: i + 1 }))} through={(r) => allDone && r.rank <= q.extra} label={(id) => `${name(id)} (${poolLetter(emap.get(id)?.pool)})`} dupr={pmap ? dupr : undefined} />
            <p className="mut" style={small}>{RUNNERS_UP_TEXT}</p>
          </div>
        )}
        <p className="mut" style={small}>P played · W won · L lost · Pts won and Pts lost: points scored and conceded (PF, PA) · Diff: points difference (+/−).{pmap ? ' DUPR is shown for players who have one.' : ''}</p>
        <p className="mut" style={small}>{tieBreakText(divisionId)}</p>
      </section>
    );
  }
  const bronze = matches.filter(isBronzeMatch);
  const ko = matches.filter((m) => m.stage !== 'pool' && !isBronzeMatch(m)).sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.bracketPos ?? 0) - (b.bracketPos ?? 0));
  const rounds = [...new Set(ko.map((m) => m.round ?? 1))];
  // First knockout round: "A1 v D2", read from the finished pool tables (never guessed). Shown only when both sides are known.
  const place = new Map<string, string>();
  if (division.shape !== 'ko' && division.advance > 0) {
    const poolMatches = matches.filter((m) => m.stage === 'pool' && m.status !== 'void');
    for (const p of [...new Set(entries.map((e) => e.pool ?? 1))]) {
      const ms = poolMatches.filter((m) => (m.pool ?? 1) === p);
      if (!ms.length || !ms.every((m) => m.status === 'done')) continue;
      const ids = entries.filter((e) => (e.pool ?? 1) === p).map((e) => e.id);
      for (const r of standings(ids, ms, (id) => emap.get(id)?.seed ?? 99)) place.set(r.entryId, `${poolLetter(p)}${r.rank}`);
    }
  }
  const firstRound = rounds[0];
  const lab = (m: ClubMatch) => { const a = place.get(m.entryA ?? ''), b = place.get(m.entryB ?? ''); return (m.round ?? 1) === firstRound && a && b ? `${a} v ${b}` : undefined; };
  const box = (m: ClubMatch, final?: boolean) => <MatchBox key={m.id} m={m} a={name(m.entryA)} b={m.entryB ? name(m.entryB) : 'Bye'} da={dupr(m.entryA)} db={dupr(m.entryB)} meta={[m.court ? `Court ${m.court}` : '', time(m) ?? ''].filter(Boolean).join(' · ')} onScore={onScore} final={final} lab={lab(m)} />;
  return (
    <section className="card" aria-label="Knockouts" style={cardPad}>
      {division.advance === 0 && division.shape !== 'ko' && ko.length === 0 && <p className="mut" style={{ margin: 0 }}>This event has no knockouts.</p>}
      {division.advance > 0 && ko.length === 0 && <p className="mut" style={{ margin: 0 }}>Knockouts are drawn once every pool match is finished.</p>}
      {division.advance > 0 && division.shape !== 'ko' && ko.length === 0 && <KnockoutPlan division={division} pools={[...new Set(entries.map((e) => e.pool ?? 1))].sort((x, y) => x - y)} />}
      {division.shape === 'ko' && ko.length === 0 && <p className="mut" style={{ margin: 0 }}>The knockout draw appears here once it is made.</p>}
      {rounds.length > 0 && (
        <div className="scroll">
          <div className="bracket" style={{ minWidth: rounds.length * 238 - 18, alignItems: 'stretch' }}>
            {rounds.map((r) => {
              const ms = ko.filter((m) => (m.round ?? 1) === r);
              const stage = ms[0].stage as KnockoutStage;
              const f = formatFor(division, stage);
              return (
                <div key={r} className="col">
                  <div>
                    <h3 className="cap" style={{ margin: 0 }}>{ROUND_LABEL[stage] ?? STAGE_LABEL[stage]}</h3>
                    <span className="mut" style={{ fontSize: 12 }}>{formatWords(f)}</span>
                  </div>
                  {ms.map((m) => box(m, stage === 'final'))}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {bronze.length > 0 && (
        <section aria-label="Bronze match" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
          <h3 className="cap" style={{ margin: 0 }}>Bronze match</h3>
          {bronze.map((m) => <MatchBox key={m.id} m={m} a={name(m.entryA)} b={name(m.entryB)} da={dupr(m.entryA)} db={dupr(m.entryB)} meta="" />)}
        </section>
      )}
    </section>
  );
}

/** "One game to 11, win by 2" / "Best of 3 games to 15, golden point". */
export const formatWords = (f: { bestOf?: number; pointsTo: number; golden?: boolean }) => `${f.bestOf === 3 ? 'Best of 3 games' : 'One game'} to ${f.pointsTo}${f.golden ? ', golden point' : ', win by 2'}`;

/**
 * The planned knockout bracket, shown before the groups finish so players know the path: which pool places meet in the
 * first round (the same crossover the draw will use), who the winners play next, and each round's game format.
 */
export function KnockoutPlan({ division, pools }: { division: Division; pools: number[] }) {
  const qualifiers = pools.flatMap((pool) => Array.from({ length: division.advance }, (_, i) => ({ entryId: `${pool}-${i + 1}`, pool, place: i + 1 })));
  const pairs = crossoverPairs(qualifiers);
  if (!pairs) return null;
  const tag = (q: { pool: number; place: number }) => `${poolLetter(q.pool)}${q.place}`;
  const rounds: { stage: KnockoutStage; games: string[] }[] = [];
  let stage: KnockoutStage | null = stageForSize(pairs.length * 2);
  const short: Record<KnockoutStage, string> = { r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', final: 'F' };
  rounds.push({ stage, games: pairs.map(([a, b]) => `${tag(a)} v ${tag(b)}`) });
  let prev = rounds[0];
  while ((stage = nextStage(stage)) && prev.games.length > 1) {
    const p = prev;
    const games = Array.from({ length: p.games.length / 2 }, (_, i) => `Winner ${short[p.stage]}${i * 2 + 1} v Winner ${short[p.stage]}${i * 2 + 2}`);
    prev = { stage, games };
    rounds.push(prev);
  }
  return (
    <section aria-label="Knockout plan" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0 }}><b>How the knockouts work.</b> Top {division.advance} from each pool go through. Pool matches: {formatWords(division.format).toLowerCase()}.</p>
      <div className="scroll">
        <div className="bracket" style={{ minWidth: rounds.length * 238 - 18, alignItems: 'stretch' }}>
          {rounds.map((r) => {
            const f = formatFor(division, r.stage);
            return (
              <div key={r.stage} className="col">
                <div>
                  <h3 className="cap" style={{ margin: 0 }}>{ROUND_LABEL[r.stage]}</h3>
                  <span className="mut" style={{ fontSize: 12 }}>{formatWords(f)}</span>
                </div>
                {r.games.map((g, i) => (
                  <div key={g} className="card" style={{ padding: '10px 12px', fontSize: 14 }}>
                    <span className="mut" style={{ fontSize: 12 }}>{r.stage === 'final' ? 'Final' : `${short[r.stage]}${i + 1}`}</span>
                    <div><b>{g}</b></div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** A pool table: # · Team (and DUPR) · P · W · L · Pts won · Pts lost · Diff · Through. Wide, so it sits in a scroll box. */
function PoolTable({ title, rows, through, best, label, dupr, bare, matches }: { matches?: ClubMatch[]; title: string; rows: StandingRow[]; through: (r: StandingRow) => boolean; best?: (r: StandingRow) => boolean; label: (id: string) => string; dupr?: (id: string) => string | undefined; bare?: boolean }) {
  const [expanded, setExpanded] = useState<string>();
  const num = { fontSize: 18 } as const;
  const table = (
    <div className="scroll">
      <table className="tbl" aria-label={title}>
        <thead><tr><th>#</th><th>{dupr ? 'Team and DUPR' : 'Team'}</th><th>P</th><th>W</th><th>L</th><th>Pts won</th><th>Pts lost</th><th>Diff</th><th aria-label="Qualified" /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const out = r.rank === 0;
            const pill = out ? null : through(r) ? 'Through' : best?.(r) ? 'Best runner-up' : null;
            const line = dupr?.(r.entryId);
            return (
              <Fragment key={r.entryId}><tr>
                <td className="n" style={{ fontSize: 22 }}>{out ? '–' : r.rank}</td>
                <td style={{ minWidth: 180 }}>{matches ? <button type="button" className="tlink" style={{ textAlign: 'left', overflowWrap: 'anywhere' }} aria-expanded={expanded === r.entryId} onClick={() => setExpanded(expanded === r.entryId ? undefined : r.entryId)}>{label(r.entryId)}</button> : <b>{label(r.entryId)}</b>}{line && <div className="mut" style={{ fontSize: 12 }}>{line}</div>}</td>
                <td className="n" style={num}>{r.played}</td><td className="n acc" style={{ fontSize: 20 }}>{r.wins}</td><td className="n" style={num}>{r.losses}</td><td className="n" style={num}>{r.pointsFor}</td><td className="n" style={num}>{r.pointsAgainst}</td><td className="n" style={num}>{r.diff > 0 ? `+${r.diff}` : r.diff < 0 ? `−${-r.diff}` : 0}</td>
                <td>{pill && <span className="st ok">{pill}</span>}{out && <span className="st off">Withdrawn</span>}</td>
              </tr>
              {expanded === r.entryId && matches && <tr className="expand"><td colSpan={9}>
                <strong>Pool matches</strong>
                {matches.filter((match) => match.entryA === r.entryId || match.entryB === r.entryId).map((match) => {
                  const first = match.entryA === r.entryId;
                  const opponent = first ? match.entryB : match.entryA;
                  const score = match.games.map((game) => first ? `${game.a}–${game.b}` : `${game.b}–${game.a}`).join(', ');
                  const status = { done: 'Completed', live: 'Live', scheduled: 'Scheduled', void: 'Cancelled' }[match.status];
                  return <p key={match.id} style={{ margin: '6px 0 0' }}>vs {opponent ? label(opponent) : 'To be decided'} · {status}{score && ` · ${score}`}</p>;
                })}
                {!matches.some((match) => match.entryA === r.entryId || match.entryB === r.entryId) && <p style={{ margin: '6px 0 0' }}>No pool matches scheduled.</p>}
              </td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  if (bare) return table;
  return <div className="card" style={cardPad}><h3 className="disp" style={{ fontSize: 24 }}>{title}</h3>{table}</div>;
}

/** What a match shows instead of a score: a word, never colour alone. Null when the games say it all. */
function matchState(m: Pick<ClubMatch, 'status' | 'games' | 'entryB' | 'stage'> & { sideB?: string[] }, scorable: boolean) {
  if (m.status === 'void') return <span className="st off">Cancelled</span>;
  if (m.status === 'done') return !m.entryB && !m.sideB?.length && m.stage !== 'pool' ? <span className="st off">Through (bye)</span> : !m.games.length ? <span className="st off">Walkover</span> : null;
  if (m.status === 'live') return <span className="st live">Live</span>;
  return scorable ? null : <span className="st wait">To play</span>;
}
const scoreButton = (m: ClubMatch, a: string, b: string, onScore: (id: string) => void) => (
  <button type="button" className="btn ghost sm" aria-label={`Score ${a} against ${b}`} onClick={() => onScore(m.id)}>{m.status === 'live' ? 'Keep scoring' : 'Score'}</button>
);

/** One knockout match in the bracket. The winner turns ball-yellow only once the match is finished; the final turns gold only with a champion. */
function MatchBox({ m, a, b, da, db, meta, onScore, final, lab }: { m: ClubMatch; a: string; b: string; da?: string; db?: string; meta: string; onScore?: (id: string) => void; final?: boolean; lab?: string }) {
  const winner = m.status === 'done' ? matchResult(m).winner ?? m.winner : undefined;
  const can = !!onScore && m.status !== 'done' && m.status !== 'void';
  const champion = !!final && m.status === 'done' && !!winner;
  const state = matchState(m, can);
  const side = (who: 'A' | 'B', text: string, line?: string) => (
    <div className={winner === who ? 'w' : undefined}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{text}{line && <span className="mut" style={{ display: 'block', fontSize: 12, fontWeight: 400 }}>{line}</span>}</span>
      <span className="n" style={{ whiteSpace: 'nowrap' }}>{m.games.length ? m.games.map((g) => (who === 'A' ? g.a : g.b)).join(' · ') : '–'}</span>
    </div>
  );
  return (
    <div className={champion ? 'm champ' : 'm'} style={champion ? { boxShadow: 'inset 0 0 0 2px var(--gold)' } : final ? { boxShadow: 'inset 0 0 0 2px var(--ball)' } : undefined}>
      {lab && <div className="cap" style={{ justifyContent: 'flex-start', padding: '8px 14px 0' }}>{lab}</div>}
      {champion && <div className="cap" style={{ color: 'var(--gold)', justifyContent: 'flex-start' }}>Champion · {winner === 'A' ? a : b}</div>}
      {side('A', a, da)}
      {side('B', b, db)}
      {(state || meta || can) && <div style={{ alignItems: 'center', flexWrap: 'wrap', fontWeight: 400 }}><span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{state}{meta && <span className="mut" style={{ fontSize: 12 }}>{meta}</span>}</span>{can && scoreButton(m, a, b, onScore)}</div>}
    </div>
  );
}

/** One match in the schedule table. */
function FixtureRow({ m, a, b, onScore }: { m: ClubMatch; a: string; b: string; onScore?: (id: string) => void }) {
  const winner = m.status === 'done' ? matchResult(m).winner ?? m.winner : undefined;
  const can = !!onScore && m.status !== 'done' && m.status !== 'void';
  const score = m.games.length ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : '';
  const state = matchState(m, can);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 170 }}>
      <span className="cap">{m.stage === 'pool' ? (m.pool ? `Pool ${poolLetter(m.pool)}` : 'Pool') : STAGE_LABEL[m.stage]}</span>
      <span className={winner === 'A' ? 'acc' : undefined} style={{ fontWeight: winner === 'A' ? 700 : 500, overflowWrap: 'anywhere' }}>{a}</span>
      <span className="mut" style={{ fontSize: 12 }}>vs</span>
      <span className={winner === 'B' ? 'acc' : undefined} style={{ fontWeight: winner === 'B' ? 700 : 500, overflowWrap: 'anywhere' }}>{b}</span>
      <span className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {state}{score && <span className="n" style={{ fontSize: 16 }}>{score}</span>}
        {can && scoreButton(m, a, b, onScore)}
      </span>
    </div>
  );
}

const MY_NAME = 'pq-my-name';

/** A player's own matches across every event of the tournament, matched on the name they type (no account).
 * The next one is shown first with court and time; played ones show the score. */
/** The public feed's players for DUPR lines: keyed by name (the public entries list names, not ids), with the DUPR the organisers entered. */
export function publicPlayers(d: PublicTournament): ClubPlayer[] {
  const kind = new Map(d.divisions.map((x) => [x.id, x.kind]));
  const byName = new Map<string, ClubPlayer>();
  for (const e of d.entries) e.names.forEach((name, i) => {
    const p = byName.get(name) ?? { id: name, clubId: '', name, share: {} as ClubPlayer['share'] } as ClubPlayer;
    const r = e.duprs?.[i];
    if (r !== undefined) { if (kind.get(e.divisionId) === 'singles') p.duprSingles = r; else p.duprDoubles = r; }
    byName.set(name, p);
  });
  return [...byName.values()];
}

export function myMatchesFor(d: PublicTournament, query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const mine = new Map(d.entries.filter((e) => e.names.some((n) => n.toLowerCase().includes(q))).map((e) => [e.id, e]));
  const name = (id?: string) => (id ? d.entries.find((e) => e.id === id)?.names.join(' / ') ?? 'To be decided' : 'To be decided');
  const order: Record<string, number> = { live: 0, scheduled: 1, done: 2, void: 3 };
  return d.matches
    .filter((m) => (m.entryA && mine.has(m.entryA)) || (m.entryB && mine.has(m.entryB)))
    .map((m) => {
      const meA = !!m.entryA && mine.has(m.entryA);
      const dv = d.divisions.find((x) => x.id === m.divisionId);
      return {
        id: m.id, status: m.status, slot: m.slot ?? 999, court: m.court,
        time: m.slot !== undefined ? slotTime(d.startTime, m.slot, d.slotMinutes) : undefined,
        me: name(meA ? m.entryA : m.entryB), opponent: name(meA ? m.entryB : m.entryA),
        event: `${dv?.name ?? ''} · ${m.stage === 'pool' ? `Pool ${poolLetter(m.pool ?? 0)}` : STAGE_LABEL[m.stage]}`,
        score: m.games.filter((g) => g.a + g.b > 0).map((g) => (meA ? `${g.a}–${g.b}` : `${g.b}–${g.a}`)).join(', '),
        won: m.winner ? (m.winner === 'A') === meA : undefined,
      };
    })
    .sort((x, y) => (order[x.status] ?? 9) - (order[y.status] ?? 9) || x.slot - y.slot);
}

/** Player Studio is where official matches get claimed; signed-out players sign in first and come back to it. */
async function openClaim(go: Go) {
  const user = await backend()?.currentUser().catch(() => null);
  if (user) { go('club-player-studio'); return; }
  rememberReturn('#/club-player-studio');
  go('club-signin');
}

function MyMatches({ d, go }: { d: PublicTournament; go: Go }) {
  const [q, setQ] = useState(() => { try { return localStorage.getItem(MY_NAME) ?? ''; } catch { return ''; } });
  const list = myMatchesFor(d, q);
  const next = list.find((m) => m.status === 'live' || m.status === 'scheduled');
  const rest = list.filter((m) => m !== next);
  function change(v: string) { setQ(v); try { localStorage.setItem(MY_NAME, v); } catch { /* private mode */ } }
  return (
    <section className="card" style={cardPad} aria-label="My matches">
      <div className="between">
        <h2 className="disp" style={{ fontSize: 30 }}>My matches</h2>
        <div className="search"><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg><input className="inp" aria-label="Your name" placeholder="Type your name to see your matches" value={q} onChange={(e) => change(e.target.value)} autoComplete="name" /></div>
      </div>
      {q.trim().length >= 3 && list.length === 0 && <p className="mut" style={{ margin: 0 }}>No matches for “{q.trim()}” yet. Check the spelling, or ask the desk.</p>}
      {list.length > 0 && <p className="row" style={{ margin: 0, flexWrap: 'wrap', gap: 6 }}><span className="mut">These are my matches →</span><button type="button" className="tlink" onClick={() => void openClaim(go)}>Claim them in Player Studio</button></p>}
      {next && (
        <div className="note" style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Your next match" role="group">
          <span className="row" style={{ gap: 8 }}>{next.status === 'live' && <span className="st live">Live</span>}<span className="cap">{next.status === 'live' ? 'On court now' : 'Your next match'}</span></span>
          <b className="disp" style={{ fontSize: 28 }}>{next.court ? `Court ${next.court}` : 'Court to be called'}{next.time ? ` · ${next.time}` : ''}</b>
          <span>vs {next.opponent}</span>
          <span className="mut" style={{ fontSize: 13 }}>{next.event}</span>
        </div>
      )}
      {rest.length > 0 && (
        <div className="list">
          {rest.map((m) => (
            <div key={m.id} style={{ paddingInline: 0 }}>
              <span className="grow">
                <b style={{ display: 'block' }}>vs {m.opponent}</b>
                <span className="mut" style={{ fontSize: 13 }}>{m.event}{m.court ? ` · Court ${m.court}` : ''}{m.time && m.status !== 'done' ? ` · ${m.time}` : ''}</span>
              </span>
              <span className="row" style={{ gap: 8 }}>
                {m.status === 'done' ? <><span className={m.won ? 'st ok' : 'st off'}>{m.won ? 'Won' : 'Lost'}</span><span className="n" style={{ fontSize: 18 }}>{m.score}</span></> : m.status === 'live' ? <><span className="st live">Live</span><span className="n" style={{ fontSize: 18 }}>{m.score}</span></> : m.status === 'void' ? <span className="st off">Cancelled</span> : <span className="st wait">To play</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type PublicMatch = PublicTournament['matches'][number];
const gameScore = (m: PublicMatch, winnerFirst: boolean) => m.games.map((g) => ((m.winner === 'A') === winnerFirst ? `${g.a}–${g.b}` : `${g.b}–${g.a}`)).join(' · ');

/** The confirmed champion of one category, or null. Same rule as the organiser's results report:
 * exactly one final, finished, with a recorded winner and both sides present. */
export function publicChampion(d: PublicTournament, divisionId: string): ChampionInfo | null {
  const division = d.divisions.find((x) => x.id === divisionId);
  const ms = d.matches.filter((m) => m.divisionId === divisionId && m.status !== 'void');
  const finals = ms.filter((m) => m.stage === 'final');
  const f = finals[0];
  if (!division || finals.length !== 1 || f.status !== 'done' || !f.winner || !f.entryA || !f.entryB) return null;
  const namesOf = (id?: string) => (d.entries.find((e) => e.id === id)?.names ?? []).map(displayPlayerName);
  const champ = f.winner === 'A' ? f.entryA : f.entryB, other = f.winner === 'A' ? f.entryB : f.entryA;
  const winners = namesOf(champ), runnersUp = namesOf(other);
  if (!winners.length || !runnersUp.length) return null;
  const played = ms.filter((m) => m.status === 'done' && m.entryA && m.entryB && (m.entryA === champ || m.entryB === champ));
  return {
    category: division.name, winners, runnersUp, score: gameScore(f, true), lostScore: gameScore(f, false),
    semiFinalists: ms.filter((m) => m.stage === 'sf' && m.status === 'done' && m.winner && m.entryA && m.entryB).map((m) => namesOf(m.winner === 'A' ? m.entryB : m.entryA).join(' / ')).filter(Boolean),
    won: played.filter((m) => (m.winner === 'A' ? m.entryA : m.entryB) === champ).length, played: played.length,
  };
}

/** Navigation for the public page when the router hands it none: plain hash links. */
const hashGo: Go = (name, id) => { window.location.hash = routeHash({ name, id }); };

/** Public results: no login, names and scores only. Refreshes every 20 seconds while the tournament is live. */
export function Results({ slug, go = hashGo }: { slug: string; go?: Go }) {
  const [publicSlug, query] = slug.split('?');
  const requestedCourt = Number(new URLSearchParams(query).get('court')) || undefined;
  const state = usePublicScores(publicSlug);
  const [div, setDiv] = useState<string | null>(null);
  const [view, setView] = useState<View>('pools');
  const [msg, setMsg] = useState<string | null>(null);
  // The club's own logo, where it has uploaded one (the shell header shows its initials).
  const logo = useLoad(async () => {
    for (const src of await publicSourcesFor(publicSlug)) {
      try { const r = await src.publicClubLogo(publicSlug); if (r) return r; } catch { /* next place */ }
    }
    return null;
  }, [publicSlug]);
  const d = state.data;
  const division = d?.divisions.find((x) => x.id === div) ?? d?.divisions[0];
  const champion = useMemo(() => (d && division ? publicChampion(d, division.id) : null), [d, division]);
  const link = appLink(`#/results/${publicSlug}`);
  const played = d?.matches.filter((m) => m.status === 'done' && m.games.length > 0) ?? [];
  const points = played.reduce((n, m) => n + m.games.reduce((s, g) => s + g.a + g.b, 0), 0);
  const teams = d?.entries.filter((e) => (e as { status?: string }).status !== 'withdrawn').length ?? 0;
  const body: BodyData | null = d && division ? {
    divisions: d.divisions.map((x) => ({ ...x, tournamentId: '', clubId: '', sort: 0 })),
    entries: d.entries.map((e) => ({ ...e, clubId: '', playerIds: e.names })),
    matches: d.matches.map((m): ClubMatch => {
      const dv = d.divisions.find((x) => x.id === m.divisionId) ?? division;
      return { ...m, clubId: '', sideA: [], sideB: [], format: formatFor(dv, m.stage), updatedAt: '' };
    }),
    tournament: { startTime: d.startTime, slotMinutes: d.slotMinutes },
    players: publicPlayers(d),
  } : null;
  return (
    <PublicShell go={go} host={d ? { marks: [clubMark(d.club)], name: d.club } : undefined} footNote={d?.status === 'live' ? 'Scores update every 20 seconds.' : undefined}>
      <div className="res20">
      <PublicScoreAnnouncement slug={publicSlug} data={d} />
      <PageHead
        cap={d ? <span className={d.status === 'done' ? 'res20-confirmed' : undefined}>{d.status === 'done' ? `Final results · ${d.club}` : d.status === 'live' ? `Results so far · ${d.club}` : `Draw and schedule · ${d.club}`}</span> : undefined}
        title={d?.name ?? 'Results'}
        sub={d ? <span className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{logo.data?.logoUrl && <ClubLogo src={logo.data.logoUrl} club={d.club} size={32} />}{d.status === 'live' && <span className="chip live">Live</span>}<span>{[friendlyDate(d.startDate), d.club, `${teams} ${teams === 1 ? 'entry' : 'entries'}`, `${d.divisions.length} ${d.divisions.length === 1 ? 'category' : 'categories'}`, d.status === 'live' ? 'updates every 20 seconds' : d.status === 'done' ? 'Finished' : ''].filter(Boolean).join(' · ')}</span></span> : undefined}
        actions={<><a className="tlink" href="#/events" onClick={(e) => { e.preventDefault(); go('events'); }}>All events</a>{d && <button type="button" className="btn" onClick={async () => setMsg(await shareLink(`${d.name} results`, link))}>Share results</button>}</>}
      />
      {msg && <div role="status" className="note">{msg}</div>}
      <Status error={state.error} loading={state.loading && !d} />
      {!state.loading && !d && !state.error && <p className="mut" style={{ margin: 0 }}>These results aren’t available. Ask the club for a new link, or <a className="acc" href="#/events" onClick={(e) => { e.preventDefault(); go('events'); }}>see all events</a>.</p>}
      {d && division && body && (
        <>
          {d.status === 'live' && <div className="pq-matchday pq-proto pq-live-results"><LiveCourts key={publicSlug + ':' + (requestedCourt ?? 'default')} d={d} initialCourt={requestedCourt} live={state.live} /></div>}
          {d.divisions.length > 1 && <Tabs label="Event" value={division.id} options={d.divisions.map((x) => ({ value: x.id, label: x.name }))} onChange={setDiv} />}
          {champion && <ChampionHero c={champion} club={d.club} />}
          {champion && played.length > 0 && (
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="cap">{d.name} in numbers</span>
              <span className="row" style={{ gap: 22, flexWrap: 'wrap' }}>
                <span><span className="n acc" style={{ fontSize: 44 }}>{played.length}</span><span className="mut" style={{ display: 'block', fontSize: 12 }}>matches played</span></span>
                <span><span className="n" style={{ fontSize: 44 }}>{points}</span><span className="mut" style={{ display: 'block', fontSize: 12 }}>points scored</span></span>
              </span>
            </div>
          )}
          {champion && d.status === 'done' && <ResultsPosters c={champion} event={d.name} club={d.club} date={friendlyDate(d.startDate)} link={link} />}
          <MyMatches d={d} go={go} />
          <Tabs<View> label="Results view" value={view} options={[{ value: 'pools', label: 'Pools' }, { value: 'knockouts', label: 'Knockouts' }, { value: 'schedule', label: 'Matches' }]} onChange={setView} />
          {view === 'schedule' ? <GroupedMatches d={d} divisionId={division.id} /> : <DivisionBody d={body} divisionId={division.id} view={view} label={(e) => (e ? e.playerIds.map(displayPlayerName).join(' / ') : 'To be decided')} />}
          <p className="mut" style={{ margin: 0, fontSize: 13 }}>Live scores by <a aria-label={d.status === 'live' ? 'RallyQ: live scores. Run your club’s tournament at rallyq.in' : undefined} href="https://rallyq.in/" className="acc" style={{ fontWeight: 700 }}>RallyQ</a> · run your club’s tournament at rallyq.in</p>
        </>
      )}
      </div>
    </PublicShell>
  );
}

/** Public results, Matches tab: each group's matches together (live first, then to play, then played), then the knockouts. */
function GroupedMatches({ d, divisionId }: { d: PublicTournament; divisionId: string }) {
  const names = new Map(d.entries.map((e) => [e.id, e.names.map(displayPlayerName).join(' / ')]));
  const ms = d.matches.filter((m) => m.divisionId === divisionId && m.status !== 'void');
  const order = (m: PublicMatch) => (m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : 2);
  const sort = (a: PublicMatch, b: PublicMatch) => order(a) - order(b) || (a.slot ?? 0) - (b.slot ?? 0);
  const pools = [...new Set(ms.filter((m) => m.stage === 'pool').map((m) => m.pool ?? 1))].sort((a, b) => a - b);
  const stages = KNOCKOUT_ORDER.filter((st) => ms.some((m) => m.stage === st));
  const row = (m: PublicMatch) => {
    const score = m.games.map((g) => `${g.a}–${g.b}`).join(', ');
    const w = m.status === 'done' ? m.winner : undefined;
    return (
      <div key={m.id} className="res20-fixture" data-status={m.status}>
        <span className="grow">
          <span className={w === 'A' ? 'res20-team res20-a res20-winner' : 'res20-team res20-a'} style={{ display: 'block', fontWeight: w === 'A' ? 700 : 500 }}>{names.get(m.entryA ?? '') ?? 'To be decided'}</span>
          <span className={w === 'B' ? 'res20-team res20-b res20-winner' : 'res20-team res20-b'} style={{ display: 'block', fontWeight: w === 'B' ? 700 : 500 }}>{names.get(m.entryB ?? '') ?? 'To be decided'}</span>
          {m.court ? <span className="mut" style={{ fontSize: 13 }}>Court {m.court}</span> : null}
          <MatchDna d={d} m={m} all />
        </span>
        {m.status === 'live' ? <span className="row" style={{ gap: 8 }}><span className="chip live">Live</span><span className="n" style={{ fontSize: 18 }}>{score}</span></span> : m.status === 'done' ? (score ? <span className="n" style={{ fontSize: 18 }}>{score}</span> : <span className="st off">Walkover</span>) : <span className="st wait">To play</span>}
      </div>
    );
  };
  const block = (title: string, list: PublicMatch[]) => {
    const done = list.filter((m) => m.status === 'done').length;
    return (
      <section key={title} className="card" aria-label={title}>
        <div className="between" style={{ padding: '16px 18px 6px' }}><h3 className="disp" style={{ fontSize: 24 }}>{title}</h3><span className="mut" style={{ fontSize: 13 }}>{done} of {list.length} played</span></div>
        <div className="list">{[...list].sort(sort).map(row)}</div>
      </section>
    );
  };
  return (
    <>
      {pools.map((p) => block(`Pool ${poolLetter(p)}`, ms.filter((m) => m.stage === 'pool' && (m.pool ?? 1) === p)))}
      {ms.some(isBronzeMatch) && block('Bronze match', ms.filter(isBronzeMatch))}
      {stages.map((st) => block(ROUND_LABEL[st as KnockoutStage], ms.filter((m) => m.stage === st)))}
    </>
  );
}
const KNOCKOUT_ORDER = ['r32', 'r16', 'qf', 'sf', 'final'] as const;
