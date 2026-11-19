import { useState } from 'react';
import { pct, type Range, type TypeFilter } from '../../../domain/stats';
import type { WinLoss } from '../../../domain/record';
import { studioCoach, studioStats, type Source } from '../../playerStudio';
import { Card, Evidence, plural, Seg, type SectionProps } from './shared';

const rec = (r: WinLoss) => `${r.wins}–${r.losses}${pct(r) !== null ? ` (${pct(r)}%)` : ''}`;
const n = (r: WinLoss) => r.wins + r.losses;

export function StudioStats({ data }: SectionProps) {
  const [source, setSource] = useState<Source>('all');
  const [range, setRange] = useState<Range>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const st = studioStats(data, { source, range, type });
  const s = st.summary;
  const officialOff = source === 'all' && !data.settings.useOfficial;
  return <>
    <section className="section pq-filters" aria-label="Filters">
      <Seg label="Source" value={source} options={[{ value: 'all', label: 'All' }, { value: 'official', label: 'Official' }, { value: 'diary', label: 'My logs' }]} onChange={setSource} />
      <Seg label="Period" value={range} options={[{ value: 'last10', label: 'Last 10' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }, { value: 'all', label: 'All time' }]} onChange={setRange} />
      <Seg label="Match type" value={type} options={[{ value: 'all', label: 'All' }, { value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} onChange={setType} />
      {officialOff && <p className="small muted" style={{ margin: 0 }}>Official results are switched off for Stats in Profile.</p>}
    </section>
    {s.matches === 0 ? <p className="small muted">No matches for these filters yet.</p> : <>
      <Card title="Record" action={source === 'all' ? undefined : <Evidence measured={source === 'official'} />}>
        <p className="pq-big-number" aria-label={`Win rate ${st.winPct ?? 0} percent`}>{st.winPct ?? 0}%</p>
        <p style={{ margin: 0 }}>{s.record.wins} won, {s.record.losses} lost · games {rec(s.games)}</p>
        <p className="small" style={{ margin: 0 }} aria-label="Form, newest first">Form: {st.form.join(' ')}</p>
        {s.pointsFor !== null && <p className="small muted" style={{ margin: 0 }}>Average game: {s.pointsFor}–{s.pointsAgainst}</p>}
        {source !== 'official' && <p className="small muted" style={{ margin: 0 }}>Diary scores are self-reported.</p>}
      </Card>
      <Card title="Where you win">
        <table className="table" aria-label="Record by split"><tbody>
          <tr><th scope="row">Singles</th><td>{rec(st.splits.byType.singles)}</td></tr>
          <tr><th scope="row">Doubles</th><td>{rec(st.splits.byType.doubles)}</td></tr>
          {n(st.splits.byType.mixed) > 0 && <tr><th scope="row">Mixed</th><td>{rec(st.splits.byType.mixed)}</td></tr>}
          <tr><th scope="row">Tournament</th><td>{rec(st.splits.byCategory.tournament)}</td></tr>
          <tr><th scope="row">Casual</th><td>{rec(st.splits.byCategory.casual)}</td></tr>
          <tr><th scope="row">Practice</th><td>{rec(st.splits.byCategory.practice)}</td></tr>
          <tr><th scope="row">Close games (3 or fewer)</th><td>{rec(s.closeGames)}</td></tr>
          {(['stronger', 'equal', 'weaker'] as const).filter((k) => n(st.splits.byStrength[k]) > 0).map((k) => <tr key={k}><th scope="row">Against {k === 'equal' ? 'even' : k} players</th><td>{rec(st.splits.byStrength[k])}</td></tr>)}
        </tbody></table>
        {st.splits.strengthUnknown > 0 && <p className="small muted" style={{ margin: 0 }}>Opponent strength unknown for {st.splits.strengthUnknown}. Add your DUPR in Profile or mark strength when you log.</p>}
      </Card>
      {s.trackedGames > 0 && <Card title="Momentum" action={<Evidence measured />}>
        <p style={{ margin: 0 }}>{plural(s.comebacks, 'comeback')} · {plural(s.lostLeads, 'lost lead')} · {s.dominated} led all the way, in {plural(s.trackedGames, 'game')} scored point by point.</p>
        {s.biggestComeback && <p className="small" style={{ margin: 0 }}>Biggest comeback from {s.biggestComeback.from}.</p>}
      </Card>}
      {st.energy.some((e) => n(e.record) > 0) && <Card title="Energy" action={<Evidence measured={false} />}>
        <table className="table" aria-label="Record by energy"><tbody>{st.energy.filter((e) => n(e.record) > 0).map((e) => <tr key={e.level}><th scope="row">Energy {e.level}</th><td>{rec(e.record)}</td></tr>)}</tbody></table>
      </Card>}
      {st.opponents.length > 0 && <Card title="Head to head">
        <table className="table" aria-label="Head to head"><tbody>{st.opponents.map((o) => <tr key={o.name}><th scope="row">{o.name}</th><td>{rec(o.record)}</td></tr>)}</tbody></table>
      </Card>}
      {st.partners.length > 0 && <Card title="Partners">
        <table className="table" aria-label="Partners"><tbody>{st.partners.map((o) => <tr key={o.name}><th scope="row">{o.name}</th><td>{rec(o.record)}</td></tr>)}</tbody></table>
      </Card>}
      {st.trend.length > 1 && <Card title="Win rate over time">
        <p className="small" style={{ margin: 0 }}>Over your last 10 matches: {st.trend[st.trend.length - 1].pct}% now, {st.trend[0].pct}% at the start of this period.</p>
      </Card>}
    </>}
    {st.ratings.length > 0 && <Card title="How your shots feel" action={<Evidence measured={false} />}>
      <table className="table" aria-label="Shot self-ratings"><tbody>{st.ratings.map((r) => <tr key={r.shot}><th scope="row">{r.shot}</th><td>{r.average} / 5 ({r.n})</td></tr>)}</tbody></table>
    </Card>}
  </>;
}

export function StudioCoach({ data, go }: SectionProps) {
  const cards = studioCoach(data);
  const measured = cards.filter((c) => c.evidence === 'measured');
  const mine = cards.filter((c) => c.evidence === 'self-reported');
  const KIND = { watch: 'Worth a look', strength: 'Strength', progress: 'Progress' } as const;
  const list = (cs: typeof cards) => cs.map((c) => <article key={c.id} className="card section" aria-label={KIND[c.kind]}>
    <span className={`pill${c.kind === 'watch' ? ' pill-warn' : ' pill-ok'}`}>{KIND[c.kind]}</span>
    <p style={{ margin: 0 }}>{c.text}</p>
    {c.question && <p className="small" style={{ margin: 0 }}><b>Ask your coach:</b> {c.question}</p>}
  </article>);
  return <>
    <p className="small muted" style={{ margin: 0 }}>Coach notes say what was recorded, never why. Measured notes come from official results and counted drills. Your estimates come from your diary and 1–5 ratings: useful, but not proven.</p>
    <section className="section" aria-label="Measured">
      <h2 className="pq-kicker">MEASURED</h2>
      {measured.length ? list(measured) : <p className="small muted" style={{ margin: 0 }}>Needs 3 official matches, or a drill with 40 counted tries.</p>}
    </section>
    <section className="section" aria-label="Your estimates">
      <h2 className="pq-kicker">YOUR ESTIMATES (NOT PROVEN)</h2>
      {mine.length ? list(mine) : <p className="small muted" style={{ margin: 0 }}>Log a few matches with skill tags, or rate your shots after practice.</p>}
    </section>
    <div className="meta">
      <button type="button" className="btn btn-outline" onClick={() => go('club-player-studio', 'practice')}>Log practice</button>
      <button type="button" className="btn btn-outline" onClick={() => go('club-player-studio', 'log')}>Log a match</button>
    </div>
  </>;
}
