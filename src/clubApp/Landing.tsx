import { useEffect, useRef, useState } from 'react';
import type { Go } from '../navigation';
import { eventsBackend, serverBackend } from '../club/index';
import type { PublicEvent } from '../club/backend';
import { PosterImage } from '../club/screens/Poster';
import { useLoad } from '../club/screens/common';

/**
 * The public home page at paddleq.in for visitors who aren't signed in (signed-in people go straight to My clubs).
 * Everything on it is real: upcoming events, live tournaments, recent results and club names come from the board.
 * A section with nothing to show is left out. No invented numbers or quotes.
 */
export function Landing({ go }: { go: Go }) {
  const [checked, setChecked] = useState(false);
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    let on = true;
    eventsBackend().currentUser().then((u) => {
      if (!on) return;
      if (u) goRef.current('club', undefined, { replace: true });
      else setChecked(true);
    }, () => { if (on) setChecked(true); });
    return () => { on = false; };
  }, []);
  const state = useLoad(async () => {
    const server = serverBackend();
    if (!server) return { live: [], upcoming: [], past: [] };
    const [events, past] = await Promise.all([server.publicEvents().catch(() => []), server.recentResults().catch(() => [])]);
    const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime));
    return { live: sorted.filter((e) => e.status === 'live'), upcoming: sorted.filter((e) => e.status !== 'live').slice(0, 6), past: past.slice(0, 4) };
  }, []);
  useEffect(() => {
    const prev = document.title;
    document.title = 'PaddleQ · Pickleball tournaments, live scores and results in Hyderabad';
    return () => { document.title = prev; };
  }, []);
  if (!checked) return <div className="pq-landing" aria-busy="true" />;
  const d = state.data;
  const live = d?.live ?? [];
  const upcoming = d?.upcoming ?? [];
  const past = d?.past ?? [];
  const clubs = [...new Set([...live, ...upcoming, ...past].map((e) => e.club).filter(Boolean))].slice(0, 8);
  const feature = live[0] ?? upcoming[0];
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="pq-landing">
      <header className="pq-l-top">
        <div className="pq-l-wrap pq-l-top-row">
          <button type="button" className="pq-l-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="PaddleQ home">
            <img src={`${import.meta.env.BASE_URL}icons/club.svg`} alt="" width={40} height={40} />
            <span>PaddleQ</span>
          </button>
          <nav aria-label="Site" className="pq-l-nav">
            <button type="button" onClick={() => go('events')}>Events</button>
            <button type="button" onClick={() => scrollTo('results')}>Results</button>
            <button type="button" onClick={() => scrollTo('studio')}>Player Studio</button>
            <button type="button" onClick={() => scrollTo('clubs')}>For clubs</button>
          </nav>
          <button type="button" className="pq-l-btn pq-l-btn-outline pq-l-signin" onClick={() => go('club-signin')}>Sign in</button>
        </div>
      </header>

      <main>
        <section className="pq-l-wrap pq-l-hero" aria-labelledby="pq-l-title">
          <div className="pq-l-hero-text">
            <span className="pq-l-kicker">HYDERABAD PICKLEBALL</span>
            <h1 id="pq-l-title">Every tournament, every result, in one place.</h1>
            <p className="pq-l-lead">Find your next event and enter in a minute. Follow live scores court by court. Keep your results and practice diary in Player Studio. Free for players.</p>
            <div className="pq-l-actions">
              <button type="button" className="pq-l-btn pq-l-btn-primary" onClick={() => go('events')}>Find a tournament</button>
              <button type="button" className="pq-l-btn pq-l-btn-outline" onClick={() => scrollTo('clubs')}>Run your tournament</button>
            </div>
          </div>
          {feature && <FeatureCard e={feature} live={feature.status === 'live'} go={go} />}
        </section>

        {upcoming.length > 0 && (
          <section id="events" className="pq-l-band" aria-labelledby="pq-l-events">
            <div className="pq-l-wrap pq-l-stack">
              <div className="pq-l-head">
                <div><span className="pq-l-kicker">COMING UP</span><h2 id="pq-l-events">Tournaments you can enter</h2></div>
                <button type="button" className="pq-l-link" onClick={() => go('events')}>See all events →</button>
              </div>
              <div className="pq-l-grid">
                {upcoming.map((e) => <EventCard key={e.slug} e={e} go={go} />)}
              </div>
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section id="results" className="pq-l-wrap pq-l-stack pq-l-section" aria-labelledby="pq-l-results">
            <div className="pq-l-head">
              <div><span className="pq-l-kicker">JUST FINISHED</span><h2 id="pq-l-results">Recent results</h2></div>
              <button type="button" className="pq-l-link" onClick={() => go('events')}>All events →</button>
            </div>
            <div className="pq-l-grid pq-l-grid-2">
              {past.map((e) => (
                <button key={e.slug} type="button" className="pq-l-result" aria-label={`${e.name} results`} onClick={() => go('results', e.slug)}>
                  <span className="pq-l-result-name">{e.name}</span>
                  <span className="pq-l-muted">{longDate(e.startDate)} · {e.club}</span>
                  <span className="pq-l-muted">{e.divisions.map((x) => x.name).join(' · ')}</span>
                  <span className="pq-l-link-text">Full draw and scores →</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="pq-l-wrap pq-l-paths pq-l-section" aria-label="For players and for clubs">
          <article id="studio" className="pq-l-studio" aria-labelledby="pq-l-studio-h">
            <span className="pq-l-kicker pq-l-kicker-light">FOR PLAYERS · FREE</span>
            <h2 id="pq-l-studio-h">Player Studio</h2>
            <p>Your official tournament results, a private practice diary, your DUPR history, and coach notes that say what’s measured and what’s only your own estimate.</p>
            <div className="pq-l-actions">
              <button type="button" className="pq-l-btn pq-l-btn-cream" onClick={() => go('club-player-studio')}>Open Player Studio</button>
            </div>
          </article>
          <article id="clubs" className="pq-l-clubs" aria-labelledby="pq-l-clubs-h">
            <span className="pq-l-kicker">FOR CLUBS AND ORGANISERS</span>
            <h2 id="pq-l-clubs-h">Run match day from your phone</h2>
            <ol className="pq-l-steps">
              <li><span aria-hidden="true">1</span><div><b>Create</b><p>Events, entry fee, UPI and DUPR caps. Players enter online, or you add them yourself.</p></div></li>
              <li><span aria-hidden="true">2</span><div><b>Draw</b><p>Pools, knockouts and a court schedule, made for you.</p></div></li>
              <li><span aria-hidden="true">3</span><div><b>Run it live</b><p>Referees score on their phones, the desk sees every court, and results publish themselves.</p></div></li>
            </ol>
            <div className="pq-l-actions">
              <button type="button" className="pq-l-btn pq-l-btn-primary" onClick={() => go('club-new')}>Start your club, free</button>
              <button type="button" className="pq-l-btn pq-l-btn-outline" onClick={() => go('demo')}>Try the demo club</button>
            </div>
            <button type="button" className="pq-l-link" onClick={() => go('events-post')}>Just want to list an event? Post it on the board for free →</button>
          </article>
        </section>

        <section className="pq-l-trust" aria-label="Clubs and privacy">
          <div className="pq-l-wrap pq-l-trust-grid">
            {clubs.length > 0 && (
              <div>
                <b>Clubs running events on PaddleQ</b>
                <ul className="pq-l-chips">{clubs.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            )}
            <div><b>Private by default</b><p>Your diary is yours; clubs never see it. Phone numbers and emails stay with the organiser.</p></div>
            <div><b>Works with your DUPR</b><p>Enter with your DUPR rating and ID, and organisers export results for DUPR.</p></div>
          </div>
        </section>
      </main>

      <footer className="pq-l-footer">
        <div className="pq-l-wrap pq-l-footer-row">
          <span className="pq-l-footer-brand">PaddleQ</span>
          <span>Made in Hyderabad for the pickleball community.</span>
          <a href="mailto:hello@paddleq.in">hello@paddleq.in</a>
        </div>
      </footer>
    </div>
  );
}

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function spotsText(e: PublicEvent): string | null {
  if (!e.registrationOpen) return e.entryMode === 'registration' ? 'Entries closed' : null;
  const caps = e.divisions.map((x) => x.rules.cap).filter((c): c is number => typeof c === 'number');
  if (e.listing === 'run' && caps.length === e.divisions.length && caps.length > 0) {
    const left = e.divisions.reduce((n, x) => n + Math.max(0, (x.rules.cap ?? 0) - x.taken), 0);
    return left > 0 ? `${left} spot${left === 1 ? '' : 's'} left` : 'Waitlist open';
  }
  return 'Entries open';
}

function EventCard({ e, go }: { e: PublicEvent; go: Go }) {
  const d = new Date(`${e.startDate}T00:00:00`);
  const spots = spotsText(e);
  return (
    <article className="pq-l-event">
      <button type="button" className="pq-l-event-top" onClick={() => go('event', e.slug)} aria-label={e.name}>
        {e.posterUrl ? <PosterImage src={e.posterUrl} name={e.name} /> : (
          <span className="pq-l-poster">
            <span className="pq-l-date"><b>{d.getDate()}</b><span>{d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</span></span>
            <span className="pq-l-poster-name">{e.name}</span>
          </span>
        )}
      </button>
      <div className="pq-l-event-body">
        {e.posterUrl && <b className="pq-l-event-name">{e.name}</b>}
        <span className="pq-l-muted">{longDate(e.startDate)} · {e.club}{e.city ? ` · ${e.city}` : ''}</span>
        <span>{e.divisions.map((x) => x.name).join(' · ')}</span>
        <div className="pq-l-event-foot">
          {spots && <span className="pq-l-pill">{spots}</span>}
          <button type="button" className="pq-l-btn pq-l-btn-primary pq-l-btn-sm" onClick={() => go('event', e.slug)}>{e.registrationOpen ? 'Enter' : 'Details'}</button>
        </div>
      </div>
    </article>
  );
}

function FeatureCard({ e, live, go }: { e: PublicEvent; live: boolean; go: Go }) {
  return (
    <aside className="pq-l-feature" aria-label={live ? 'Live now' : 'Next tournament'}>
      <div className="pq-l-feature-head">
        <span className={live ? 'pq-l-badge' : 'pq-l-badge pq-l-badge-soft'}>{live ? 'LIVE NOW' : 'NEXT UP'}</span>
        <span className="pq-l-muted">{longDate(e.startDate)}</span>
      </div>
      {e.posterUrl && <PosterImage src={e.posterUrl} name={e.name} />}
      <h2 className="pq-l-feature-name">{e.name}</h2>
      <span className="pq-l-muted">{e.club}{e.venue ? ` · ${e.venue}` : ''}{e.city ? `, ${e.city}` : ''}</span>
      <span>{e.divisions.map((x) => x.name).join(' · ')}</span>
      <button type="button" className="pq-l-btn pq-l-btn-primary" onClick={() => go(live && e.results ? 'results' : 'event', e.slug)}>
        {live ? 'Follow live scores' : e.registrationOpen ? 'See and enter' : 'See details'}
      </button>
    </aside>
  );
}
