// Club / organiser → Overview: the club home from prototype 02 (club band, KPIs, at a glance, today at your club), on real data.
import type { Go } from '../../navigation';
import type { ClubBundle } from '../backend';
import { backend } from '../index';
import { friendlyDate, friendlyTime } from '../dates';
import { isApproved, isStaff } from '../types';
import { useLoad } from './common';
import { Intro, Kpi, MiniBtn, Panel, Row } from './Dash';

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join('').toUpperCase();
const hello = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export function ClubHome({ d, go }: { d: ClubBundle; go: Go }) {
  const b = backend();
  const staff = isStaff(d.role);
  const today = new Date().toISOString().slice(0, 10);
  const open = d.tournaments.filter((t) => !t.cancelledAt && !t.archivedAt);
  const live = open.filter((t) => t.status === 'live');
  const upcoming = open.filter((t) => t.status === 'draft' && t.startDate >= today).sort((a, c) => a.startDate.localeCompare(c.startDate));
  const finished = open.filter((t) => t.status === 'done').sort((a, c) => c.startDate.localeCompare(a.startDate));
  const regs = useLoad(async () => {
    if (!b || !staff) return [];
    const ts = [...live, ...upcoming].slice(0, 6);
    return (await Promise.all(ts.map((t) => b.registrations(t.id).then((rs) => rs.map((r) => ({ ...r, tournament: t.name }))).catch(() => [])))).flat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, d.club.id]);
  const rs = regs.data ?? [];
  const toDecide = rs.filter((r) => r.status === 'pending');
  const claims = rs.filter((r) => r.payment === 'claimed' && r.status !== 'withdrawn' && r.status !== 'rejected');
  const liveMatches = d.matches.filter((m) => live.some((t) => t.id === m.tournamentId) && m.status === 'live').length;
  const courts = live.reduce((n, t) => n + t.courts, 0);
  const focus = live[0] ?? upcoming[0] ?? finished[0];
  const tasks: { text: string; tag: string; kind: 'action' | 'ready' | 'live'; go: () => void }[] = [
    ...(claims.length ? [{ text: `Confirm ${claims.length} UPI payment${claims.length === 1 ? '' : 's'}`, tag: 'Action', kind: 'action' as const, go: () => go('club-inbox', live[0]?.id ?? upcoming[0]?.id) }] : []),
    ...(toDecide.length ? [{ text: `Decide on ${toDecide.length} entr${toDecide.length === 1 ? 'y' : 'ies'}`, tag: 'Action', kind: 'action' as const, go: () => go('club-inbox', upcoming[0]?.id ?? live[0]?.id) }] : []),
    ...live.map((t) => ({ text: `${t.name}: courts and referees`, tag: 'Live', kind: 'live' as const, go: () => go('club-desk', t.id) })),
    ...open.filter((t) => staff && !isApproved(t) && t.approval === 'submitted').map((t) => ({ text: `${t.name}: waiting for PaddleQ approval`, tag: 'Waiting', kind: 'ready' as const, go: () => go('club-tournament', t.id) })),
    ...finished.slice(0, 1).map((t) => ({ text: `Share ${t.name} results with players`, tag: 'Ready', kind: 'ready' as const, go: () => go('club-results-dupr', t.id) })),
  ];
  return (
    <div className="pq-dash">
      <Intro kicker="Club login" title={`${hello()}, organiser.`} sub="Your club, tournaments, entries and courts in one place." />
      <section className="pq-band" aria-label={`${d.club.name} club home`}>
        <span className="pq-band-logo">{d.club.logoUrl ? <img src={d.club.logoUrl} alt="" /> : initials(d.club.name)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="pq-band-kick">CLUB HOME</div>
          <div className="pq-band-name">{d.club.name}</div>
          <p>{[d.club.city, d.club.trusted ? 'Trusted club' : 'New tournaments need PaddleQ approval', `${d.members.length} member${d.members.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</p>
        </div>
      </section>
      <div className="pq-kpis">
        <Kpi label="Events this season" value={open.length} sub={`${live.length} live / ${upcoming.length} upcoming`} onClick={() => go('club-view', `${d.club.id}.tournaments`)} />
        <Kpi label="Entries to review" value={staff ? toDecide.length : '—'} sub="Waiting for your decision" onClick={staff && (upcoming[0] ?? live[0]) ? () => go('club-inbox', (upcoming[0] ?? live[0]).id) : undefined} />
        <Kpi label="UPI claims" value={staff ? claims.length : '—'} sub="Confirm after checking payment" onClick={staff && (upcoming[0] ?? live[0]) ? () => go('club-inbox', (live[0] ?? upcoming[0]).id) : undefined} />
        <Kpi label="Courts on deck" value={courts} sub={live.length ? `${liveMatches} live / ${live.length} tournament${live.length === 1 ? '' : 's'}` : 'No tournament live'} onClick={live[0] ? () => go('club-desk', live[0].id) : undefined} />
      </div>
      <div className="pq-panels">
        <Panel title="At a glance" action={<MiniBtn onClick={() => go('club-view', `${d.club.id}.tournaments`)}>All tournaments</MiniBtn>}>
          {staff && <div className="pq-actions" style={{ marginBottom: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => go('club-tournament-new', d.club.id)}>+ Create Tournament</button>
            {focus && <button type="button" className="btn btn-outline" onClick={() => go('club-inbox', focus.id)}>Entries inbox</button>}
            {focus && <button type="button" className="btn btn-outline" onClick={() => go('club-desk', focus.id)}>Open Tournament Desk</button>}
          </div>}
          {[...live, ...upcoming, ...finished.slice(0, 3)].map((t) => (
            <Row key={t.id} title={t.name} sub={`${friendlyDate(t.startDate)} · ${friendlyTime(t.startTime)} · ${t.courts} courts`}
              tag={t.status === 'live' ? 'Live' : t.status === 'done' ? 'Finished' : !isApproved(t) ? (t.approval === 'submitted' ? 'Waiting for PaddleQ' : 'Needs approval') : 'Upcoming'}
              tagKind={t.status === 'live' ? 'live' : t.status === 'done' ? 'plain' : 'ready'} onClick={() => go('club-tournament', t.id)} />
          ))}
          {open.length === 0 && <p className="small muted" style={{ margin: 0 }}>No tournaments yet. Create your first one.</p>}
        </Panel>
        <Panel title="Today at your club">
          {tasks.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing needs you right now.</p>}
          {tasks.slice(0, 6).map((x) => <Row key={x.text} title={x.text} tag={x.tag} tagKind={x.kind} right={<MiniBtn onClick={x.go}>Open</MiniBtn>} />)}
          <div className="pq-note">Match day? Open the Tournament Desk on a laptop at the desk; referees score on their phones from their court links.</div>
        </Panel>
      </div>
    </div>
  );
}

/** Club / organiser → Day-of guide: the match-day steps, each linked to the screen that does it. */
export function DayOfGuide({ d, go }: { d: ClubBundle; go: Go }) {
  const t = d.tournaments.find((x) => x.status === 'live') ?? [...d.tournaments].filter((x) => x.status === 'draft').sort((a, c) => a.startDate.localeCompare(c.startDate))[0];
  const steps: [string, string, (() => void) | undefined][] = [
    ['The day before', 'Close entries, make the draw and check the schedule fits your courts.', t ? () => go('club-tournament', t.id) : undefined],
    ['Referee links', 'Send each court its link on WhatsApp. Tell the referee PIN by voice, never in the same message.', t ? () => go('club-scorers', t.id) : undefined],
    ['The desk', 'Open the desk link on a laptop or tablet with the desk PIN. It shows every court and what’s next.', t ? () => go('club-desk', t.id) : undefined],
    ['During play', 'Call matches to courts, enter walkovers and late entries at the desk. Scores appear live for players.', t ? () => go('club-desk', t.id) : undefined],
    ['Knockouts', 'When the pools finish, add the knockouts from the tournament page.', t ? () => go('club-tournament', t.id) : undefined],
    ['When it’s over', 'Mark as finished, then share results and send DUPR details.', t ? () => go('club-results-dupr', t.id) : undefined],
  ];
  return (
    <div className="pq-dash">
      <Intro kicker="Day-of guide" title="Match day, step by step" sub={t ? `For ${t.name} (${friendlyDate(t.startDate)}).` : 'Create a tournament to link each step.'} />
      <Panel title="Steps">
        {steps.map(([title, text, open], i) => <Row key={title} title={`${i + 1}. ${title}`} sub={text} onClick={open} tag={open ? 'Open' : undefined} tagKind="ready" />)}
      </Panel>
    </div>
  );
}
