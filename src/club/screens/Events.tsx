import { useMemo, useState } from 'react';
import { Field, Segmented } from '../../components/Controls';
import type { Go } from '../../navigation';
import type { ClubBackend, ListingReview, MyEntry, PublicEvent } from '../backend';
import { clubMode } from '../config';
import { demoBackend, eventsBackend, publicSourcesFor, rememberReturn, serverBackend } from '../index';
import { blankPerson, capText, entryProblem, rulesLine, upiLink } from '../registration';
import { canHost, isAdmin, PAYMENT_LABEL, REG_STATUS_LABEL, type EntryPerson, type PlayerGender, type RegistrationStatus } from '../types';
import { DemoNote, errorText, Header, shareLink, Status, useLoad } from './common';
import { OrganiserCard, PosterImage } from './Poster';
import { friendlyDate, friendlyTime } from '../dates';

// ---------- Helpers ----------

const dayLabel = (iso: string) => friendlyDate(iso);
const timeLabel = (hhmm: string) => friendlyTime(hhmm);
/** Link to an event that previews nicely in WhatsApp (a small page with the event's title), then opens the app. */
export function eventShareLink(slug: string): string {
  return `${window.location.origin}${window.location.pathname}e/${encodeURIComponent(slug)}/`;
}
const telLink = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
const waLink = (phone: string) => { const d = phone.replace(/\D/g, ''); return `https://wa.me/${d.length === 10 ? `91${d}` : d}`; };

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

