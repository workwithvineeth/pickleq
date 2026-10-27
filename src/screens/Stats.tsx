import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Chips, Segmented } from '../components/Controls';
import { EmptyState } from '../components/EmptyState';
import { shortDate } from '../components/MatchRow';
import { activeMatches } from '../db/matches';
import { ratingHistory } from '../db/ratings';
import type { WinLoss } from '../domain/record';
import {
  byEnergy, filterMatches, form, headToHead, partners, pct, rollingWinPct, splits, summarize,
  type PersonRecord, type Range, type TypeFilter,
} from '../domain/stats';
import type { RatingEntry } from '../domain/types';
import type { Go } from '../navigation';

const ranges: { value: Range; label: string }[] = [
  { value: 'last10', label: 'Last 10' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }, { value: 'all', label: 'All time' },
];

const tooltipStyle = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)' },
  labelStyle: { color: 'var(--muted)' },
};

const rec = (r: WinLoss) => `${r.wins}–${r.losses}`;

function HBar({ label, r }: { label: string; r: WinLoss }) {
  const p = pct(r);
  return (
    <div className="hbar" role="listitem" aria-label={`${label}: ${p === null ? 'no matches' : `${p}% won, ${rec(r)}`}`}>
      <span>{label}</span>
      <span className="track" aria-hidden="true"><span className="fill" style={{ display: 'block', width: `${p ?? 0}%` }} /></span>
      <span className="val">{p === null ? <span className="muted">—</span> : <><b style={{ fontWeight: 600 }}>{p}%</b> <span className="muted">{rec(r)}</span></>}</span>
    </div>
  );
}

