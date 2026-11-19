import { UPCOMING_EVENTS } from '../../rallyq/home/values';
import { EventPhotoHeader } from './MatchdayHeader';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Segmented } from '../../components/Controls';
import { routeHash, type Go, type RouteName } from '../../navigation';
import { clubMark, PageHead, PublicShell } from '../../rallyq/shell/Shell';
import type { ClubBackend, ListingReview, MyEntry, PublicEvent } from '../backend';
import { clubMode, inLaunchCity, LAUNCH_CITY } from '../config';
import { demoBackend, eventsBackend, publicSourcesFor, rememberReturn, serverBackend } from '../index';
import { blankPerson, capText, cleanEmail, entryProblem, rulesLine, upiLink } from '../registration';
import { canHost, isAdmin, PAYMENT_LABEL, REG_STATUS_LABEL, type EntryPerson, type PlayerGender, type RegistrationStatus } from '../types';
import { DemoNote, errorText, Header, shareLink, Skeleton, Status, useLoad } from './common';
import { OrganiserCard, PosterImage } from './Poster';
import { friendlyDate, friendlyTime } from '../dates';
import { entryStatus } from '../../rallyq/studio/myTournamentItems';

// ---------- Helpers ----------

const dayLabel = (iso: string) => friendlyDate(iso);
const timeLabel = (hhmm: string) => friendlyTime(hhmm);
/** Link to an event that previews nicely in WhatsApp (a small page with the event's title), then opens the app. */
export function eventShareLink(slug: string): string {
  return `${window.location.origin}${window.location.pathname}e/${encodeURIComponent(slug)}/`;
}
const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
const waLink = (phone: string) => { const d = phone.replace(/\D/g, ''); return `https://wa.me/${d.length === 10 ? `91${d}` : d}`; };

// ---------- RallyQ v1.2 parts shared by the board, the entry steps and My entries ----------

/** A real link (so it can be opened in a new tab) that moves inside the app. */
function linkTo(go: Go, name: RouteName, id?: string) {
  return { href: routeHash(id ? { name, id } : { name }), onClick: (ev: MouseEvent) => { ev.preventDefault(); go(name, id); } };
}
/** Loading and errors, in words (never colour alone). */
function Wait({ error, loading }: { error: string | null; loading?: boolean }) {
  if (error) return <div role="alert" className="note"><b>Something went wrong.</b> {error}</div>;
  if (loading) return <Skeleton rows={4} />;
  return null;
}
function DemoLine({ b }: { b: ClubBackend | null }) {
  if (b?.kind !== 'demo') return null;
  return <div className="note">Demo club. Sample players and scores. Nothing is shared.</div>;
}
/** One choice out of a few, as pill buttons (the prototype's tabs), announced as pressed or not. */
function Pills<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" className={o.value === value ? 'tab on' : 'tab'} style={{ minHeight: 44 }} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Today up to seven days from now (or live right now). */
function thisWeek(e: PublicEvent, now = new Date()): boolean {
  const end = new Date(now); end.setDate(end.getDate() + 7);
  return e.status === 'live' || (e.startDate >= isoDay(now) && e.startDate <= isoDay(end));
}
/** "24 of 32 teams" when every category has a limit; otherwise what is truly known. */
function spotsText(e: PublicEvent): string {
  if (e.listing === 'listed') return 'Enter with the organiser';
  if (e.status === 'live') return 'Playing now';
  const taken = e.divisions.reduce((n, d) => n + d.taken, 0);
  const kinds = new Set(e.divisions.map((d) => d.kind));
  const unit = kinds.size === 1 ? (kinds.has('doubles') ? 'teams' : 'players') : 'entries';
  if (e.divisions.length > 0 && e.divisions.every((d) => d.rules.cap !== undefined)) return `${taken} of ${e.divisions.reduce((n, d) => n + (d.rules.cap ?? 0), 0)} ${unit}`;
  if (e.registrationOpen) return e.entriesClose ? `Entries close ${dayLabel(e.entriesClose)}` : taken ? `${taken} ${taken === 1 ? unit.replace(/s$/, '').replace(/ie$/, 'y') : unit} so far` : 'Be the first to enter';
  return e.drawn ? 'Draw made' : 'Entries closed';
}
function hostLine(clubs: number): string {
  const rest = 'send your entry and see live scores as the referees enter them.';
  if (clubs === 0) return `Pick a tournament, ${rest}`;
  if (clubs === 1) return `1 club is hosting this week. Pick an event, ${rest}`;
  return `${clubs} clubs are hosting this week. Pick one, ${rest}`;
}

function EventStatus({ e }: { e: PublicEvent }) {
  if (e.status === 'live') return <span className="chip live">Live</span>;
  if (e.registrationOpen) return <span className="st ok">Entries open</span>;
  if (e.listing === 'listed') return <span className="st off">Contact the organiser</span>;
  return <span className="st off">{e.drawn ? 'Draw made' : 'Entries closed'}</span>;
}

/** Opens a public event on whichever club server knows it (the real server first, then the demo on this phone). */
async function findEvent(slug: string): Promise<{ src: ClubBackend; event: PublicEvent } | null> {
  let lastError: unknown = null;
  for (const src of await publicSourcesFor(slug)) {
    try { const event = await src.publicEvent(slug); if (event) return { src, event }; } catch (e) { lastError = e; }
  }
  if (lastError) throw lastError;
  return null;
}

function EventBadges({ e }: { e: PublicEvent }) {
  return (
    <span className="meta" style={{ gap: 6 }}>
      {e.status === 'live' && <span className="pill pill-warn">Live now</span>}
      {e.registrationOpen && <span className="pill pill-ok">Entries open</span>}
      {e.listing === 'listed' && <span className="pill">Contact the organiser</span>}
      {e.listing === 'run' && !e.registrationOpen && e.status !== 'live' && <span className="pill">{e.drawn ? 'Draw made' : 'Entries closed'}</span>}
    </span>
  );
}

// ---------- The events board (Events tab) ----------

type BoardFilter = 'all' | 'open' | 'live' | 'week';

