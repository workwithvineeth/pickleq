import '../../prototype6.css';
import type { Go } from '../../navigation';
import type { ClubBundle } from '../backend';
import { backend } from '../index';
import { friendlyDate, friendlyTime } from '../dates';
import { isStaff, STAGE_LABEL } from '../types';
import { names, useLoad } from './common';
import { Intro, Kpi, MiniBtn, Panel, Row } from './Dash';

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join('').toUpperCase();
const hello = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export function ClubHome({ d, go }: { d: ClubBundle; go: Go }) {
  const b = backend();
  const staff = isStaff(d.role);
  const today = new Date().toISOString().slice(0, 10);
  const open = d.tournaments.filter(t => !t.cancelledAt && !t.archivedAt);
  const live = open.filter(t => t.status === 'live');
  const upcoming = open.filter(t => t.status === 'draft' && t.startDate >= today).sort((a, c) => a.startDate.localeCompare(c.startDate));
  const pastDrafts=open.filter(t=>t.status==='draft'&&t.startDate<today);
  const finished = open.filter(t => t.status === 'done').sort((a, c) => c.startDate.localeCompare(a.startDate));
  const key = open.map(t => t.id).join(',');
  const counts = useLoad(async () => {
    if (!b || !staff) return { registrations: [], missing: [], name: '' };
    const [registrations, links, user] = await Promise.all([
      Promise.all(open.filter(t => t.status !== 'done').map(t => b.registrations(t.id))).then(r => r.flat()),
      Promise.all(live.map(async t => ({ t, links: await b.scorerLinks(t.id) }))),
      b.currentUser(),
    ]);
    return { registrations, missing: links.map(({t, links: ls}) => ({ t, count: Array.from({length:t.courts}, (_,i) => i+1).filter(c => !ls.some(l => !l.revoked && (!l.court || l.court === c))).length })).filter(x => x.count > 0),
      name: d.members.find(m => m.userId === user?.id)?.name.split(' ')[0] ?? '' };
  }, [b, d.club.id, key, staff]);
  const claims = counts.data?.registrations.filter(r => r.payment === 'claimed' && !['withdrawn','rejected'].includes(r.status)) ?? [];
  const pending = counts.data?.registrations.filter(r => r.status === 'pending') ?? [];
  const missing = counts.data?.missing ?? [];
  const needs = claims.length + pending.length + missing.reduce((s,x) => s+x.count,0);
  const liveMatches = d.matches.filter(m => m.status === 'live' && live.some(t => t.id === m.tournamentId));
  const players = new Map(d.players.map(p => [p.id,p]));
  const focus = live[0] ?? upcoming[0] ?? finished[0];
  const countValue = (n: number) => counts.data ? n : '—';
  return <div className="pq-dash pq-overview pq-proto">
    <p className="pq-overview-greeting">{hello()}{counts.data?.name ? ', ' + counts.data.name : ''} · {live.length} {live.length === 1 ? 'event' : 'events'} live</p>
    <section className="pq-overview-strip pq-glass" aria-label="Club details">
      <span className="pq-band-logo">{d.club.logoUrl ? <img src={d.club.logoUrl} alt="" /> : initials(d.club.name)}</span>
      <span>{[d.club.trusted ? 'Trusted club' : d.club.city, d.members.length + ' members'].filter(Boolean).join(' · ')}</span>
    </section>
    {liveMatches.length > 0 && <section className="pq-overview-live" aria-label="Live now"><div className="ch"><h2>Live now</h2><span className="cap">{liveMatches.length} courts in play</span></div>
      <div className="pq-overview-courts">{liveMatches.map((m,i) => {
        const t=live.find(t=>t.id===m.tournamentId)!, game=m.games.at(-1);
        return <article className={"photo court pq-overview-court"+(i>=3?" pq-overview-extra":"")} key={m.id}>
          <div className="ph" style={{backgroundImage:"url("+import.meta.env.BASE_URL+"prototype6/"+["pb-man.jpg","woman-hit.jpg","court-night.jpg"][i%3]+")"}} />
          <div className="pq-overview-court-head"><span className="chip b"><i className="pq-live-dot" aria-hidden="true" />Court {m.court??"—"}</span><span className="cap">{t.name}</span></div>
          <div className="pq-overview-court-body lgd"><div className="cap">{STAGE_LABEL[m.stage]}</div>
            <div className="tmr"><b>{names(m.sideA,players)}</b><b className="n pq-score">{game?.a??0}</b></div>
            <div className="tmr"><span>{names(m.sideB,players)}</span><b className="n pq-score">{game?.b??0}</b></div>
            {t.isPublic && <button type="button" className="pq-mini-btn" onClick={()=>go("results",t.publicSlug)}>Watch →</button>}
          </div></article>;
      })}</div>
      {liveMatches.length>3 && <button type="button" className="pq-mini-btn pq-overview-all" onClick={()=>go(live[0].isPublic?"results":"club-desk",live[0].isPublic?live[0].publicSlug:live[0].id)}>All courts →</button>}
    </section>}
    <div className="pq-overview-middle">
      <Panel title="Needs you" action={<span className="pq-overview-count pq-score">{counts.data ? needs : '—'}</span>}>
        {counts.error && <p role="alert">Could not load action counts. <MiniBtn onClick={counts.reload}>Try again</MiniBtn></p>}
        {counts.loading && !counts.data && <p role="status">Loading actions…</p>}
        {counts.data && needs === 0 && <p className="small muted">Nothing needs you right now.</p>}
        {claims.length > 0 && <Row title="Payments to verify" tag={claims.length} tagKind="action" right={<MiniBtn onClick={() => go('club-inbox',claims[0].tournamentId)}>Verify</MiniBtn>} />}
        {pending.length > 0 && <Row title="Entries to decide" tag={pending.length} tagKind="action" right={<MiniBtn onClick={() => go('club-inbox',pending[0].tournamentId)}>Review</MiniBtn>} />}
        {missing.map(x => <Row key={x.t.id} title="Referee links not created" sub={x.t.name} tag={x.count} tagKind="action" right={<MiniBtn onClick={() => go('club-scorers',x.t.id)}>Create referee links</MiniBtn>} />)}
      </Panel>
      <div className="pq-kpis">
        <Kpi label="Events this season" value={open.length} sub={live.length + ' live · ' + upcoming.length + ' upcoming'} onClick={() => go('club-view',d.club.id+'.tournaments')} />
        <Kpi label="Entries to review" value={countValue(pending.length)} sub="Waiting for your decision" onClick={pending[0] ? () => go('club-inbox',pending[0].tournamentId) : undefined} />
        <Kpi label="Payments to verify" value={countValue(claims.length)} sub="Check payment before confirming" onClick={claims[0] ? () => go('club-inbox',claims[0].tournamentId) : undefined} />
        <Kpi label="Courts on deck" value={live.reduce((n,t)=>n+t.courts,0)} sub={liveMatches.length + ' courts live'} onClick={live[0] ? () => go('club-desk',live[0].id) : undefined} />
      </div>
    </div>
    <div className="pq-overview-bottom">
      <Panel title="Your tournaments" action={staff && <button type="button" className="btn btn-primary" onClick={() => go('club-tournament-new',d.club.id)}>Create tournament</button>}>
        {[...live,...upcoming,...pastDrafts,...finished].map(t => <Row key={t.id} title={t.name} sub={friendlyDate(t.startDate)+' · '+friendlyTime(t.startTime)+' · '+t.courts+' courts'} tag={t.status==='live'?'Live':t.status==='done'?'Finished':t.startDate<today?'Draft':'Upcoming'} tagKind={t.status==='live'?'live':t.status==='done'?'plain':'ready'} onClick={() => go('club-tournament',t.id)} />)}
        {open.length === 0 && <p className="small muted">No tournaments yet. Create your first one.</p>}
      </Panel>
      {staff && focus && <Panel title="Quick actions"><div className="pq-overview-quick">
        <button className="btn btn-outline pq-glass" type="button" onClick={() => go('club-inbox',focus.id)}>Entries inbox</button>
        <button className="btn btn-outline pq-glass" type="button" onClick={() => go('club-desk',focus.id)}>Open the desk</button>
      </div></Panel>}
    </div>
  </div>;
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