function PeopleTable({ title, rows, empty }: { title: string; rows: PersonRecord[]; empty: string }) {
  return (
    <section className="chart-card" aria-label={title}>
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{empty}</p> : (
        <table className="table">
          <thead><tr><th scope="col">Name</th><th scope="col">Record</th><th scope="col">Win %</th></tr></thead>
          <tbody>{rows.slice(0, 6).map((p) => <tr key={p.name}><td>{p.name}</td><td>{rec(p.record)}</td><td>{pct(p.record)}%</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}

function mergeRatings(singles: RatingEntry[], doubles: RatingEntry[], show: TypeFilter) {
  const byDate = new Map<string, { date: string; singles?: number; doubles?: number }>();
  const put = (list: RatingEntry[], key: 'singles' | 'doubles') => {
    for (const r of list) {
      const row = byDate.get(r.date) ?? { date: r.date };
      row[key] = r.value;
      byDate.set(r.date, row);
    }
  };
  if (show !== 'doubles') put(singles, 'singles');
  if (show !== 'singles') put(doubles, 'doubles');
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function Stats({ go }: { go: Go }) {
  const [range, setRange] = useState<Range>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const all = useLiveQuery(() => activeMatches(), []);
  const singlesR = useLiveQuery(() => ratingHistory('singles'), []) ?? [];
  const doublesR = useLiveQuery(() => ratingHistory('doubles'), []) ?? [];

  if (all === undefined) return <main className="screen"><h1 className="screen-title">Stats</h1></main>;
  if (all.length === 0) {
    return (
      <main className="screen">
        <h1 className="screen-title">Stats</h1>
        <EmptyState icon="stats" title="No stats yet" action={<button type="button" className="btn btn-primary" onClick={() => go('log')}>Log a match</button>}>
          Win rates, rating trends and charts appear after your first few matches.
        </EmptyState>
      </main>
    );
  }

  const matches = filterMatches(all, { range, type });
  const s = summarize(matches);
  const sp = splits(matches, singlesR, doublesR);
  const energy = byEnergy(matches);
  const rolling = rollingWinPct(matches);
  const ratingRows = mergeRatings(singlesR, doublesR, type);
  const close = pct(s.closeGames);
  const energyKnown = energy.reduce((n, e) => n + e.record.wins + e.record.losses, 0);

  return (
    <main className="screen" aria-labelledby="stats-title">
      <h1 id="stats-title" className="screen-title">Stats</h1>
      <Segmented label="Match type" value={type} onChange={setType}
        options={[{ value: 'all', label: 'All' }, { value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} />
      <Chips label="Time range" value={range} options={ranges} onChange={setRange} />

      {matches.length === 0 ? <p className="muted">No matches in this range.</p> : (
        <>
          <div className="kpis">
            <div className="kpi"><div className="small muted">Win rate</div><div className="v">{pct(s.record)}%</div><div className="small muted">{rec(s.record)} · {s.matches} matches</div></div>
            <div className="kpi"><div className="small muted">Close games (≤3)</div><div className="v">{close === null ? '—' : `${close}%`}</div><div className="small muted">{rec(s.closeGames)} games</div></div>
            <div className="kpi"><div className="small muted">Points per game</div><div className="v">{s.pointsFor === null ? '—' : s.pointsFor.toFixed(1)}–{s.pointsAgainst === null ? '—' : s.pointsAgainst.toFixed(1)}</div><div className="small muted">for – against, average</div></div>
            <div className="kpi"><div className="small muted">Comebacks</div><div className="v">{s.comebacks}</div><div className="small muted">{s.biggestComeback ? `biggest from ${s.biggestComeback.from}` : `of ${s.trackedGames} tracked games`}</div></div>
            <div className="kpi"><div className="small muted">Lost leads</div><div className="v">{s.lostLeads}</div><div className="small muted">{s.biggestLostLead ? `biggest from ${s.biggestLostLead.from}` : `of ${s.trackedGames} tracked games`}</div></div>
            <div className="kpi"><div className="small muted">Dominated games</div><div className="v">{s.dominated}</div><div className="small muted">of {s.games.wins} games won</div></div>
          </div>

          <section className="chart-card" aria-label="Recent form">
            <h2>Form · last {Math.min(10, matches.length)}</h2>
            <div className="formrow" role="list" aria-label="Most recent first">
              {form(matches).map((r, i) => (
                <span key={i} role="listitem" className="formchip" style={{ background: r === 'W' ? 'var(--win-bg)' : 'var(--loss-bg)', color: r === 'W' ? 'var(--win-fg)' : 'var(--loss-fg)' }}>{r}</span>
              ))}
            </div>
            <span className="small muted">Most recent on the left.</span>
          </section>

          {rolling.length >= 2 && (
            <section className="chart-card" aria-label="Win rate trend">
              <h2>Win rate trend</h2>
              <span className="small muted">Win % over your previous 10 matches, at each match.</span>
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rolling} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                    <ReferenceLine y={50} stroke="var(--chart-axis)" strokeDasharray="3 3" />
                    <Tooltip {...tooltipStyle} labelFormatter={(d) => shortDate(String(d))} formatter={(v, _n, item) => [`${v}% (last ${item.payload.n})`, 'Win rate']} />
                    <Line type="monotone" dataKey="pct" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section className="chart-card" aria-label="DUPR rating trend">
            <h2>DUPR rating trend</h2>
            {ratingRows.length < 2 ? (
              <p className="small muted" style={{ margin: 0 }}>Add at least two ratings to see a trend. <button type="button" className="link-btn" onClick={() => go('ratings')}>Add rating</button></p>
            ) : (
              <>
                <div className="legend" aria-hidden="true">
                  {type !== 'doubles' && singlesR.length > 0 && <span><i style={{ background: 'var(--chart-2)' }} />Singles {singlesR.at(-1)!.value.toFixed(2)}</span>}
                  {type !== 'singles' && doublesR.length > 0 && <span><i style={{ background: 'var(--chart-1)' }} />Doubles {doublesR.at(-1)!.value.toFixed(2)}</span>}
                </div>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ratingRows} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis domain={['dataMin - 0.05', 'dataMax + 0.05']} tickFormatter={(v: number) => v.toFixed(2)} tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} tickCount={4} />
                      <Tooltip {...tooltipStyle} labelFormatter={(d) => shortDate(String(d))} formatter={(v, n) => [Number(v).toFixed(3), n === 'singles' ? 'Singles' : 'Doubles']} />
                      {type !== 'doubles' && <Line type="monotone" dataKey="singles" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />}
                      {type !== 'singles' && <Line type="monotone" dataKey="doubles" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </section>

          <section className="chart-card" aria-label="Win rate by situation">
            <h2>Win % by situation</h2>
            {type === 'all' && (
              <>
                <div className="small muted">Match type</div>
                <div role="list" className="section" style={{ gap: 6 }}>
                  <HBar label="Singles" r={sp.byType.singles} /><HBar label="Doubles" r={sp.byType.doubles} /><HBar label="Mixed" r={sp.byType.mixed} />
                </div>
              </>
            )}
            <div className="small muted">Category</div>
            <div role="list" className="section" style={{ gap: 6 }}>
              <HBar label="Casual" r={sp.byCategory.casual} /><HBar label="Practice" r={sp.byCategory.practice} /><HBar label="Tournament" r={sp.byCategory.tournament} />
            </div>
            <div className="small muted">Opponent strength</div>
            <div role="list" className="section" style={{ gap: 6 }}>
              <HBar label="Stronger" r={sp.byStrength.stronger} /><HBar label="Even" r={sp.byStrength.equal} /><HBar label="Weaker" r={sp.byStrength.weaker} />
            </div>
            <span className="small muted">
              Strength uses the DUPR gap (more than 0.15 either way) when both ratings are known, otherwise your tag.
              {sp.strengthUnknown > 0 && ` ${sp.strengthUnknown} ${sp.strengthUnknown === 1 ? 'match has' : 'matches have'} no rating or tag.`}
            </span>
          </section>

          <section className="chart-card" aria-label="Win rate by energy level">
            <h2>Energy vs win %</h2>
            {energyKnown === 0 ? <p className="small muted" style={{ margin: 0 }}>Add energy levels to your matches to see this.</p> : (
              <>
                <div className="cols" role="list">
                  {energy.map((e) => {
                    const n = e.record.wins + e.record.losses;
                    const p = pct(e.record);
                    return (
                      <div key={e.level} className="col" role="listitem" aria-label={`Energy ${e.level}: ${p === null ? 'no matches' : `${p}% won from ${n}`}`}>
                        <b style={{ fontWeight: 600 }}>{p === null ? '—' : `${p}%`}</b>
                        <div className={`bar${n < 3 ? ' thin' : ''}`} style={{ height: `${p === null ? 0 : Math.max(2, p * 0.9)}px` }} />
                        <span className="muted">{e.level} · n={n}</span>
                      </div>
                    );
                  })}
                </div>
                <span className="small muted">Energy 1 = drained, 5 = sharp. Faded bars have fewer than 3 matches, so read them with caution. Bar height is win %, not match count.</span>
              </>
            )}
          </section>

          <PeopleTable title="Head-to-head" rows={headToHead(matches)} empty="Name your opponents when logging to see this." />
          {type !== 'singles' && <PeopleTable title="Best partners" rows={partners(matches)} empty="Name your doubles partners to see this." />}
        </>
      )}
    </main>
  );
}