export function EventsBoard({ go, robot }: { go: Go; robot?: boolean }) {
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
    const [real, demo, pastReal, pastDemo, admin] = await Promise.all([
      server ? fromServer(() => server.publicEvents(robot)) : Promise.resolve([]),
      demoOn ? demoBackend().publicEvents() : Promise.resolve([]),
      server ? fromServer(() => server.recentResults(robot)) : Promise.resolve([]),
      demoOn ? demoBackend().recentResults() : Promise.resolve([]),
      b.isPlatformAdmin().catch(() => false),
    ]);
    const seen = new Set(real.map((e) => e.slug));
    const events = [...real, ...demo.filter((e) => !seen.has(e.slug))].sort((x, y) => x.startDate.localeCompare(y.startDate) || x.startTime.localeCompare(y.startTime));
    const pastSeen = new Set(pastReal.map((e) => e.slug));
    const past = [...pastReal, ...pastDemo.filter((e) => !pastSeen.has(e.slug))].sort((x, y) => y.startDate.localeCompare(x.startDate));
    const [queue, clubs] = admin ? await Promise.all([b.listingQueue().catch(() => []), b.adminClubs().catch(() => [])]) : [[], []];
    const clubsWaiting = clubs.filter((c) => c.hosting === 'pending' && !c.isTest).length;
    return { events, past, pending: queue.filter((q) => q.listingStatus === 'pending').length, clubsWaiting, admin, serverDown };
  }, [b, robot]);
  const [city, setCity] = useState('all');
  const [kind, setKind] = useState<'all' | 'open'>('all');
  const events = state.data?.events ?? [];
  const cities = useMemo(() => [...new Set(events.map((e) => e.city).filter(Boolean) as string[])].sort(), [events]);
  const shown = events.filter((e) => (city === 'all' || e.city === city) && (kind === 'all' || e.registrationOpen));
  const byDay = new Map<string, PublicEvent[]>();
  for (const e of shown) byDay.set(e.startDate, [...(byDay.get(e.startDate) ?? []), e]);

  return (
    <main className="screen" aria-labelledby="events-title">
      <Header id="events-title" title="Events" right={<button type="button" className="btn btn-outline" style={{ padding: '8px 12px' }} onClick={() => go('my-entries')}>My entries</button>} />
      {b.kind === 'demo' && clubMode() === 'demo' && <DemoNote b={b} />}
      <p className="small muted" style={{ margin: 0 }}>Pickleball tournaments coming up. Enter in the app when the organiser runs it on PaddleQ, or contact them for listed events.</p>
      {state.data?.admin && (
        <button type="button" className="banner-btn" onClick={() => go('admin', state.data?.clubsWaiting ? 'clubs' : state.data?.pending ? 'listings' : 'overview')}>
          <span>{[state.data.clubsWaiting && `${state.data.clubsWaiting} club${state.data.clubsWaiting === 1 ? '' : 's'} to approve`, state.data.pending && `${state.data.pending} listing${state.data.pending === 1 ? '' : 's'} to review`].filter(Boolean).join(' · ') || 'PaddleQ admin'}</span><span>›</span>
        </button>
      )}
      {cities.length > 1 && <Segmented label="City" value={city} options={[{ value: 'all', label: 'All cities' }, ...cities.map((c) => ({ value: c, label: c }))]} onChange={setCity} />}
      <Segmented label="Show" value={kind} options={[{ value: 'all', label: 'All events' }, { value: 'open', label: 'Entries open' }]} onChange={setKind} />
      <Status error={state.error} loading={state.loading && !state.data} />
      {state.data?.serverDown && <div role="status" className="msg msg-bad small">Can’t reach the club server right now, so only the demo’s events are showing.</div>}
      {state.data && shown.length === 0 && <p className="muted">No upcoming events{city !== 'all' ? ` in ${city}` : ''} yet.</p>}
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day} className="section" aria-label={dayLabel(day)}>
          <div className="label">{dayLabel(day)}</div>
          {list.map((e) => (
            <button key={e.slug} type="button" className="match-row" aria-label={e.name} onClick={() => go('event', e.slug)} style={{ alignItems: 'flex-start', gap: 12 }}>
              <PosterImage src={e.posterUrl} name={e.name} size="thumb" />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>{e.name}</span>
                <span className="small muted">{timeLabel(e.startTime)} · {[e.venue, e.city].filter(Boolean).join(', ')} · {e.club}</span>
                <span className="small">{e.divisions.map((d) => d.name).join(' · ')}</span>
                <EventBadges e={e} />
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      ))}
      {(state.data?.past.length ?? 0) > 0 && (
        <section className="section" aria-label="Recent results">
          <div className="label">Recent results</div>
          {state.data!.past.map((e) => (
            <button key={e.slug} type="button" className="match-row" aria-label={`${e.name} results`} onClick={() => go('results', e.slug)} style={{ alignItems: 'flex-start', gap: 12 }}>
              <PosterImage src={e.posterUrl} name={e.name} size="thumb" />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>{e.name}</span>
                <span className="small muted">{dayLabel(e.startDate)} · {e.club}</span>
                <span className="pill" style={{ alignSelf: 'flex-start' }}>Finished · see results</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      )}
      <section className="card section" aria-label="Organisers">
        <h2 style={{ fontSize: 16 }}>Running a tournament?</h2>
        <p className="small muted" style={{ margin: 0 }}>Put it on the board for free, or run it on PaddleQ: entries, draw, a referee on every court and live results.</p>
        <button type="button" className="btn btn-outline" onClick={() => go('events-post')}>Post a tournament</button>
      </section>
    </main>
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
      <main className="screen" aria-labelledby="event-title">
        <Header id="event-title" title="Tournament" onBack={onBack} />
        <Status error={state.error} loading={state.loading} />
        {!state.loading && !state.error && <p className="muted">This tournament isn’t available. The organiser may have taken it down. A tournament made in the demo club only opens on the phone that made it.</p>}
      </main>
    );
  }
  const where = [e.venue, e.city].filter(Boolean).join(', ');
  return (
    <main className="screen" aria-labelledby="event-title">
      <Header id="event-title" title={e.name} onBack={onBack} />
      {state.data?.src.kind === 'demo' && <DemoNote b={state.data.src} />}
      <PosterImage src={e.posterUrl} name={e.name} />
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
          <p className="small muted" style={{ margin: 0 }}>This tournament is listed on PaddleQ. Enter with the organiser directly.</p>
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
      <p className="small muted" style={{ margin: 0 }}>Everyone playing must be 18 or over. Entry fees are paid to the organiser, not to PaddleQ.</p>
    </main>
  );
}

// ---------- Entering an event ----------

const ME_KEY = 'pq-entry-me';
function savedMe(): EntryPerson { try { return { ...blankPerson(), ...(JSON.parse(localStorage.getItem(ME_KEY) ?? '{}') as Partial<EntryPerson>) }; } catch { return blankPerson(); } }
function saveMe(p: EntryPerson) { try { localStorage.setItem(ME_KEY, JSON.stringify(p)); } catch { /* private mode */ } }

