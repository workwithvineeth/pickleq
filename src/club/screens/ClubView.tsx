import { useMemo, useState } from 'react';
import { Segmented } from '../../components/Controls';
import { scoreLine } from '../../domain/scoring';
import type { Go } from '../../navigation';
import type { ClubBundle } from '../backend';
import { biggest, type Swing, playerClubStats, playerFlags, playerMatches, sideOf, squadTable, squadTotals, winRate, type SquadRow } from '../domain/analytics';
import { matchResult } from '../domain/engine';
import { backend } from '../index';
import { mySummary } from '../personal';
import { isAdmin, isStaff, ROLE_LABEL, STAGE_LABEL, type ClubMatch, type ClubPlayer, type Role, type Share, type SummaryData } from '../types';
import { appLink, DemoNote, errorText, fmtRating, Header, names, RoleBadge, shareLink, Status, useLoad } from './common';

type Tab = 'events' | 'players' | 'squad' | 'members';

export function ClubView({ clubId, go, onBack }: { clubId: string; go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => { if (!b) throw new Error('Open Club mode first'); return b.clubBundle(clubId); }, [b, clubId]);
  const [tab, setTab] = useState<Tab>('events');
  const d = state.data;
  const staff = isStaff(d?.role);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'events', label: 'Events' }, { value: 'players', label: 'Players' },
    ...(staff ? [{ value: 'squad' as Tab, label: 'Coach' }] : []), { value: 'members', label: 'Members' },
  ];
  return (
    <main className="screen wide-ok" aria-labelledby="clubview-title">
      <Header id="clubview-title" title={d?.club.name ?? 'Club'} onBack={onBack} right={d && <RoleBadge role={d.role} />} />
      <Status error={state.error} loading={state.loading && !d} />
      <DemoNote b={b} />
      {d && (
        <>
          <Segmented label="Club sections" value={tab} options={tabs} onChange={setTab} />
          {tab === 'events' && <Events d={d} go={go} reload={state.reload} />}
          {tab === 'players' && <Players d={d} go={go} reload={state.reload} />}
          {tab === 'squad' && staff && <Squad d={d} go={go} />}
          {tab === 'members' && <Members d={d} go={go} reload={state.reload} />}
        </>
      )}
    </main>
  );
}

function MatchLine({ m, players, onOpen }: { m: ClubMatch; players: Map<string, ClubPlayer>; onOpen?: () => void }) {
  const r = matchResult(m);
  const body = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: m.winner === 'A' ? 600 : 400 }}>{names(m.sideA, players)}</span>
        <span style={{ display: 'block', fontWeight: m.winner === 'B' ? 600 : 400 }}>{names(m.sideB, players)}</span>
        <span className="small muted">{m.playedOn ?? ''}{m.stage !== 'friendly' ? ` · ${STAGE_LABEL[m.stage]}` : ''}</span>
      </span>
      <span className="small" style={{ textAlign: 'right' }}>
        {m.status === 'done' ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : m.status === 'live' ? <span className="pill pill-warn">Live {r.pointsA + r.pointsB > 0 ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : ''}</span> : <span className="pill">To play</span>}
      </span>
    </>
  );
  return onOpen
    ? <button type="button" className="match-row" onClick={onOpen}>{body}</button>
    : <div className="match-row">{body}</div>;
}