export function EventsBoard({ go, robot, focus }: { go: Go; robot?: boolean; focus?: string }) {
  const b = eventsBackend();
  const state = useLoad(async () => {
    // Real events always show; a phone in demo mode also sees the demo's made-up ones (never instead of the real board).
    const server = serverBackend();
    const demoOn = clubMode() === 'demo';
    // A server that can't be reached (no signal) mustn't hide the demo's events: note it and carry on.
    let serverDown = false;
    const fromServer = async <T,>(f: () => Promise<T[]>): Promise<T[]> => {
      try { return await f(); } catch (e) { serverDown = true; if (!demoOn) throw e; return []; }
    };
    const [real, demo, pastReal, pastDemo, admin, user] = await Promise.all([
      server ? fromServer(() => server.publicEvents(robot)) : Promise.resolve([]),
      demoOn ? demoBackend().publicEvents() : Promise.resolve([]),
      server ? fromServer(() => server.recentResults(robot)) : Promise.resolve([]),
      demoOn ? demoBackend().recentResults() : Promise.resolve([]),
      b.isPlatformAdmin().catch(() => false),
      b.currentUser().catch(() => null),
    ]);
    const seen = new Set(real.map((e) => e.slug));
    // The robot's test board (#/events/robot) lists its sandbox event, which isn't in the launch city.
    const events = [...real, ...demo.filter((e) => !seen.has(e.slug))].filter((e) => robot || inLaunchCity(e.city)).sort((x, y) => x.startDate.localeCompare(y.startDate) || x.startTime.localeCompare(y.startTime));
    const pastSeen = new Set(pastReal.map((e) => e.slug));
    const past = [...pastReal, ...pastDemo.filter((e) => !pastSeen.has(e.slug))].filter((e) => robot || inLaunchCity(e.city)).sort((x, y) => y.startDate.localeCompare(x.startDate));
    const queue = admin ? await b.approvalQueue().catch(() => []) : [];
    return { events, past, pending: queue.filter((q) => q.approval === 'submitted').length, admin, serverDown, signedIn: !!user };
  }, [b, robot]);
  const [kind, setKind] = useState<BoardFilter>('all');
  // Arriving from an organiser's "Find it on the Events board" link: bring that event's card into view.
  useEffect(() => {
    if (!focus || !state.data) return;
    const el = document.getElementById(`ev-${focus}`);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.closest('article')?.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [focus, state.data]);
  const events = state.data?.events ?? [];
  const shown = events.filter((e) => kind === 'all' || (kind === 'open' && e.registrationOpen) || (kind === 'live' && e.status === 'live') || (kind === 'week' && thisWeek(e)));
  // One yellow button on the page: the first event you can enter right now.
  const lead = shown.find((e) => e.registrationOpen && e.status !== 'live');
  const clubs = new Set(events.map((e) => e.club.trim().toLowerCase())).size;
  const signedIn = !!state.data?.signedIn;

  return (
    <PublicShell go={go} active="events">
      <PageHead cap={<span className="acc">{LAUNCH_CITY} · pickleball</span>} title="Find your next main event." sub={state.data ? hostLine(clubs) : undefined}
        actions={<a className="btn ghost" {...linkTo(go, 'my-entries')}>My entries</a>} />
      {b.kind === 'demo' && clubMode() === 'demo' && <DemoLine b={b} />}
      {state.data?.admin && (
        <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => go('admin', state.data?.pending ? 'approvals' : 'overview')}>
          {state.data.pending ? `${state.data.pending} tournament${state.data.pending === 1 ? '' : 's'} to approve` : 'RallyQ admin'} <span aria-hidden="true">→</span>
        </button>
      )}
      <div className="between">
        <Pills<BoardFilter> label="Show" value={kind} options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Entries open' }, { value: 'live', label: 'Live now' }, { value: 'week', label: 'This week' }]} onChange={setKind} />
        {state.data && <span className="mut" style={{ fontSize: 13 }}>{shown.length} {shown.length === 1 ? 'event' : 'events'} in {LAUNCH_CITY}</span>}
      </div>
      <Wait error={state.error} loading={state.loading && !state.data} />
      {state.data?.serverDown && <div role="status" className="note">Can’t reach the club server right now, so only the demo’s events are showing.</div>}
      {state.data && shown.length === 0 && <div className="card empty">{events.length === 0 ? <><b>Coming up on RallyQ</b><ul style={{listStyle:'none',padding:0,margin:'10px 0 0',display:'grid',gap:8,textAlign:'left'}}>{UPCOMING_EVENTS.map((u) => <li key={u.date + u.name} className="between" style={{gap:12}}><span><b>{u.name}</b> <span className="mut">· {u.club}, {u.area}</span><br/><span className="mut" style={{fontSize:13}}>{u.detail}</span></span><span className="mut">{u.date}</span></li>)}</ul><span className="mut" style={{display:'block',marginTop:10}}>Entries open when each club publishes its event.</span></> : 'No events match this filter right now.'}</div>}
      {shown.length > 0 && (
        <div className="grid g3">
          {shown.map((e) => {
            const where = [e.venue, e.city].filter(Boolean).join(', ');
            const cta = e.status === 'live' ? { text: 'See live scores', to: linkTo(go, 'live') }
              : e.registrationOpen ? { text: 'Enter', to: linkTo(go, 'event-enter', e.slug) }
                : { text: 'Details', to: linkTo(go, 'event', e.slug) };
            const titleId = `ev-${e.slug}`;
            return (
              <article key={e.slug} className="card" aria-labelledby={titleId} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <div className="between">
                  <span className="row" style={{ gap: 10, minWidth: 0 }}><span className="tile" aria-hidden="true">{clubMark(e.club)}</span><span style={{ minWidth: 0 }}><span className="cap" style={{ display: 'block' }}>Hosted by</span><b style={{ fontSize: 14 }}>{e.club}</b></span></span>
                  <EventStatus e={e} />
                </div>
                <div>
                  <div className="cap">{dayLabel(e.startDate)} · {timeLabel(e.startTime)}</div>
                  <h2 className="disp" style={{ fontSize: 30, marginTop: 6 }}>
                    <button type="button" id={titleId} aria-label={e.name} onClick={() => go('event', e.slug)} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, width: '100%', padding: 0, border: 0, background: 'none', color: 'inherit', font: 'inherit', letterSpacing: 'inherit', lineHeight: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                      <PosterImage src={e.posterUrl} name={e.name} size="thumb" />
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{e.name}</span>
                    </button>
                  </h2>
                  {where && <div className="mut" style={{ fontSize: 14, marginTop: 6 }}>{where}</div>}
                </div>
                {e.divisions.length > 0 && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{e.divisions.map((d) => <span key={d.id} className="chip">{d.name}</span>)}</div>}
                <div className="between" style={{ marginTop: 'auto', paddingTop: 6 }}>
                  <span className="mut" style={{ fontSize: 13 }}>{spotsText(e)}</span>
                  <a className={e === lead ? 'btn sm' : 'btn ghost sm'} style={{ minHeight: 44 }} aria-describedby={titleId} {...cta.to}>{cta.text}</a>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {(state.data?.past.length ?? 0) > 0 && (
        <section aria-labelledby="recent-results-title" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 id="recent-results-title" className="disp" style={{ fontSize: 32 }}>Recent results</h2>
          <div className="card list">
            {state.data!.past.map((e) => (
              <a key={e.slug} aria-label={`${e.name} results`} {...linkTo(go, 'results', e.slug)}>
                <span className="tile" aria-hidden="true">{clubMark(e.club)}</span>
                <span className="grow"><b style={{ display: 'block', overflowWrap: 'anywhere' }}>{e.name}</b><span className="mut" style={{ display: 'block', fontSize: 13 }}>{dayLabel(e.startDate)} · {e.club}</span></span>
                <span className="st ok">Results</span>
              </a>
            ))}
          </div>
        </section>
      )}
      <section className="card" aria-label="For clubs" style={{ padding: 24, display: 'flex', flexWrap: 'wrap', gap: '16px 24px', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <div className="grow" style={{ flex: '1 1 320px' }}>
          <div className="cap acc">For clubs</div>
          <h2 className="disp" style={{ fontSize: 30, marginTop: 6 }}>Give players a reason to choose your court.</h2>
          <div className="mut" style={{ marginTop: 6 }}>List your tournament or run it here: entries, the draw, a referee on every court and live results.</div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: '8px 18px' }}>
          <a className="btn ghost" {...linkTo(go, signedIn ? 'club' : 'club-signin')}>{signedIn ? 'My club' : 'Sign in'}</a>
          <a className="tlink" {...linkTo(go, 'events-post')}>Post a tournament <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </PublicShell>
  );
}

// ---------- One tournament's page ----------

export function EventPage({ slug, go, onBack }: { slug: string; go: Go; onBack: () => void }) {
  const state = useLoad(() => findEvent(slug), [slug]);
  const logo = useLoad(async () => (state.data ? state.data.src.publicClubLogo(slug).catch(() => null) : null), [state.data, slug]);
  const [msg, setMsg] = useState<string | null>(null);
  const e = state.data?.event;
  if (!e) {
    return (
      <main className="screen pq-matchday pq-proto" aria-labelledby="event-title">
        <Header id="event-title" title="Tournament" onBack={onBack} />
        <Status error={state.error} loading={state.loading} />
        {!state.loading && !state.error && <p className="muted">This tournament isn’t available. The organiser may have taken it down. A tournament made in the demo club only opens on the phone that made it.</p>}
      </main>
    );
  }
  const where = [e.venue, e.city].filter(Boolean).join(', ');
  return (
    <main className="screen pq-matchday pq-proto" aria-labelledby="event-title">
      <EventPhotoHeader id="event-title" title={e.name} poster={e.posterUrl} status={e.status === "live" ? "Live" : e.status === "done" ? "Finished" : e.registrationOpen ? "Entries open" : "Entries closed"} date={e.startDate} time={e.startTime} venue={e.venue} onBack={onBack} />
      <PosterImage src={e.posterUrl} name={e.name} size="thumb" />
      {state.data?.src.kind === 'demo' && <DemoNote b={state.data.src} />}

      <OrganiserCard club={e.club} logoUrl={logo.data?.logoUrl} />
      <section className="card section" aria-label="When and where">
        <div style={{ fontWeight: 600 }}>{dayLabel(e.startDate)} · from {timeLabel(e.startTime)}</div>
        {where && <div>{where}</div>}
        <EventBadges e={e} />
        {e.registrationOpen && e.entriesClose && <div className="small">Entries close {dayLabel(e.entriesClose)}</div>}
      </section>
      {e.about && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{e.about}</p>}
      <div className="meta">
        <button type="button" className="btn btn-outline" onClick={async () => setMsg(await shareLink(e.name, eventShareLink(e.slug)))}>Share</button>
        {e.results && <button type="button" className="btn btn-outline" onClick={() => go('results', e.slug)}>{e.status === 'live' ? 'Live results' : 'Results'}</button>}
        {where && <a className="btn btn-outline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`} target="_blank" rel="noreferrer">Directions</a>}
      </div>
      {msg && <div role="status" className="msg msg-ok">{msg}</div>}
      {e.listing === 'listed' && (
        <section className="card section" aria-label="How to enter">
          <h2 style={{ fontSize: 16 }}>How to enter</h2>
          <p className="small muted" style={{ margin: 0 }}>This tournament is listed on RallyQ. Enter with the organiser directly.</p>
          <div className="meta">
            {e.contact && <a className="btn btn-primary" href={waLink(e.contact)} target="_blank" rel="noreferrer">WhatsApp {e.contact}</a>}
            {e.contact && <a className="btn btn-outline" href={telLink(e.contact)}>Call</a>}
            {e.link && <a className="btn btn-outline" href={e.link} target="_blank" rel="noreferrer noopener">Organiser’s page</a>}
          </div>
        </section>
      )}
      <section className="section" aria-label="Events">
        <h2 style={{ fontSize: 18 }}>Events</h2>
        {e.divisions.map((d) => {
          const left = d.rules.cap !== undefined ? Math.max(0, d.rules.cap - d.taken) : undefined;
          return (
            <section key={d.id} className="card section" aria-label={d.name}>
              <div className="row"><b>{d.name}</b>{left !== undefined && e.listing === 'run' && <span className={`pill${left === 0 ? ' pill-warn' : ''}`}>{left === 0 ? 'Full · waitlist' : `${left} of ${d.rules.cap} left`}</span>}</div>
              <div className="small muted">{rulesLine(d.kind, d.rules)}</div>
              {e.registrationOpen && <button type="button" className="btn btn-primary" onClick={() => go('event-enter', `${e.slug}~${d.id}`)}>Enter {d.name}</button>}
            </section>
          );
        })}
      </section>
      {e.listing === 'run' && !e.registrationOpen && !e.drawn && e.entryMode === 'registration' && <p className="small muted" style={{ margin: 0 }}>Entries are closed.</p>}
      <p className="small muted" style={{ margin: 0 }}>Everyone playing must be 18 or over. Entry fees are paid to the organiser, not to RallyQ.</p>
    </main>
  );
}

// ---------- Entering an event ----------

const ME_KEY = 'pq-entry-me';
function savedMe(): EntryPerson { try { return { ...blankPerson(), ...(JSON.parse(localStorage.getItem(ME_KEY) ?? '{}') as Partial<EntryPerson>) }; } catch { return blankPerson(); } }
function saveMe(p: EntryPerson) { try { localStorage.setItem(ME_KEY, JSON.stringify(p)); } catch { /* private mode */ } }

/** One person's details. `v12` draws it with the RallyQ v1.2 parts (inside a shell); without it, the older look (the organiser's "+ Add"). */
export function PersonFields({ p, onChange, label, v12 }: { p: EntryPerson; onChange: (p: EntryPerson) => void; label: string; v12?: boolean }) {
  const set = (patch: Partial<EntryPerson>) => onChange({ ...p, ...patch });
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  // Keep what's typed for the rating, so "3." can become "3.5" (a number field alone would drop the dot).
  const [rating, setRating] = useState(p.dupr !== undefined ? String(p.dupr) : '');
  if (p.dupr !== undefined && Number(rating) !== p.dupr) setRating(String(p.dupr));
  const onRating = (raw: string) => { const v = raw.replace(/[^\d.]/g, ''); setRating(v); set({ dupr: v === '' ? undefined : Number(v) }); };
  if (v12) {
    const key = label.toLowerCase().replace(/\W+/g, '-');
    const mine = label === 'You';
    return (
      <fieldset aria-label={label} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <legend className="cap" style={{ padding: 0, marginBottom: 12 }}>{label}</legend>
        <div className="form two">
          <div className="fld"><label htmlFor={`${key}-name`}>Full name</label><input id={`${key}-name`} className="inp" aria-label={`${label} name`} autoComplete={mine ? 'name' : 'off'} maxLength={60} value={p.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="fld"><label htmlFor={`${key}-phone`}>Phone (WhatsApp)</label><input id={`${key}-phone`} className="inp" aria-label={`${label} phone`} inputMode="tel" autoComplete={mine ? 'tel' : 'off'} maxLength={18} value={p.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
        </div>
        <div className="fld"><label htmlFor={`${key}-email`}>Email for results (optional)</label><input id={`${key}-email`} className="inp" type="email" aria-label={`${label} email`} inputMode="email" autoComplete={mine ? 'email' : 'off'} maxLength={254} value={p.email ?? ''} onChange={(e) => set({ email: e.target.value })} /></div>
        <div className="form two">
          <div className="fld"><label htmlFor={`${key}-dupr`}>DUPR rating</label><input id={`${key}-dupr`} className="inp" aria-label={`${label} DUPR rating`} placeholder="e.g. 3.42" inputMode="decimal" value={rating} onChange={(e) => onRating(e.target.value)} /></div>
          <div className="fld"><label htmlFor={`${key}-duprid`}>DUPR ID</label><input id={`${key}-duprid`} className="inp" aria-label={`${label} DUPR ID`} autoCapitalize="characters" maxLength={20} value={p.duprId ?? ''} onChange={(e) => set({ duprId: e.target.value })} /></div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <div className="fld" style={{ flex: '0 0 96px' }}><label htmlFor={`${key}-age`}>Age</label><input id={`${key}-age`} className="inp" aria-label={`${label} age`} inputMode="numeric" maxLength={3} value={p.age ?? ''} onChange={(e) => set({ age: num(e.target.value.replace(/\D/g, '')) })} /></div>
          <div className="fld" style={{ flex: '1 1 220px' }}><span className="lbl">Gender</span><Pills<PlayerGender | ''> label={`${label} gender`} value={p.gender} options={[{ value: 'm', label: 'Man' }, { value: 'f', label: 'Woman' }, { value: 'x', label: 'Other' }]} onChange={(g) => set({ gender: g })} /></div>
        </div>
      </fieldset>
    );
  }
  return (
    <fieldset className="card section" style={{ border: 0, margin: 0 }} aria-label={label}>
      <legend className="label" style={{ padding: 0 }}>{label}</legend>
      <input className="input" aria-label={`${label} name`} placeholder="Full name" autoComplete={label === 'You' ? 'name' : 'off'} maxLength={60} value={p.name} onChange={(e) => set({ name: e.target.value })} />
      <input className="input" aria-label={`${label} phone`} placeholder="Phone (WhatsApp)" inputMode="tel" autoComplete={label === 'You' ? 'tel' : 'off'} maxLength={18} value={p.phone} onChange={(e) => set({ phone: e.target.value })} />
      <input className="input" type="email" aria-label={`${label} email`} placeholder="Email for results (optional)" inputMode="email" autoComplete={label === 'You' ? 'email' : 'off'} maxLength={254} value={p.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <input className="input" aria-label={`${label} DUPR rating`} placeholder="DUPR rating" inputMode="decimal" value={rating} onChange={(e) => onRating(e.target.value)} />
        <input className="input" aria-label={`${label} DUPR ID`} placeholder="DUPR ID" autoCapitalize="characters" maxLength={20} value={p.duprId ?? ''} onChange={(e) => set({ duprId: e.target.value })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
        <input className="input" aria-label={`${label} age`} placeholder="Age" inputMode="numeric" maxLength={3} value={p.age ?? ''} onChange={(e) => set({ age: num(e.target.value.replace(/\D/g, '')) })} />
        <Segmented<PlayerGender | ''> label={`${label} gender`} value={p.gender} options={[{ value: 'm', label: 'Man' }, { value: 'f', label: 'Woman' }, { value: 'x', label: 'Other' }]} onChange={(g) => set({ gender: g })} />
      </div>
    </fieldset>
  );
}

type PayChoice = 'venue' | 'claimed' | 'unpaid';
const PAY_CHOICES: { value: PayChoice; name: string; sub: string; short: string }[] = [
  { value: 'claimed', name: 'UPI now', sub: 'Pay the club and paste the reference', short: 'UPI now' },
  { value: 'venue', name: 'Pay at the desk', sub: 'Cash or UPI on match day', short: 'At the desk' },
  { value: 'unpaid', name: 'Pay later', sub: 'Agree it with the club before you play', short: 'Later' },
];
const STEP_NAMES = ['Category', 'Partner', 'Pay', 'Sent'];

export function EnterEvent({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const [slug, divId] = id.split('~');
  const state = useLoad(async () => {
    const found = await findEvent(slug);
    const user = found ? await found.src.currentUser() : null;
    return { found, user };
  }, [slug]);
  const [me, setMe] = useState<EntryPerson>(savedMe);
  const [partner, setPartner] = useState<EntryPerson>(blankPerson);
  const [partnerOk, setPartnerOk] = useState(false);
  // Your sign-in email is the natural one for your results; you can change it.
  const accountEmail = cleanEmail(state.data?.user?.email);
  useEffect(() => { if (accountEmail) setMe((m) => (m.email?.trim() ? m : { ...m, email: accountEmail })); }, [accountEmail]);
  const [pay, setPay] = useState<PayChoice>('venue');
  const [ref, setRef] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<RegistrationStatus | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [payStep, setPayStep] = useState(false);
  const found = state.data?.found;
  const e = found?.event;
  const d = e?.divisions.find((x) => x.id === divId);
  const choosing = !!e && !divId && e.registrationOpen;
  const chosen = choosing ? e.divisions.find((x) => x.id === picked) ?? e.divisions[0] : d;
  const doubles = chosen?.kind === 'doubles';
  const stepNames = STEP_NAMES.map((n, i) => (i === 1 && chosen && !doubles ? 'Your details' : n));
  const shell = (body: ReactNode) => <PublicShell go={go} active="events" host={e ? { marks: [clubMark(e.club)], name: e.club } : undefined}>{body}</PublicShell>;
  const back = (text: string, f: () => void) => <button type="button" className="tlink mut" onClick={f}><span aria-hidden="true">←</span> {text}</button>;

  if (!found || !e || (!choosing && !d)) {
    return shell(
      <>
        <PageHead cap={<span className="acc">Enter</span>} title="Enter an event." />
        <Wait error={state.error} loading={state.loading} />
        {!state.loading && !state.error && <div className="card empty">This event isn’t taking entries yet. Check back soon.</div>}
        <div>{back('Back', onBack)}</div>
      </>,
    );
  }
  if (d && !done && !e.registrationOpen) {
    return shell(
      <>
        <PageHead cap={<span className="acc">Enter · {e.name}</span>} title={`Enter ${d.name}`} />
        <div className="card empty">Entries are closed. Questions? Message the organiser.</div>
        <div>{back('Back', onBack)}</div>
      </>,
    );
  }

  const user = state.data?.user;
  const step = choosing ? 1 : done ? 4 : payStep ? 3 : 2;
  const fee = d?.rules.fee ?? 0;
  const players = d?.kind === 'doubles' ? [me, partner] : [me];
  const title = step === 1 ? 'Pick your category.' : step === 2 ? (doubles ? 'Who’s your partner?' : 'Your details.') : step === 3 ? 'Pay the club.' : 'Entry request sent.';
  const payName = PAY_CHOICES.find((c) => c.value === pay)!.short;

  const PARTNER_CONSENT_PROBLEM = 'Tick the box to confirm your partner agrees to share their details.';
  function toPay() {
    const problem = entryProblem(d!.kind, d!.rules, players, true);
    if (problem) return setMsg(problem);
    if (d!.kind === 'doubles' && !partnerOk) return setMsg(PARTNER_CONSENT_PROBLEM);
    setMsg(null); setPayStep(true);
  }
  async function submit() {
    const problem = entryProblem(d!.kind, d!.rules, players, true);
    if (problem) return setMsg(problem);
    if (d!.kind === 'doubles' && !partnerOk) return setMsg(PARTNER_CONSENT_PROBLEM);
    if (fee && pay === 'claimed' && ref.trim().length < 4) return setMsg('Add the UPI reference number from your payment');
    setBusy(true); setMsg(null);
    try {
      const r = await found!.src.registerEntry(d!.id, players, fee ? pay : 'unpaid', fee && pay === 'claimed' ? ref : undefined);
      saveMe(me);
      setDone(r.status);
    } catch (err) { setMsg(errorText(err)); } finally { setBusy(false); }
  }
  // Steps you have finished can be opened again (until the entry is sent); steps ahead open with Continue.
  const openStep = [() => go('event-enter', slug), () => { setMsg(null); setPayStep(false); }];

  return shell(
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <section aria-labelledby="enter-title" style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="pg-h"><span className="cap acc">Enter · {e.name}</span><h1 id="enter-title" className="disp">{title}</h1></div>
        <div className="steps" role="group" aria-label="Steps">
          {stepNames.map((n, i) => {
            const canOpen = i + 1 < step && step < 4 && i < 2;
            return <button key={n} type="button" className={i + 1 === step ? 'on' : i + 1 < step ? 'done' : undefined} aria-current={i + 1 === step ? 'step' : undefined} disabled={!canOpen} style={canOpen ? undefined : { cursor: 'default' }} onClick={canOpen ? openStep[i] : undefined}><i aria-hidden="true">{i + 1 < step ? '✓' : i + 1}</i>{n}</button>;
          })}
        </div>
        {found.src.kind === 'demo' && <DemoLine b={found.src} />}

        {step === 1 && (
          <>
            <div className="grid g2" role="group" aria-label="Event categories" style={{ gap: 12 }}>
              {e.divisions.map((c) => {
                const left = c.rules?.cap !== undefined ? Math.max(0, c.rules.cap - c.taken) : undefined;
                return (
                  <button key={c.id} type="button" className={c.id === chosen?.id ? 'opt on' : 'opt'} aria-pressed={c.id === chosen?.id} onClick={() => setPicked(c.id)}>
                    <span className="dot" aria-hidden="true" />
                    <span className="grow"><b style={{ display: 'block' }}>{c.name}</b><span className="mut" style={{ fontSize: 13 }}>{rulesLine(c.kind, c.rules)}</span></span>
                    {left !== undefined && <span className={left === 0 ? 'st no' : 'st ok'}>{left === 0 ? 'Full · waitlist' : `${left} ${left === 1 ? 'spot' : 'spots'} left`}</span>}
                  </button>
                );
              })}
            </div>
            <div className="between">{back('Back', onBack)}<button type="button" className="btn" disabled={!chosen} onClick={() => chosen && go('event-enter', `${slug}~${chosen.id}`)}>Continue</button></div>
          </>
        )}

        {step === 2 && d && !user && (
          <>
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <b>Sign in to enter. New here? Create an account with your email; we send a 6-digit code to confirm it. It takes a minute, and you come straight back here.</b>
              <span className="mut" style={{ fontSize: 14 }}>Your account lets you see your entry’s status, your matches in Player Studio, and withdraw if you need to.</span>
            </div>
            <div className="between">
              {back('Back', onBack)}
              {found.src.kind === 'server'
                ? <button type="button" className="btn" onClick={() => { rememberReturn(`#/event-enter/${encodeURIComponent(id)}`); go('club-signin'); }}>Sign in to enter</button>
                : <button type="button" className="btn" onClick={() => go('club')}>Open the demo club first</button>}
            </div>
          </>
        )}

        {step === 2 && d && user && (
          <>
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <PersonFields v12 label="You" p={me} onChange={setMe} />
              {d.kind === 'doubles' && <PersonFields v12 label="Partner" p={partner} onChange={setPartner} />}
              {d.kind === 'doubles' && (
                <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minHeight: 44, cursor: 'pointer' }}>
                  <input type="checkbox" checked={partnerOk} onChange={(e) => setPartnerOk(e.target.checked)} style={{ width: 24, height: 24, marginTop: 2, flex: 'none' }} />
                  <span style={{ fontSize: 14 }}>My partner agrees to share their name, phone and DUPR with the organiser, and to have their name, score and DUPR shown on live scores.</span>
                </label>
              )}
              {d.rules.maxDupr !== undefined && <div className="note">{d.kind === 'doubles' && d.rules.duprCap === 'average' ? `This event is for teams with an average DUPR of ${capText(d.rules.maxDupr)} and under, so both players need a rating.` : `This event is for DUPR ${capText(d.rules.maxDupr)} and under, so every player needs a rating.`}</div>}
              <span className="mut" style={{ fontSize: 13 }}>Only this tournament’s organiser sees your phone numbers, emails and ages. Your names, scores and DUPR ratings show on live scores. Everyone must be 18 or over.</span>
            </div>
            {msg && <div role="alert" className="note"><b>Check this first.</b> {msg}</div>}
            <div className="between">{back('Back', onBack)}<button type="button" className="btn" onClick={toPay}>Continue</button></div>
          </>
        )}

        {step === 3 && d && (
          <>
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="between">
                <span><b>{fee > 0 ? 'Entry fee' : 'No entry fee'}</b><span className="mut" style={{ display: 'block', fontSize: 13 }}>{fee > 0 ? `Paid to ${e.club} directly. RallyQ never holds money.` : 'There is nothing to pay for this category. RallyQ never holds money.'}</span></span>
                {fee > 0 && <span className="n acc" style={{ fontSize: 34 }}>₹{fee}</span>}
              </div>
              {fee > 0 && (
                <div className="grid g2" role="group" aria-label="How you’ll pay" style={{ gap: 12 }}>
                  {PAY_CHOICES.map((c) => (
                    <button key={c.value} type="button" className={c.value === pay ? 'opt on' : 'opt'} aria-pressed={c.value === pay} onClick={() => setPay(c.value)}>
                      <span className="dot" aria-hidden="true" /><span><b style={{ display: 'block' }}>{c.name}</b><span className="mut" style={{ fontSize: 13 }}>{c.sub}</span></span>
                    </button>
                  ))}
                </div>
              )}
              {fee > 0 && pay === 'claimed' && (
                <>
                  {e.upiId && <a className="btn ghost" style={{ alignSelf: 'flex-start', height: 'auto', paddingBlock: 10, textAlign: 'center' }} href={upiLink(e.upiId, e.club, fee, `${e.name}: ${d.name}`)}>Pay ₹{fee} by UPI to {e.upiId}</a>}
                  <div className="fld">
                    <label htmlFor="utr">UPI reference number</label>
                    <input id="utr" className="inp" inputMode="numeric" maxLength={60} placeholder="e.g. 431298765012" value={ref} onChange={(x) => setRef(x.target.value)} />
                    <span className="hint">{e.upiId ? `Pay ${e.upiId}, then paste the reference so the club can match it.` : 'Pay the club, then paste the reference so they can match it.'} They check it and mark your entry paid.</span>
                  </div>
                </>
              )}
            </div>
            {msg && <div role="alert" className="note"><b>Check this first.</b> {msg}</div>}
            <div className="between">{back('Back', openStep[1])}<button type="button" className="btn" disabled={busy} onClick={submit}>Send my entry</button></div>
          </>
        )}

        {step === 4 && d && done && (
          <>
            <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className={done === 'waitlist' ? 'st off' : 'st ok'} style={{ alignSelf: 'flex-start' }}>{done === 'waitlist' ? 'On the waitlist' : 'Entry sent'}</span>
              <h2 className="disp" style={{ fontSize: 34 }}>{done === 'waitlist' ? 'You’re on the waitlist.' : 'Waiting for the organiser.'}</h2>
              <div role="status" className="mut">{done === 'waitlist' ? `${d.name} is full, so you’re on the waitlist. The organiser will tell you if a place opens.` : `Your request for ${d.name} has been sent to the organiser. They accept it and check your payment.`}</div>
              <div className="mut" style={{ fontSize: 13 }}>Status: {REG_STATUS_LABEL[done]}. Check it in My entries.</div>
            </div>
            <div className="between">{back('Back to the event', () => go('event', slug))}<button type="button" className="btn" onClick={() => go('my-entries')}>See my entries</button></div>
          </>
        )}
      </section>

      <aside className="card" aria-label="Your entry" style={{ flex: '1 1 300px', minWidth: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row"><span className="tile lg" aria-hidden="true">{clubMark(e.club)}</span><span style={{ minWidth: 0 }}><span className="cap" style={{ display: 'block' }}>Hosted by</span><b>{e.club}</b></span></div>
        <div><div className="cap">{dayLabel(e.startDate)} · {timeLabel(e.startTime)}</div><div className="disp" style={{ fontSize: 28, marginTop: 4 }}>{e.name}</div></div>
        <div className="list" style={{ marginInline: -20 }}>
          <div><span className="grow mut">Category</span><b style={{ textAlign: 'right' }}>{chosen?.name ?? 'Not picked yet'}</b></div>
          {doubles && <div><span className="grow mut">Partner</span><b style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{partner.name.trim() || 'Not added yet'}</b></div>}
          <div><span className="grow mut">Pay</span><b style={{ textAlign: 'right' }}>{(chosen?.rules?.fee ?? 0) > 0 ? `₹${chosen!.rules.fee}${chosen!.kind === 'doubles' ? ' a team' : ''} · ${step >= 3 ? payName : 'choose how at Pay'}` : 'No entry fee'}</b></div>
        </div>
        {e.entriesClose && <div className="mut" style={{ fontSize: 12 }}>Entries close {dayLabel(e.entriesClose)}.</div>}
      </aside>
    </div>,
  );
}

// ---------- My entries ----------

export function MyEntries({ go, onBack }: { go: Go; onBack: () => void }) {
  const b = eventsBackend();
  const state = useLoad(async () => {
    const user = await b.currentUser();
    return user ? { user, entries: await b.myEntries() } : null;
  }, [b]);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  async function withdraw(x: MyEntry) {
    try { await b.withdrawMyEntry(x.id); setMsg(`Withdrawn from ${x.division}`); setConfirm(null); state.reload(); } catch (e) { setMsg(errorText(e)); }
  }
  const signedOut = !state.loading && !state.data && !state.error;
  const entries = state.data?.entries ?? [];
  return (
    <PublicShell go={go} active="events">
      <PageHead cap={state.data ? <span className="acc">{state.data.user.email}</span> : undefined} title="My entries" />
      <DemoLine b={b.kind === 'demo' ? b : null} />
      <Wait error={state.error} loading={state.loading && !state.data} />
      {signedOut && (
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
          <span className="mut">Sign in to see the tournaments you’ve entered.</span>
          {b.kind === 'server' && <button type="button" className="btn" onClick={() => { rememberReturn('#/my-entries'); go('club-signin'); }}>Sign in</button>}
        </div>
      )}
      {msg && <div role="status" className="note">{msg}</div>}
      {state.data && entries.length === 0 && (
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
          <span className="mut">No entries yet. Find a tournament in Events.</span>
          <a className="btn" {...linkTo(go, 'events')}>See events</a>
        </div>
      )}
      {entries.length > 0 && (
        <div className="card list">
          {entries.map((x) => {
            const active = x.status === 'pending' || x.status === 'accepted' || x.status === 'waitlist';
            const st = entryStatus(x);
            const where = [x.venue, x.city].filter(Boolean).join(', ');
            const payUpi = active && x.fee && x.payment !== 'paid' && x.upiId;
            return (
              <div key={x.id} role="region" aria-label={`${x.tournament}: ${x.division}`} style={{ flexWrap: 'wrap', opacity: active ? undefined : 0.75 }}>
                <a className="row grow" style={{ gap: 14, minHeight: 44, color: 'inherit', textDecoration: 'none' }} {...linkTo(go, 'event', x.slug)}>
                  <span className="tile" aria-hidden="true">{clubMark(x.club)}</span>
                  <span className="grow">
                    <b style={{ display: 'block', overflowWrap: 'anywhere' }}>{x.tournament} · {x.division}</b>
                    <span className="mut" style={{ display: 'block', fontSize: 13 }}>{[dayLabel(x.startDate), where].filter(Boolean).join(' · ')}</span>
                  </span>
                </a>
                <span className={`${st.cls} wrapok`}>{st.text}</span>
                <div style={{ flex: '1 1 100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <span>{x.players.map((p) => (p.dupr !== undefined ? `${p.name} (DUPR ${p.dupr})` : p.name)).join(' / ')}</span>
                  {x.fee ? <span className="mut">Entry fee ₹{x.fee}: <span>{PAYMENT_LABEL[x.payment]}</span></span> : null}
                  {x.note && <span>Organiser: {x.note}</span>}
                  {(payUpi || x.results || (active && !x.drawn)) && (
                    <div className="row" style={{ flexWrap: 'wrap', gap: '8px 16px' }}>
                      {payUpi ? <a className="btn ghost sm" style={{ minHeight: 44 }} href={upiLink(x.upiId!, x.club, x.fee!, `${x.tournament}: ${x.division}`)}>Pay ₹{x.fee} by UPI</a> : null}
                      {x.results && <button type="button" className="btn ghost sm" style={{ minHeight: 44 }} onClick={() => go('results', x.slug)}>Results</button>}
                      {active && !x.drawn && (confirm === x.id
                        ? <><button type="button" className="btn alt sm" style={{ minHeight: 44 }} onClick={() => withdraw(x)}>Yes, withdraw</button><button type="button" className="btn ghost sm" style={{ minHeight: 44 }} onClick={() => setConfirm(null)}>Keep my entry</button></>
                        : <button type="button" className="tlink mut" onClick={() => setConfirm(x.id)}>Withdraw…</button>)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {entries.some((x) => x.status === 'pending' && x.fee && x.payment !== 'paid') && <div className="note">Waiting for payment? Show your UPI reference at the desk and they’ll confirm you on the spot.</div>}
      <div><button type="button" className="tlink mut" onClick={onBack}><span aria-hidden="true">←</span> Back</button></div>
    </PublicShell>
  );
}

// ---------- Posting: pick the club ----------

export function PostEvent({ go, onBack }: { go: Go; onBack: () => void }) {
  const b = eventsBackend();
  const state = useLoad(async () => {
    const user = await b.currentUser();
    return user ? (await b.myClubs()).filter((c) => isAdmin(c.role)) : null;
  }, [b]);
  const clubs = state.data;
  return (
    <PublicShell go={go} active="clubs">
      <PageHead cap="For clubs" title={<span id="post-title">Post a tournament</span>} actions={<button type="button" className="btn ghost sm" onClick={onBack}>Back</button>} />
      <section className="card" aria-labelledby="post-title" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li><b>List it</b> (free): it shows on the board, and players contact you to enter.</li>
        <li><b>Run it on RallyQ</b>: players enter in the app, you accept entries and make the draw, then score every court live. Your first event is free.</li>
      </ul>
      <p className="mut" style={{ margin: 0, fontSize: 14 }}>Your first listing is checked by RallyQ before it appears. After that, your club’s listings go up straight away.</p>
      <Status error={state.error} loading={state.loading && clubs === null} />
      {!state.loading && clubs === null && (
        b.kind === 'server'
          ? <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => { rememberReturn('#/events-post'); go('club-signin'); }}>Sign in to post</button>
          : <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('club')}>Open the demo club first</button>
      )}
      {clubs && clubs.length === 0 && (
        <>
          <p className="mut" style={{ margin: 0 }}>Tournaments are posted by a club. Create yours first; you’ll be its owner.</p>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('club-new')}>Create a club</button>
        </>
      )}
      {clubs && clubs.length > 0 && (
        <section aria-label="Post as" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="cap">Post as</span>
          {clubs.map(({ club }) => (
            <button key={club.id} type="button" className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: '12px 18px', border: 0, color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer', background: 'var(--c2)' }} onClick={() => go(canHost(club) ? 'club-tournament-new' : 'club-view', club.id)}>
              <span style={{ flex: 1 }}><b>{club.name}</b>{club.city ? <span className="mut" style={{ fontSize: 13 }}> · {club.city}</span> : null}
                {!canHost(club) && <span className="mut" style={{ display: 'block', fontSize: 13 }}>{club.hosting === 'rejected' ? 'Not approved by RallyQ yet: open the club to see why' : 'Waiting for RallyQ to approve this club'}</span>}</span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      )}
      </section>
    </PublicShell>
  );
}

// ---------- RallyQ admins: the approval queue ----------

/** The listings section of the admin dashboard (Admin.tsx checks the person is an admin). */
export function ListingReviews({ go }: { go: Go }) {
  const b = eventsBackend();
  const state = useLoad(async () => ({ queue: await b.listingQueue() }), [b]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setRejecting(null); state.reload(); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  }
  const pending = state.data?.queue.filter((q) => q.listingStatus === 'pending') ?? [];
  const decided = state.data?.queue.filter((q) => q.listingStatus !== 'pending') ?? [];
  const card = (q: ListingReview) => (
    <section key={q.id} className="card section" aria-label={q.name}>
      <div className="row"><b>{q.name}</b><span className={`pill${q.listingStatus === 'approved' ? ' pill-ok' : q.listingStatus === 'rejected' ? ' pill-warn' : ''}`}>{q.listingStatus === 'pending' ? 'To review' : q.listingStatus === 'approved' ? 'Approved' : 'Rejected'}</span></div>
      {q.posterUrl ? <PosterImage src={q.posterUrl} name={q.name} /> : <div className="small muted">No poster</div>}
      <div className="small">{dayLabel(q.startDate)} · {timeLabel(q.startTime)} · {[q.venue, q.city].filter(Boolean).join(', ')}</div>
      <div className="small muted">{q.club}{q.verified ? ' (verified)' : ' (new organiser)'}{q.postedBy ? ` · posted by ${q.postedBy}` : ''} · {q.listing === 'run' ? 'Run on RallyQ' : 'Listed only'}</div>
      {q.divisions.map((d) => <div key={d.name} className="small">• {d.name}: {rulesLine(d.kind, d.rules)}</div>)}
      {q.about && <p className="small" style={{ margin: 0, whiteSpace: 'pre-line' }}>{q.about}</p>}
      {(q.contact || q.link) && <div className="small">Contact: {[q.contact, q.link].filter(Boolean).join(' · ')}</div>}
      {q.rejectReason && <div className="small">Reason given: {q.rejectReason}</div>}
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('event', q.slug)}>See the event page</button>
      {q.listingStatus === 'pending' && (rejecting === q.id
        ? (
          <>
            <textarea className="input" aria-label={`Reason for rejecting ${q.name}`} placeholder="Tell the organiser what to fix" maxLength={300} value={reasons[q.id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [q.id]: e.target.value }))} />
            <div className="meta">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => b.reviewListing(q.id, false, reasons[q.id]), `${q.name} rejected`)}>Reject with this reason</button>
              <button type="button" className="btn btn-outline" onClick={() => setRejecting(null)}>Cancel</button>
            </div>
          </>
        )
        : (
          <div className="meta">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => b.reviewListing(q.id, true), `${q.name} is on the board. ${q.club} is now verified.`)}>Approve</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setRejecting(q.id)}>Reject…</button>
          </div>
        ))}
    </section>
  );
  return (
    <>
      <Status error={state.error} loading={state.loading && !state.data} />
      {msg && <div role="status" className={`msg ${msg.ok ? 'msg-ok' : 'msg-bad'}`}>{msg.text}</div>}
      {state.data && (
        <>
          <p className="small muted" style={{ margin: 0 }}>Approving an organiser’s first listing verifies their club, so its later listings go on the board straight away. Check the poster too: it’s shown on the board.</p>
          <h3 style={{ fontSize: 17, margin: 0 }}>To review ({pending.length})</h3>
          {pending.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing waiting.</p>}
          {pending.map(card)}
          {decided.length > 0 && <h3 style={{ fontSize: 17, margin: 0 }}>Decided in the last 30 days</h3>}
          {decided.map(card)}
        </>
      )}
    </>
  );
}