export function PersonFields({ p, onChange, label }: { p: EntryPerson; onChange: (p: EntryPerson) => void; label: string }) {
  const set = (patch: Partial<EntryPerson>) => onChange({ ...p, ...patch });
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  // Keep what's typed for the rating, so "3." can become "3.5" (a number field alone would drop the dot).
  const [rating, setRating] = useState(p.dupr !== undefined ? String(p.dupr) : '');
  if (p.dupr !== undefined && Number(rating) !== p.dupr) setRating(String(p.dupr));
  return (
    <fieldset className="card section" style={{ border: 0, margin: 0 }} aria-label={label}>
      <legend className="label" style={{ padding: 0 }}>{label}</legend>
      <input className="input" aria-label={`${label} name`} placeholder="Full name" autoComplete={label === 'You' ? 'name' : 'off'} maxLength={60} value={p.name} onChange={(e) => set({ name: e.target.value })} />
      <input className="input" aria-label={`${label} phone`} placeholder="Phone (WhatsApp)" inputMode="tel" autoComplete={label === 'You' ? 'tel' : 'off'} maxLength={18} value={p.phone} onChange={(e) => set({ phone: e.target.value })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <input className="input" aria-label={`${label} DUPR rating`} placeholder="DUPR rating" inputMode="decimal" value={rating} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); setRating(v); set({ dupr: v === '' ? undefined : Number(v) }); }} />
        <input className="input" aria-label={`${label} DUPR ID`} placeholder="DUPR ID" autoCapitalize="characters" maxLength={20} value={p.duprId ?? ''} onChange={(e) => set({ duprId: e.target.value })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr)', gap: 8, alignItems: 'center' }}>
        <input className="input" aria-label={`${label} age`} placeholder="Age" inputMode="numeric" maxLength={3} value={p.age ?? ''} onChange={(e) => set({ age: num(e.target.value.replace(/\D/g, '')) })} />
        <Segmented<PlayerGender | ''> label={`${label} gender`} value={p.gender} options={[{ value: 'm', label: 'Man' }, { value: 'f', label: 'Woman' }, { value: 'x', label: 'Other' }]} onChange={(g) => set({ gender: g })} />
      </div>
    </fieldset>
  );
}

