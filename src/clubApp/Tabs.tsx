import type { ReactNode } from 'react';
import type { Go } from '../navigation';
import type { ClubTournament } from '../club/types';
import { backend, eventsBackend } from '../club/index';
import { DemoNote, RoleBadge, Status, useLoad } from '../club/screens/common';
import { clubMark, OrgShell, PageHead, type OrgTab } from '../rallyq/shell/Shell';
import { friendlyDate, friendlyTime } from '../club/dates';

const STATUS_TEXT: Record<ClubTournament['status'], string> = { draft: 'Not started', live: 'Live', done: 'Finished' };

const STATUS_CLASS: Record<ClubTournament['status'], string> = { draft: 'st wait', live: 'st live', done: 'st off' };

/** Organiser pages wear the v1.2 shell: the club on top of the side menu, RallyQ header, same tokens as Hub and the club page. */
function OrgPage({ go, active, clubName, clubId, children }: { go: Go; active: OrgTab; clubName?: string; clubId?: string; children: ReactNode }) {
  return <OrgShell go={go} active={active} clubName={clubName} clubId={clubId}>{children}</OrgShell>;
}

/** Tournaments page: every tournament of every club you're in, newest first, with a button to start a new one. */
export function ClubTournamentsTab({ go }: { go: Go }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) return null;
    if (!(await b.currentUser())) return null;
    const clubs = await b.myClubs();
    const bundles = await Promise.all(clubs.map((c) => b.clubBundle(c.club.id)));
    return bundles.map((x) => ({ club: x.club, role: x.role, tournaments: [...x.tournaments].filter((t) => !t.archivedAt).sort((p, q) => q.startDate.localeCompare(p.startDate)) }));
  }, [b]);
  const d = state.data;
  const first = d?.[0]?.club;
  return (
    <OrgPage go={go} active="tournaments" clubName={first?.name} clubId={first?.id}>
      <PageHead cap={d && d.length > 1 ? `${d.length} clubs` : first?.name ?? 'Your clubs'} title={<span id="ct-title">Tournaments</span>} />
      <main aria-labelledby="ct-title" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Status error={state.error} loading={state.loading && !d} />
        <DemoNote b={b} />
        {!state.loading && !d && (
          <section className="card section" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            <p style={{ margin: 0 }}>Sign in or open the demo club to run tournaments.</p>
            <button type="button" className="btn" onClick={() => go('club')}>Go to My club</button>
          </section>
        )}
        {d?.length === 0 && <p className="mut">You’re not in a club yet. Create one or join one in My club.</p>}
        {d?.map(({ club, role, tournaments }) => (
          <section key={club.id} aria-label={`${club.name} tournaments`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="between"><h2 className="disp" style={{ fontSize: 26 }}>{club.name}</h2><RoleBadge role={role} /></div>
            {tournaments.length === 0 && <p className="mut" style={{ margin: 0 }}>No tournaments yet.</p>}
            {tournaments.length > 0 && (
              <div className="card list">
                {tournaments.map((t) => (
                  <button key={t.id} type="button" aria-label={`${t.name}, ${STATUS_TEXT[t.status]}`} onClick={() => go('club-tournament', t.id)}>
                    <span className="tile" aria-hidden="true">{t.startDate.slice(8, 10)}</span>
                    <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><b style={{ display: 'block', overflowWrap: 'anywhere' }}>{t.name}</b><span className="mut" style={{ fontSize: 13 }}>{friendlyDate(t.startDate)} · {friendlyTime(t.startTime)}</span></span>
                    <span className={STATUS_CLASS[t.status]}>{STATUS_TEXT[t.status]}</span>
                    <span aria-hidden="true" className="mut">›</span>
                  </button>
                ))}
              </div>
            )}
            {(role === 'owner' || role === 'admin' || role === 'coach') && <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('club-tournament-new', club.id)}>+ Create Tournament at {club.name}</button>}
          </section>
        ))}
      </main>
    </OrgPage>
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

/** Results page: your tournaments (Results & DUPR), tournaments live now and finished in the last 30 days, with their public results. */
export function ClubResultsTab({ go }: { go: Go }) {
  const b = eventsBackend();
  const organised = useLoad(async () => {
    if (!(await b.currentUser())) return null;
    if (await b.isPlatformAdmin()) return { club: undefined as { id: string; name: string } | undefined, rows: (await b.adminTournaments()).filter((t) => !t.isTest && (t.matchesDone > 0 || t.status === 'done')).map((t) => ({ id: t.id, name: t.name, club: t.club, startDate: t.startDate })) };
    const clubs = await b.myClubs();
    const bundles = await Promise.all(clubs.map((c) => b.clubBundle(c.club.id)));
    const rows = bundles.flatMap((x) => x.tournaments.filter((t) => t.status !== 'draft').map((t) => ({ id: t.id, name: t.name, club: x.club.name, startDate: t.startDate }))).sort((x, y) => y.startDate.localeCompare(x.startDate));
    return { club: bundles[0]?.club, rows };
  }, [b]);
  const state = useLoad(async () => {
    const eb = eventsBackend();
    const [events, recent] = await Promise.all([eb.publicEvents().catch(() => []), eb.recentResults().catch(() => [])]);
    return { live: events.filter((e) => e.status === 'live' && e.results), recent: recent.filter((e) => e.results) };
  }, []);
  const d = state.data;
  const mine = organised.data;
  const row = (e: { slug: string; name: string; club: string; startDate: string }, live: boolean) => (
    <button key={e.slug} type="button" aria-label={`${e.name} results`} onClick={() => go('results', e.slug)}>
      <span className="tile" aria-hidden="true">{clubMark(e.club)}</span>
      <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><b style={{ display: 'block', overflowWrap: 'anywhere' }}>{e.name}</b><span className="mut" style={{ fontSize: 13 }}>{e.club} · {friendlyDate(e.startDate)}</span></span>
      {live ? <span className="st live">Live</span> : <span aria-hidden="true" className="mut">›</span>}
    </button>
  );
  return (
    <OrgPage go={go} active="results" clubName={mine?.club?.name} clubId={mine?.club?.id}>
      <PageHead cap="After the event" title={<span id="cr-title">Results</span>} />
      <main aria-labelledby="cr-title" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Status error={organised.error} loading={organised.loading && !organised.data} />
        {mine && <section aria-label="Organiser results and DUPR" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="disp" style={{ fontSize: 26 }}>Results &amp; DUPR</h2>
          {mine.rows.length === 0 && <p className="mut" style={{ margin: 0 }}>Your tournaments will appear here once they start.</p>}
          {mine.rows.length > 0 && <div className="card list">{mine.rows.map((t) => (
            <button key={t.id} type="button" aria-label={`${t.name} Results & DUPR`} onClick={() => go('club-results-dupr', t.id)}>
              <span className="tile" aria-hidden="true">{clubMark(t.club)}</span>
              <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}><b style={{ display: 'block', overflowWrap: 'anywhere' }}>{t.name}</b><span className="mut" style={{ fontSize: 13 }}>{t.club} · {friendlyDate(t.startDate)} · Results &amp; DUPR</span></span><span aria-hidden="true" className="mut">›</span>
            </button>))}</div>}
        </section>}
        <Status error={state.error} loading={state.loading && !d} />
        {d && <>
          <section aria-label="Live now" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><div className="cap">Live now</div>{d.live.length ? <div className="card list">{d.live.map((e) => row(e, true))}</div> : <p className="mut" style={{ margin: 0 }}>Nothing live right now.</p>}</section>
          <section aria-label="Recent results" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><div className="cap">Last 30 days</div>{d.recent.length ? <div className="card list">{d.recent.map((e) => row(e, false))}</div> : <p className="mut" style={{ margin: 0 }}>No recent results.</p>}</section>
        </>}
        <p className="mut" style={{ margin: 0, fontSize: 13 }}>Results links open without an account. Organisers turn them on from the tournament page.</p>
      </main>
    </OrgPage>
  );
}
