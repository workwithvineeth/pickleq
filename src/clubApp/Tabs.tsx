import type { Go } from '../navigation';
import type { ClubTournament } from '../club/types';
import { backend, eventsBackend } from '../club/index';
import { DemoNote, Header, RoleBadge, Status, useLoad } from '../club/screens/common';
import { friendlyDate, friendlyTime } from '../club/dates';

const STATUS_TEXT: Record<ClubTournament['status'], string> = { draft: 'Not started', live: 'Live', done: 'Finished' };

/** Tournaments tab: every tournament of every club you're in, newest first, with a button to start a new one. */
export function ClubTournamentsTab({ go }: { go: Go }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) return null;
    if (!(await b.currentUser())) return null;
    const clubs = await b.myClubs();
    const bundles = await Promise.all(clubs.map((c) => b.clubBundle(c.club.id)));
    return bundles.map((x) => ({ club: x.club, role: x.role, tournaments: [...x.tournaments].sort((p, q) => q.startDate.localeCompare(p.startDate)) }));
  }, [b]);
  const d = state.data;
  return (
    <main className="screen" aria-labelledby="ct-title">
      <Header id="ct-title" title="Tournaments" />
      <Status error={state.error} loading={state.loading && !d} />
      <DemoNote b={b} />
      {!state.loading && !d && (
        <section className="card section">
          <p style={{ margin: 0 }}>Sign in or open the demo club to run tournaments.</p>
          <button type="button" className="btn btn-primary" onClick={() => go('club')}>Go to My club</button>
        </section>
      )}
      {d?.length === 0 && <p className="small muted">You’re not in a club yet. Create one or join one in My club.</p>}
      {d?.map(({ club, role, tournaments }) => (
        <section key={club.id} className="section" aria-label={`${club.name} tournaments`}>
          <div className="row"><h2 style={{ fontSize: 18 }}>{club.name}</h2><RoleBadge role={role} /></div>
          {tournaments.length === 0 && <p className="small muted" style={{ margin: 0 }}>No tournaments yet.</p>}
          {tournaments.map((t) => (
            <button key={t.id} type="button" className="match-row" onClick={() => go('club-tournament', t.id)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{t.name}</span>
                <span className="small muted">{friendlyDate(t.startDate)} · {friendlyTime(t.startTime)} · {STATUS_TEXT[t.status]}</span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
          {(role === 'owner' || role === 'admin' || role === 'coach') && <button type="button" className="btn btn-primary" onClick={() => go('club-tournament-new', club.id)}>+ Create Tournament at {club.name}</button>}
        </section>
      ))}
    </main>
  );
}

/** Home: live and upcoming tournaments across every club you run, one tap into each (replaces the separate Tournaments tab). */
export function TodayAndUpcoming({ go }: { go: Go }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b || !(await b.currentUser())) return [];
    const clubs = await b.myClubs();
    const bundles = await Promise.all(clubs.filter((c) => c.role === 'owner' || c.role === 'admin' || c.role === 'coach').map((c) => b.clubBundle(c.club.id)));
    return bundles.flatMap((x) => x.tournaments.filter((t) => t.status !== 'done' && !t.cancelledAt && !t.archivedAt).map((t) => ({ t, club: x.club.name, clubId: x.club.id })))
      .sort((p, q) => (p.t.status === 'live' ? -1 : q.t.status === 'live' ? 1 : p.t.startDate.localeCompare(q.t.startDate)));
  }, [b]);
  const list = state.data ?? [];
  if (!list.length) return null;
  return (
    <section className="card" aria-label="Today and upcoming">
      <h2 className="cap" style={{ margin: 0, padding: '16px 18px 4px' }}>Today and upcoming</h2>
      <div className="list">
        {list.map(({ t, club }) => (
          <button key={t.id} type="button" onClick={() => go('club-tournament', t.id)}>
            <span className="tile" aria-hidden="true">{t.startDate.slice(8, 10)}</span>
            <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><b style={{ display: 'block' }}>{t.name}</b><span className="mut" style={{ fontSize: 13 }}>{club} · {friendlyDate(t.startDate)} · {friendlyTime(t.startTime)}</span></span>
            {t.status === 'live' ? <span className="st live">Live</span> : <span className={t.status === 'done' ? 'st off' : 'st wait'}>{STATUS_TEXT[t.status]}</span>}
            <span aria-hidden="true" className="mut">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Results tab: tournaments live now and finished in the last 30 days, with their public results. */
export function ClubResultsTab({ go }: { go: Go }) {
  const b = eventsBackend();
  const organised = useLoad(async () => {
    if (!(await b.currentUser())) return null;
    if (await b.isPlatformAdmin()) return (await b.adminTournaments()).filter((t) => !t.isTest && (t.matchesDone > 0 || t.status === 'done')).map((t) => ({ id: t.id, name: t.name, club: t.club, startDate: t.startDate }));
    const clubs = await b.myClubs();
    const bundles = await Promise.all(clubs.map((c) => b.clubBundle(c.club.id)));
    return bundles.flatMap((x) => x.tournaments.filter((t) => t.status !== 'draft').map((t) => ({ id: t.id, name: t.name, club: x.club.name, startDate: t.startDate }))).sort((x, y) => y.startDate.localeCompare(x.startDate));
  }, [b]);
  const state = useLoad(async () => {
    const eb = eventsBackend();
    const [events, recent] = await Promise.all([eb.publicEvents().catch(() => []), eb.recentResults().catch(() => [])]);
    return { live: events.filter((e) => e.status === 'live' && e.results), recent: recent.filter((e) => e.results) };
  }, []);
  const d = state.data;
  const row = (e: { slug: string; name: string; club: string; startDate: string }, live: boolean) => (
    <button key={e.slug} type="button" className="match-row" onClick={() => go('results', e.slug)} aria-label={`${e.name} results`}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600 }}>{e.name}</span>
        <span className="small muted">{e.club} · {friendlyDate(e.startDate)}</span>
      </span>
      {live ? <span className="pill pill-warn">Live</span> : <span aria-hidden="true">›</span>}
    </button>
  );
  return (
    <main className="screen" aria-labelledby="cr-title">
      <Header id="cr-title" title="Results" />
      <Status error={organised.error} loading={organised.loading && !organised.data} />
      {organised.data && <section className="section" aria-label="Organiser results and DUPR">
        <h2 style={{ fontSize: 18 }}>Results &amp; DUPR</h2>
        {organised.data.length === 0 && <p className="small muted">Your tournaments will appear here once they start.</p>}
        {organised.data.map((t) => <button key={t.id} type="button" className="match-row" onClick={() => go('club-results-dupr', t.id)} aria-label={`${t.name} Results & DUPR`}>
          <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block' }}>{t.name}</b><span className="small muted">{t.club} · {friendlyDate(t.startDate)} · Results &amp; DUPR</span></span><span aria-hidden="true">›</span>
        </button>)}
      </section>}
      <Status error={state.error} loading={state.loading && !d} />
      {d && <>
        <section className="section" aria-label="Live now"><div className="label">Live now</div>{d.live.length ? d.live.map((e) => row(e, true)) : <p className="small muted" style={{ margin: 0 }}>Nothing live right now.</p>}</section>
        <section className="section" aria-label="Recent results"><div className="label">Last 30 days</div>{d.recent.length ? d.recent.map((e) => row(e, false)) : <p className="small muted" style={{ margin: 0 }}>No recent results.</p>}</section>
      </>}
      <p className="small muted" style={{ margin: 0 }}>Results links open without an account. Organisers turn them on from the tournament page.</p>
    </main>
  );
}
