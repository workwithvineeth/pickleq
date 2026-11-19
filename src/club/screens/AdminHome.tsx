// Platform admin → Overview: the founder command centre from prototype 01, on real data.
import type { Go } from '../../navigation';
import { eventsBackend } from '../index';
import { trend, weekLabel } from '../adminStats';
import { friendlyDate, friendlyTime } from '../dates';
import { Status, useLoad } from './common';
import { Bars, Intro, Kpi, MiniBtn, Panel, Row } from './Dash';

export function AdminCommandCentre({ go }: { go: Go }) {
  const b = eventsBackend();
  const state = useLoad(async () => {
    const soft = <T,>(f: () => Promise<T[]>) => Promise.resolve().then(f).catch(() => [] as T[]);
    const [o, queue, ts, clubs] = await Promise.all([b.adminOverview(), soft(() => b.approvalQueue()), soft(() => b.adminTournaments()), soft(() => b.adminClubs())]);
    if (!o) return null;
    return { o, queue, ts: ts.filter((t) => !t.isTest), clubs: clubs.filter((c) => !c.isTest) };
  }, [b]);
  const d = state.data;
  const waiting = d?.queue.filter((q) => q.approval === 'submitted') ?? [];
  const reviewClubs = d?.clubs.filter((c) => c.hosting === 'pending') ?? [];
  const live = d?.ts.filter((t) => t.status === 'live') ?? [];
  const upcoming = d?.ts.filter((t) => t.status === 'draft').sort((a, c) => a.startDate.localeCompare(c.startDate)) ?? [];
  const entries = d?.ts.filter((t) => t.status !== 'done').reduce((n, t) => n + t.registrations, 0) ?? 0;
  return (
    <div className="pq-dash">
      <Intro kicker="Platform admin"
        sub="Approvals, clubs, tournaments, match day and results across RallyQ, in one place."
        action={<button type="button" className="btn btn-primary" onClick={() => go('admin', 'approvals')}>Review approvals{waiting.length ? ` (${waiting.length})` : ''}</button>} />
      <Status error={state.error} loading={state.loading && !d} />
      {d && <>
        <div className="pq-kpis">
          <Kpi label="Clubs" value={d.o.clubs} sub={`${d.o.verifiedClubs} trusted${reviewClubs.length ? ` · ${reviewClubs.length} requesting review` : ''}`} onClick={() => go('admin', 'clubs')} />
          <Kpi label="Active events" value={d.o.live + d.o.upcoming} sub={`${d.o.live} live · ${d.o.upcoming} coming up`} onClick={() => go('admin', 'tournaments')} />
          <Kpi label="To approve" value={waiting.length} sub={waiting.length ? `${waiting.length === 1 ? 'tournament' : 'tournaments'} waiting for you · ${entries} player entries in open events` : `nothing waiting · ${entries} player entries in open events`} onClick={() => go('admin', 'approvals')} />
          <Kpi label="Matches this week" value={d.o.matchesWeek} sub={trend(d.o.weeks)} onClick={() => go('admin', 'results')} />
        </div>
        <div className="pq-panels">
          <Panel title="Approvals that need you" action={<MiniBtn onClick={() => go('admin', 'approvals')}>View all</MiniBtn>}>
            {waiting.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing waiting. Trusted clubs skip approval.</p>}
            {waiting.slice(0, 4).map((q) => <Row key={q.id} title={q.name} sub={`${q.club}${q.city ? ` · ${q.city}` : ''} · ${friendlyDate(q.startDate)}`} right={<MiniBtn onClick={() => go('admin', 'approvals')}>Review</MiniBtn>} />)}
            {reviewClubs.length > 0 && <Row title="Clubs asking to host" tag={reviewClubs.length} tagKind="action" onClick={() => go('admin', 'clubs')} />}
          </Panel>
          <Panel title="Match-day pulse" action={<MiniBtn onClick={() => go('admin', 'desk')}>Open operations</MiniBtn>}>
            {live.length === 0 && <p className="small muted" style={{ margin: 0 }}>No tournament is live right now.</p>}
            {live.slice(0, 4).map((t) => <Row key={t.id} title={t.name} sub={`${t.club} · ${t.matchesDone} of ${t.matches} matches scored`} tag="Live" tagKind="live" onClick={() => go('admin', 'tournaments')} />)}
            {upcoming.slice(0, Math.max(0, 4 - live.length)).map((t) => <Row key={t.id} title={t.name} sub={`${t.club} · ${friendlyDate(t.startDate)} · ${friendlyTime(t.startTime)}`} tag="Next" tagKind="ready" onClick={() => go('admin', 'tournaments')} />)}
            <div className="pq-note">Live courts update as referees score. Open a tournament from Tournaments to help as support (every change is logged).</div>
          </Panel>
        </div>
        <div className="pq-panels pq-even">
          <Panel title="Matches scored · weekly trend" label="Matches scored this week" action={<MiniBtn onClick={() => go('admin', 'marketing')}>Growth numbers</MiniBtn>}>
            <Bars label="Matches scored per week" data={d.o.weeks.map((w) => ({ label: weekLabel(w.week).split(' ')[0], value: w.matches }))} />
            <p className="small muted" style={{ margin: '6px 0 0' }}>Weeks start on Monday. The robot’s test club isn’t counted.</p>
          </Panel>
          <Panel title="Club circuit · admin only" action={<MiniBtn onClick={() => go('admin', 'circuit')}>See proposals</MiniBtn>}>
            <p style={{ margin: 0 }}>Interclub and individual ranking ideas stay admin-only until you approve the points and finals rules.</p>
            <Row title="Results & DUPR" sub={`${d.o.finished} finished tournaments`} onClick={() => go('admin', 'results')} />
            <Row title="Accounts" sub={`${d.o.accounts} in all · ${d.o.accountsWeek} new this week`} />
          </Panel>
        </div>
      </>}
    </div>
  );
}