function Events({ d, go, reload }: { d: ClubBundle; go: Go; reload: () => void }) {
  const staff = isStaff(d.role);
  const players = useMemo(() => new Map(d.players.map((p) => [p.id, p])), [d.players]);
  const friendlies = d.matches.filter((m) => m.stage === 'friendly').sort((a, b) => (b.playedOn ?? '').localeCompare(a.playedOn ?? '')).slice(0, 10);
  const [logging, setLogging] = useState(false);
  return (
    <>
      <section className="section" aria-label="Tournaments">
        <div className="header"><h2 style={{ fontSize: 18 }}>Tournaments</h2>{staff && <button type="button" className="link-btn" onClick={() => go('club-tournament-new', d.club.id)}>New tournament</button>}</div>
        {d.tournaments.length === 0 && <p className="small muted">No tournaments yet.</p>}
        {d.tournaments.map((t) => (
          <button key={t.id} type="button" className="match-row" onClick={() => go('club-tournament', t.id)}>
            <span style={{ flex: 1 }}><span style={{ display: 'block', fontWeight: 600 }}>{t.name}</span><span className="small muted">{t.startDate} · {t.courts} courts</span></span>
            <span className={`pill${t.status === 'live' ? ' pill-warn' : t.status === 'done' ? ' pill-ok' : ''}`}>{t.status === 'live' ? 'Live' : t.status === 'done' ? 'Finished' : 'Draft'}</span>
          </button>
        ))}
      </section>
      <section className="section" aria-label="Club matches">
        <div className="header"><h2 style={{ fontSize: 18 }}>Club matches</h2>{staff && !logging && <button type="button" className="link-btn" onClick={() => setLogging(true)}>Score a club match</button>}</div>
        {logging && <NewFriendly d={d} go={go} onCancel={() => { setLogging(false); reload(); }} />}
        {friendlies.length === 0 && <p className="small muted">No club matches yet.</p>}
        {friendlies.map((m) => <MatchLine key={m.id} m={m} players={players} onOpen={staff && m.status !== 'done' ? () => go('club-score', m.id) : undefined} />)}
      </section>
    </>
  );
}

function NewFriendly({ d, go, onCancel }: { d: ClubBundle; go: Go; onCancel: () => void }) {
  const [kind, setKind] = useState<'singles' | 'doubles'>('doubles');
  const [picks, setPicks] = useState<string[]>(['', '', '', '']);
  const [msg, setMsg] = useState<string | null>(null);
  const need = kind === 'doubles' ? 4 : 2;
  const sorted = [...d.players].sort((a, b) => a.name.localeCompare(b.name));
  async function start() {
    const chosen = picks.slice(0, need);
    if (chosen.some((p) => !p)) return setMsg('Choose every player');
    if (new Set(chosen).size !== chosen.length) return setMsg('A player is chosen twice');
    const b = backend();
    if (!b) return;
    const half = need / 2;
    const id = crypto.randomUUID();
    try {
      await b.addMatches([{ id, clubId: d.club.id, stage: 'friendly', sideA: chosen.slice(0, half), sideB: chosen.slice(half), format: { pointsTo: 11, bestOf: 1, scoring: 'sideout' }, games: [], status: 'scheduled', playedOn: new Date().toISOString().slice(0, 10) }]);
      go('club-score', id);
    } catch (e) { setMsg(errorText(e)); }
  }
  const slot = (i: number, label: string) => (
    <select className="input" aria-label={label} value={picks[i]} onChange={(e) => setPicks((p) => p.map((x, j) => (j === i ? e.target.value : x)))}>
      <option value="">{label}</option>
      {sorted.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
  return (
    <section className="card section" aria-label="New club match">
      <Segmented label="Match type" value={kind} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} onChange={setKind} />
      <div className="label">Side A</div>
      {slot(0, 'Side A player 1')}{kind === 'doubles' && slot(1, 'Side A player 2')}
      <div className="label">Side B</div>
      {slot(kind === 'doubles' ? 2 : 1, 'Side B player 1')}{kind === 'doubles' && slot(3, 'Side B player 2')}
      <p className="small muted" style={{ margin: 0 }}>One game to 11. Score it point by point, and comebacks and lost leads are worked out for you.</p>
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <div className="sticky-actions" style={{ position: 'static' }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={start}>Start scoring</button>
      </div>
    </section>
  );
}

function Players({ d, go, reload }: { d: ClubBundle; go: Go; reload: () => void }) {
  const staff = isStaff(d.role);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const list = [...d.players].filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="section" aria-label="Players">
      <div className="header"><h2 style={{ fontSize: 18 }}>{d.players.length} players</h2>{staff && !adding && <button type="button" className="link-btn" onClick={() => setAdding(true)}>Add a player</button>}</div>
      {adding && <AddPlayer clubId={d.club.id} onDone={() => { setAdding(false); reload(); }} />}
      <input className="input" aria-label="Find a player" placeholder="Find a player" value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="table" aria-label="Roster">
        <thead><tr><th>Name</th><th>Singles</th><th>Doubles</th></tr></thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td><button type="button" className="link-btn" style={{ padding: 0, textAlign: 'left' }} onClick={() => go('club-player', p.id)}>{p.name}</button>{p.id === d.myPlayerId && <span className="small muted"> (you)</span>}</td>
              <td>{fmtRating(p.duprSingles)}</td>
              <td>{fmtRating(p.duprDoubles)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ margin: 0 }}>Ratings are DUPR, entered by the club or the player. PICKLEQ never calculates ratings.</p>
    </section>
  );
}