export function EnterEvent({ id, go, onBack }: { id: string; go: Go; onBack: () => void }) {
  const [slug, divId] = id.split('~');
  const state = useLoad(async () => {
    const found = await findEvent(slug);
    const user = found ? await found.src.currentUser() : null;
    return { found, user };
  }, [slug]);
  const [me, setMe] = useState<EntryPerson>(savedMe);
  const [partner, setPartner] = useState<EntryPerson>(blankPerson);
  const [pay, setPay] = useState<'venue' | 'claimed' | 'unpaid'>('venue');
  const [ref, setRef] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<RegistrationStatus | null>(null);
  const found = state.data?.found;
  const e = found?.event;
  const d = e?.divisions.find((x) => x.id === divId);
  if (!found || !e || !d) {
    return (
      <main className="screen" aria-labelledby="enter-title">
        <Header id="enter-title" title="Enter" onBack={onBack} />
        <Status error={state.error} loading={state.loading} />
        {!state.loading && !state.error && <p className="muted">This event isn’t taking entries.</p>}
      </main>
    );
  }
  const fee = d.rules.fee ?? 0;
  const players = d.kind === 'doubles' ? [me, partner] : [me];

  if (done) {
    return (
      <main className="screen" aria-labelledby="enter-title">
        <Header id="enter-title" title="Entry sent" onBack={() => go('event', slug)} />
        <div role="status" className="msg msg-ok">{done === 'waitlist' ? `${d.name} is full, so you’re on the waitlist. The organiser will tell you if a place opens.` : `You’re entered in ${d.name}. The organiser will confirm your entry.`}</div>
        <p className="small muted" style={{ margin: 0 }}>Status: {REG_STATUS_LABEL[done]}. Follow it in My entries.</p>
        <button type="button" className="btn btn-primary" onClick={() => go('my-entries')}>My entries</button>
      </main>
    );
  }
  if (!e.registrationOpen) {
    return (
      <main className="screen" aria-labelledby="enter-title">
        <Header id="enter-title" title={`Enter ${d.name}`} onBack={onBack} />
        <p className="muted">Entries for this tournament are closed.</p>
      </main>
    );
  }
  if (!state.data?.user) {
    return (
      <main className="screen" aria-labelledby="enter-title">
        <Header id="enter-title" title={`Enter ${d.name}`} onBack={onBack} />
        <section className="card section">
          <p style={{ margin: 0 }}>Sign in with your email to enter. It takes a minute, and you come straight back here.</p>
          <p className="small muted" style={{ margin: 0 }}>Signing in lets you see your entry’s status and withdraw if you need to. Your personal PaddleQ stays on your phone.</p>
        </section>
        {found.src.kind === 'server'
          ? <button type="button" className="btn btn-primary" onClick={() => { rememberReturn(`#/event-enter/${encodeURIComponent(id)}`); go('club-signin'); }}>Sign in to enter</button>
          : <button type="button" className="btn btn-primary" onClick={() => go('club')}>Open the demo club first</button>}
      </main>
    );
  }

  async function submit() {
    const problem = entryProblem(d!.kind, d!.rules, players, true);
    if (problem) return setMsg(problem);
    if (fee && pay === 'claimed' && ref.trim().length < 4) return setMsg('Add the UPI reference number from your payment');
    setBusy(true); setMsg(null);
    try {
      const r = await found!.src.registerEntry(d!.id, players, fee ? pay : 'unpaid', fee && pay === 'claimed' ? ref : undefined);
      saveMe(me);
      setDone(r.status);
    } catch (err) { setMsg(errorText(err)); } finally { setBusy(false); }
  }

  return (
    <main className="screen" aria-labelledby="enter-title">
      <Header id="enter-title" title={`Enter ${d.name}`} onBack={onBack} />
      <p className="small muted" style={{ margin: 0 }}>{e.name} · {dayLabel(e.startDate)} · {rulesLine(d.kind, d.rules)}</p>
      <PersonFields label="You" p={me} onChange={setMe} />
      {d.kind === 'doubles' && <PersonFields label="Partner" p={partner} onChange={setPartner} />}
      {d.rules.maxDupr !== undefined && <p className="small muted" style={{ margin: 0 }}>{d.kind === 'doubles' && d.rules.duprCap === 'average' ? `This event is for teams with an average DUPR of ${capText(d.rules.maxDupr)} and under, so both players need a rating.` : `This event is for DUPR ${capText(d.rules.maxDupr)} and under, so every player needs a rating.`}</p>}
      {fee > 0 && (
        <section className="card section" aria-label="Entry fee">
          <div className="row"><b>Entry fee</b><b>₹{fee}</b></div>
          <Segmented label="How you’ll pay" value={pay} options={[{ value: 'venue', label: 'At the venue' }, { value: 'claimed', label: 'Paid by UPI' }, { value: 'unpaid', label: 'Later' }]} onChange={setPay} />
          {pay === 'claimed' && (
            <>
              {e.upiId && <a className="btn btn-outline" href={upiLink(e.upiId, e.club, fee, `${e.name}: ${d.name}`)}>Pay ₹{fee} by UPI to {e.upiId}</a>}
              <Field label="UPI reference number"><input className="input" aria-label="UPI reference number" inputMode="numeric" maxLength={60} value={ref} onChange={(x) => setRef(x.target.value)} /></Field>
              <p className="small muted" style={{ margin: 0 }}>You pay the organiser directly. They check the reference and mark your entry paid.</p>
            </>
          )}
        </section>
      )}
      <p className="small muted" style={{ margin: 0 }}>Your names, phone numbers, ages and DUPR details go to the organiser for this tournament only. Everyone must be 18 or over.</p>
      {msg && <div role="alert" className="msg msg-bad">{msg}</div>}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>Send my entry</button>
    </main>
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
  return (
    <main className="screen" aria-labelledby="mine-title">
      <Header id="mine-title" title="My entries" onBack={onBack} />
      <DemoNote b={b.kind === 'demo' ? b : null} />
      <Status error={state.error} loading={state.loading && !state.data} />
      {!state.loading && !state.data && !state.error && (
        <>
          <p className="muted">Sign in to see the tournaments you’ve entered.</p>
          {b.kind === 'server' && <button type="button" className="btn btn-primary" onClick={() => { rememberReturn('#/my-entries'); go('club-signin'); }}>Sign in</button>}
        </>
      )}
      {msg && <div role="status" className="msg msg-ok">{msg}</div>}
      {state.data && state.data.entries.length === 0 && <p className="muted">No entries yet. Find a tournament in Events.</p>}
      {state.data?.entries.map((x) => {
        const active = x.status === 'pending' || x.status === 'accepted' || x.status === 'waitlist';
        return (
          <section key={x.id} className="card section" aria-label={`${x.tournament}: ${x.division}`} style={active ? undefined : { opacity: 0.7 }}>
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', fontWeight: 600 }} onClick={() => go('event', x.slug)}>{x.tournament}</button>
            <div className="small muted">{x.division} · {dayLabel(x.startDate)} · {[x.venue, x.city].filter(Boolean).join(', ')}</div>
            <div className="small">{x.players.map((p) => p.name).join(' / ')}</div>
            <div className="meta" style={{ gap: 6 }}>
              <span className={`pill${x.status === 'accepted' ? ' pill-ok' : x.status === 'rejected' ? ' pill-warn' : ''}`}>{REG_STATUS_LABEL[x.status]}</span>
              {x.fee ? <span className={`pill${x.payment === 'paid' ? ' pill-ok' : ''}`}>{PAYMENT_LABEL[x.payment]}</span> : null}
            </div>
            {x.note && <p className="small" style={{ margin: 0 }}>Organiser: {x.note}</p>}
            {active && x.fee && x.payment !== 'paid' && x.upiId ? <a className="btn btn-outline" href={upiLink(x.upiId, x.club, x.fee, `${x.tournament}: ${x.division}`)}>Pay ₹{x.fee} by UPI</a> : null}
            {x.results && <button type="button" className="btn btn-outline" onClick={() => go('results', x.slug)}>Results</button>}
            {active && !x.drawn && (confirm === x.id
              ? <div className="meta"><button type="button" className="btn btn-primary" onClick={() => withdraw(x)}>Yes, withdraw</button><button type="button" className="btn btn-outline" onClick={() => setConfirm(null)}>Keep my entry</button></div>
              : <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(x.id)}>Withdraw…</button>)}
          </section>
        );
      })}
    </main>
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
    <main className="screen" aria-labelledby="post-title">
      <Header id="post-title" title="Post a tournament" onBack={onBack} />
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        <li><b>List it</b> (free): it shows on the board, and players contact you to enter.</li>
        <li><b>Run it on PaddleQ</b>: players enter in the app, you accept entries and make the draw, then score every court live. Your first event is free.</li>
      </ul>
      <p className="small muted" style={{ margin: 0 }}>Your first listing is checked by PaddleQ before it appears. After that, your club’s listings go up straight away.</p>
      <Status error={state.error} loading={state.loading && clubs === null} />
      {!state.loading && clubs === null && (
        b.kind === 'server'
          ? <button type="button" className="btn btn-primary" onClick={() => { rememberReturn('#/events-post'); go('club-signin'); }}>Sign in to post</button>
          : <button type="button" className="btn btn-primary" onClick={() => go('club')}>Open the demo club first</button>
      )}
      {clubs && clubs.length === 0 && (
        <>
          <p className="muted">Tournaments are posted by a club. Create yours first; you’ll be its owner.</p>
          <button type="button" className="btn btn-primary" onClick={() => go('club-new')}>Create a club</button>
        </>
      )}
      {clubs && clubs.length > 0 && (
        <section className="section" aria-label="Post as">
          <div className="label">Post as</div>
          {clubs.map(({ club }) => (
            <button key={club.id} type="button" className="match-row" onClick={() => go(canHost(club) ? 'club-tournament-new' : 'club-view', club.id)}>
              <span style={{ flex: 1 }}><b>{club.name}</b>{club.city ? <span className="small muted"> · {club.city}</span> : null}
                {!canHost(club) && <span className="small muted" style={{ display: 'block' }}>{club.hosting === 'rejected' ? 'Not approved by PaddleQ yet: open the club to see why' : 'Waiting for PaddleQ to approve this club'}</span>}</span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      )}
    </main>
  );
}

// ---------- PaddleQ admins: the approval queue ----------

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
      <div className="small muted">{q.club}{q.verified ? ' (verified)' : ' (new organiser)'}{q.postedBy ? ` · posted by ${q.postedBy}` : ''} · {q.listing === 'run' ? 'Run on PaddleQ' : 'Listed only'}</div>
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