function AddPlayer({ clubId, onDone }: { clubId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [s, setS] = useState('');
  const [dd, setD] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const num = (v: string) => { if (!v.trim()) return undefined; const n = Number(v); return Number.isFinite(n) ? n : NaN; };
  async function save() {
    const ns = num(s), nd = num(dd);
    if (!name.trim()) return setMsg('Enter the player’s name');
    if ([ns, nd].some((x) => x !== undefined && (Number.isNaN(x) || x < 1 || x > 8))) return setMsg('DUPR ratings are between 1 and 8');
    try { await backend()?.addPlayer(clubId, { name, duprSingles: ns, duprDoubles: nd }); onDone(); } catch (e) { setMsg(errorText(e)); }
  }
  return (
    <section className="card section" aria-label="Add a player">
      <input className="input" aria-label="Player name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <input className="input" aria-label="DUPR singles" placeholder="DUPR singles" inputMode="decimal" value={s} onChange={(e) => setS(e.target.value)} />
        <input className="input" aria-label="DUPR doubles" placeholder="DUPR doubles" inputMode="decimal" value={dd} onChange={(e) => setD(e.target.value)} />
      </div>
      {msg && <div role="status" className="msg msg-bad">{msg}</div>}
      <div className="sticky-actions" style={{ position: 'static' }}>
        <button type="button" className="btn btn-outline" onClick={onDone}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={save}>Add player</button>
      </div>
    </section>
  );
}

type SortKey = 'name' | 'matches' | 'winPct' | 'closePct' | 'comebacks' | 'lostLeads' | 'closing';

function Squad({ d, go }: { d: ClubBundle; go: Go }) {
  const rows = useMemo(() => squadTable(d.players, d.matches, d.club.settings.thresholds), [d]);
  const totals = squadTotals(rows);
  const [sort, setSort] = useState<SortKey>('lostLeads');
  const sorted = [...rows].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    const v = (r: SquadRow) => r[sort] ?? -1;
    return (v(b) as number) - (v(a) as number);
  });
  const cols: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Player' }, { key: 'matches', label: 'Played' }, { key: 'winPct', label: 'Win %' }, { key: 'closePct', label: 'Close %' },
    { key: 'comebacks', label: 'Came back' }, { key: 'lostLeads', label: 'Lost lead' }, { key: 'closing', label: 'Closed out %' },
  ];
  const pct = (v: number | null) => (v === null ? '–' : `${v}%`);
  return (
    <section className="section" aria-label="Coach view">
      <div className="kpis">
        <div className="kpi"><div className="small muted">Players with club matches</div><div className="v">{totals.players}</div></div>
        <div className="kpi"><div className="small muted">Games closed out from game point</div><div className="v">{totals.avgClosing === null ? '–' : `${totals.avgClosing}%`}</div></div>
        <div className="kpi"><div className="small muted">Lost leads across the squad</div><div className="v">{totals.lostLeads}</div></div>
        <div className="kpi"><div className="small muted">Comebacks across the squad</div><div className="v">{totals.comebacks}</div></div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>From club matches scored point by point. Tap a column to sort, and a name for that player’s details.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" aria-label="Squad" style={{ minWidth: 560 }}>
          <thead>
            <tr>{cols.map((c) => (
              <th key={c.key} aria-sort={sort === c.key ? 'descending' : 'none'}>
                <button type="button" className="link-btn" style={{ padding: 0, fontSize: 12, fontWeight: sort === c.key ? 700 : 500 }} onClick={() => setSort(c.key)}>{c.label}</button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.playerId}>
                <td><button type="button" className="link-btn" style={{ padding: 0, textAlign: 'left' }} onClick={() => go('club-player', r.playerId)}>{r.name}</button></td>
                <td>{r.matches}</td><td>{pct(r.winPct)}</td><td>{pct(r.closePct)}</td><td>{r.comebacks}</td><td>{r.lostLeads}</td><td>{pct(r.closing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Members({ d, go, reload }: { d: ClubBundle; go: Go; reload: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const admin = isAdmin(d.role);
  const b = backend();
  const invite = appLink(`#/club-join/${d.club.inviteCode}`);
  async function act(f: () => Promise<void>, ok: string) { try { await f(); setMsg(ok); reload(); } catch (e) { setMsg(errorText(e)); } }
  return (
    <section className="section" aria-label="Members">
      {admin && b?.kind === 'server' && (
        <section className="card section">
          <h2 style={{ fontSize: 18 }}>Invite people</h2>
          <p className="small muted" style={{ margin: 0 }}>Anyone with this link can join as a player. You can make them a coach or admin after.</p>
          <button type="button" className="btn btn-outline" onClick={async () => setMsg(await shareLink(`Join ${d.club.name} on PICKLEQ`, invite))}>Share invite link</button>
        </section>
      )}
      {msg && <div role="status" className="msg msg-ok">{msg}</div>}
      <table className="table" aria-label="Members">
        <thead><tr><th>Name</th><th>Role</th></tr></thead>
        <tbody>
          {d.members.map((m) => (
            <tr key={m.userId}>
              <td>{m.name}</td>
              <td>
                {admin && m.role !== 'owner' && !m.userId.startsWith('sample-')
                  ? <select className="input" style={{ minHeight: 36, width: 'auto' }} aria-label={`Role for ${m.name}`} value={m.role}
                      onChange={(e) => act(() => (b as NonNullable<typeof b>).setRole(d.club.id, m.userId, e.target.value as Role), 'Role changed')}>
                      {(['admin', 'coach', 'player'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  : ROLE_LABEL[m.role]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.myPlayerId && <button type="button" className="banner-btn" style={{ background: 'var(--card)', color: 'var(--text)' }} onClick={() => go('club-sharing', d.myPlayerId)}><span>What this club can see about me</span><span>›</span></button>}
      {d.role !== 'owner' && b?.kind === 'server' && (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => act(async () => { await b.leaveClub(d.club.id); go('club', undefined, { replace: true }); }, 'You left the club')}>Leave this club</button>
      )}
    </section>
  );
}

export function PlayerView({ playerId, go, onBack }: { playerId: string; go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) throw new Error('Open Club mode first');
    for (const { club } of await b.myClubs()) {
      const bundle = await b.clubBundle(club.id);
      if (bundle.players.some((p) => p.id === playerId)) return bundle;
    }
    throw new Error('Player not found');
  }, [b, playerId]);
  const d = state.data;
  const p = d?.players.find((x) => x.id === playerId);
  const map = useMemo(() => new Map((d?.players ?? []).map((x) => [x.id, x])), [d]);
  const stats = useMemo(() => (d ? playerClubStats(playerId, d.matches, map, d.club.settings.thresholds) : null), [d, map, playerId]);
  const full = d && (isStaff(d.role) || d.myPlayerId === playerId);
  const flags = stats && full ? playerFlags(stats) : [];
  const summary = d?.summaries.find((x) => x.playerId === playerId);
  const recent = d ? playerMatches(playerId, d.matches).slice(0, 8) : [];
  const pct = (v: number | null) => (v === null ? '–' : `${v}%`);
  return (
    <main className="screen" aria-labelledby="player-title">
      <Header id="player-title" title={p?.name ?? 'Player'} onBack={onBack} />
      <Status error={state.error} loading={state.loading && !d} />
      {p && stats && (
        <>
          <p className="small muted" style={{ margin: 0 }}>DUPR singles {fmtRating(p.duprSingles)} · doubles {fmtRating(p.duprDoubles)} · {d?.club.name}</p>
          <div className="kpis">
            <div className="kpi"><div className="small muted">Club record</div><div className="v">{stats.record.wins}–{stats.record.losses}</div><div className="small muted">{pct(winRate(stats.record))} won</div></div>
            <div className="kpi"><div className="small muted">Close games (≤3)</div><div className="v">{stats.close.wins}–{stats.close.losses}</div></div>
            {full && <div className="kpi"><div className="small muted">Came back</div><div className="v">{stats.comebacks.length}</div></div>}
            {full && <div className="kpi"><div className="small muted">Lost a lead</div><div className="v">{stats.lostLeads.length}</div></div>}
            {full && <div className="kpi"><div className="small muted">Won after game point</div><div className="v">{stats.gamePoints.won}/{stats.gamePoints.had}</div></div>}
            {full && <div className="kpi"><div className="small muted">Saved opponent’s game point</div><div className="v">{stats.facedGamePoints.saved}/{stats.facedGamePoints.faced}</div></div>}
          </div>
          {full && (
            <section className="card section" aria-label="Notes for the coach">
              <h2 style={{ fontSize: 18 }}>From club matches</h2>
              <p className="small muted" style={{ margin: 0 }}>What happened in matches scored point by point ({stats.trackedGames} games). It doesn’t say why.</p>
              {flags.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nothing stands out yet{stats.matches < 4 ? ' (needs at least 4 matches)' : ''}.</p>}
              {flags.map((f, i) => (
                <div key={i} className={`notice ${f.kind === 'watch' ? 'notice-warn' : 'notice-ok'}`}><b>{f.kind === 'watch' ? 'Pattern to watch' : 'Strength'}:</b> {f.text}</div>
              ))}
              {stats.lostLeads.length > 0 && <SwingList title="Leads lost (score you led from)" swings={stats.lostLeads} />}
              {stats.comebacks.length > 0 && <SwingList title="Comebacks (score you came back from)" swings={stats.comebacks} />}
            </section>
          )}
          {full && (
            <section className="card section" aria-label="By opponent">
              <h2 style={{ fontSize: 18 }}>By opponent rating</h2>
              <div className="row"><span>Higher-rated</span><span>{stats.vs.stronger.wins}–{stats.vs.stronger.losses}</span></div>
              <div className="row"><span>Similar (±0.15)</span><span>{stats.vs.equal.wins}–{stats.vs.equal.losses}</span></div>
              <div className="row"><span>Lower-rated</span><span>{stats.vs.weaker.wins}–{stats.vs.weaker.losses}</span></div>
              {stats.partners.length > 0 && <>
                <h3 style={{ fontSize: 16, marginTop: 8 }}>Partners</h3>
                {stats.partners.slice(0, 5).map((x) => <div key={x.playerId} className="row"><span>{map.get(x.playerId)?.name}</span><span>{x.record.wins}–{x.record.losses}</span></div>)}
              </>}
            </section>
          )}
          {summary && <SharedSummaryCard data={summary.data} updatedAt={summary.updatedAt} />}
          <section className="section" aria-label="Recent club matches">
            <h2 style={{ fontSize: 18 }}>Recent club matches</h2>
            {recent.map((m) => {
              const side = sideOf(m, playerId);
              const won = m.winner === side;
              return (
                <div key={m.id} className="match-row">
                  <span className={`result ${won ? 'result-w' : 'result-l'}`}>{won ? 'W' : 'L'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block' }}>vs {names(side === 'A' ? m.sideB : m.sideA, map)}</span>
                    <span className="small muted">{m.playedOn} · {STAGE_LABEL[m.stage]} · {scoreLine({ outcome: 'played', games: m.games.map((g) => ({ you: side === 'A' ? g.a : g.b, them: side === 'A' ? g.b : g.a, momentum: 'neither' })) })}</span>
                  </span>
                </div>
              );
            })}
          </section>
          {d?.myPlayerId === playerId && <button type="button" className="btn btn-outline" onClick={() => go('club-sharing', playerId)}>What this club can see about me</button>}
        </>
      )}
    </main>
  );
}

function SwingList({ title, swings }: { title: string; swings: Swing[] }) {
  const top = biggest(swings);
  return (
    <div>
      <div className="label">{title}</div>
      <div className="meta">{swings.slice(0, 8).map((s, i) => <span key={i} className={`pill${s === top ? ' pill-warn' : ''}`}>{s.me}–{s.them}</span>)}</div>
    </div>
  );
}

function SharedSummaryCard({ data, updatedAt }: { data: SummaryData; updatedAt: string }) {
  return (
    <section className="card section" aria-label="Shared from personal PICKLEQ">
      <h2 style={{ fontSize: 18 }}>Shared from their personal PICKLEQ</h2>
      <p className="small muted" style={{ margin: 0 }}>The player chose to share these numbers on {updatedAt.slice(0, 10)}.</p>
      {data.record && <div className="row"><span>All matches</span><span>{data.record.wins}–{data.record.matches - data.record.wins} · close games {data.record.closeWins}–{data.record.closeLosses}</span></div>}
      {data.tags?.slice(0, 4).map((t) => <div key={t.tag} className="row"><span>{t.tag}: needs work</span><span>in {t.inLosses} of {t.losses} losses, {t.inWins} of {t.wins} wins</span></div>)}
      {data.training && <>
        <div className="row"><span>Training, last 30 days</span><span>{data.training.hours30d} h · {data.training.sessions30d} sessions</span></div>
        {data.training.drills.slice(0, 4).map((x) => <div key={x.category} className="row"><span>{x.category}</span><span>{x.attempts ? Math.round((x.made / x.attempts) * 100) : 0}% ({x.made}/{x.attempts})</span></div>)}
      </>}
    </section>
  );
}

const SHARE_ITEMS: { key: keyof Share; label: string; detail: string }[] = [
  { key: 'record', label: 'My overall record', detail: 'Wins and losses, singles and doubles, close games' },
  { key: 'tags', label: 'What needs work', detail: 'How often each tag appears in your wins and losses' },
  { key: 'training', label: 'My training', detail: 'Hours and drill success in the last 30 days' },
];

export function Sharing({ playerId, go, onBack }: { playerId: string; go: Go; onBack: () => void }) {
  const b = backend();
  const state = useLoad(async () => {
    if (!b) throw new Error('Open Club mode first');
    for (const { club } of await b.myClubs()) {
      const bundle = await b.clubBundle(club.id);
      const p = bundle.players.find((x) => x.id === playerId);
      if (p) return { bundle, p };
    }
    throw new Error('Player not found');
  }, [b, playerId]);
  const [choice, setChoice] = useState<Share | null>(null);
  const [preview, setPreview] = useState<SummaryData | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const share = choice ?? state.data?.p.share ?? {};
  const any = !!(share.record || share.tags || share.training);
  async function showPreview(next: Share) { setChoice(next); setPreview(await mySummary(next)); }
  async function send() {
    if (!b) return;
    try {
      await b.setMySharing(playerId, share);
      if (any) await b.shareMySummary(playerId, preview ?? await mySummary(share));
      setMsg(any ? 'Shared with your club. You can change this any time.' : 'You’re not sharing anything from your personal app.');
      state.reload();
    } catch (e) { setMsg(errorText(e)); }
  }
  const clubName = state.data?.bundle.club.name ?? 'your club';
  return (
    <main className="screen" aria-labelledby="sharing-title">
      <Header id="sharing-title" title="What my club sees" onBack={onBack} />
      <Status error={state.error} loading={state.loading && !state.data} />
      {state.data && (
        <>
          <section className="card section">
            <p style={{ margin: 0 }}><b>Always shared with {clubName}:</b> your name, ratings the club entered, and club matches you play.</p>
            <p className="small muted" style={{ margin: 0 }}>Your personal PICKLEQ (your own matches, notes and coach chats) stays on this phone. Below, you can choose to share a few numbers from it with your coaches.</p>
          </section>
          <section className="section" aria-label="Choose what to share">
            {SHARE_ITEMS.map((it) => (
              <label key={it.key} className="check-row">
                <input type="checkbox" checked={!!share[it.key]} onChange={(e) => showPreview({ ...share, [it.key]: e.target.checked })} />
                <span><span style={{ display: 'block' }}>{it.label}</span><span className="small muted">{it.detail}</span></span>
              </label>
            ))}
          </section>
          {preview && any && <SharedSummaryCard data={preview} updatedAt={preview.generatedAt} />}
          {preview && any && <p className="small muted" style={{ margin: 0 }}>This is exactly what your coaches will see.</p>}
          {msg && <div role="status" className="msg msg-ok">{msg}</div>}
          <button type="button" className="btn btn-primary" onClick={send}>{any ? 'Share these numbers' : 'Save: share nothing'}</button>
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('club-view', state.data!.bundle.club.id)}>Back to the club</button>
        </>
      )}
    </main>
  );
}
