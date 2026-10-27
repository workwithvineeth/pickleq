import { useLiveQuery } from 'dexie-react-hooks';
import { EmptyState } from '../components/EmptyState';
import { shortDate } from '../components/MatchRow';
import { ProgressRing } from '../components/ProgressRing';
import { ratingHistory } from '../db/ratings';
import { activeSessions } from '../db/training';
import { db } from '../db/db';
import { drillStats, goalProgress, goalTitle, iso, streak, weekTraining } from '../domain/training';
import { SESSION_TYPES } from '../domain/types';
import type { Go } from '../navigation';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const sessionLabel = (t: string) => SESSION_TYPES.find((x) => x.value === t)?.label ?? t;

export function Train({ go }: { go: Go }) {
  const sessions = useLiveQuery(() => activeSessions(), []);
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? [];
  const singles = useLiveQuery(() => ratingHistory('singles'), []) ?? [];
  const doubles = useLiveQuery(() => ratingHistory('doubles'), []) ?? [];
  if (sessions === undefined) return <main className="screen"><h1 className="screen-title">Training</h1></main>;

  const today = new Date();
  const week = weekTraining(sessions, today);
  const weekMin = week.reduce((n, d) => n + d.minutes, 0);
  const hoursGoal = goals.find((g) => g.kind === 'weekly-hours')?.target;
  const maxMin = Math.max(90, ...week.map((d) => d.minutes));
  const run = streak(sessions, today);
  const drills = drillStats(sessions, iso(new Date(today.getTime() - 30 * 86_400_000)));
  const ctx = { today, sessions, singles, doubles };
  const todayIso = iso(today);

  return (
    <main className="screen" aria-labelledby="train-title">
      <div className="header">
        <h1 id="train-title" className="screen-title">Training</h1>
        <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} onClick={() => go('session-new')}>Log training</button>
      </div>

      <section className="chart-card" aria-label="This week">
        <div className="header">
          <h2>This week</h2>
          <span className="small"><b style={{ fontWeight: 600 }}>{Math.round((weekMin / 60) * 10) / 10} h</b>{hoursGoal ? <span className="muted"> of {hoursGoal} h</span> : ''}</span>
        </div>
        <div className="cols" role="list" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', height: 110 }}>
          {week.map((d, i) => (
            <div key={d.date} className="col" role="listitem" style={{ height: 110 }} aria-label={`${d.date}: ${d.rest ? 'rest day' : `${d.minutes} minutes`}`}>
              <span className="muted">{d.minutes ? `${Math.round((d.minutes / 60) * 10) / 10}h` : d.rest ? 'rest' : ''}</span>
              <div className="bar" style={{ height: `${d.minutes ? Math.max(4, (d.minutes / maxMin) * 70) : d.rest ? 10 : 2}px`, background: d.rest ? 'var(--chart-2)' : d.minutes ? 'var(--chart-1)' : 'var(--chart-grid)' }} />
              <span style={{ fontWeight: d.date === todayIso ? 700 : 400 }} className={d.date === todayIso ? '' : 'muted'}>{DAYS[i]}</span>
            </div>
          ))}
        </div>
        <div className="header small">
          <span className="legend"><span><i style={{ background: 'var(--chart-1)' }} />Training</span><span><i style={{ background: 'var(--chart-2)' }} />Rest day</span></span>
          <span style={{ color: 'var(--win-fg)', fontWeight: 600 }}>{run}-day streak</span>
        </div>
      </section>

      <section className="chart-card" aria-label="Goals">
        <div className="header"><h2>Goals</h2><button type="button" className="link-btn" onClick={() => go('goals')}>{goals.length ? 'Manage' : 'Add a goal'}</button></div>
        {goals.length === 0 && <p className="small muted" style={{ margin: 0 }}>Set a target for your rating, weekly hours, a drill, your streak or a tournament.</p>}
        {goals.map((g) => {
          const p = goalProgress(g, ctx);
          return (
            <div key={g.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <ProgressRing fraction={p.fraction} label={`${Math.round(p.fraction * 100)}% of the way`} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{goalTitle(g)} {p.done && <span className="pill pill-ok">Done</span>}</div>
                <div className="small muted">{p.current}</div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="chart-card" aria-label="Drill success, last 30 days">
        <div className="header"><h2>Drill success · 30 days</h2><span className="pill pill-ok">Measured</span></div>
        {drills.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Count makes and tries in your drills to see them here.</p> : (
          <div role="list" className="section" style={{ gap: 8 }}>
            {drills.map((d) => (
              <div key={d.category} className="hbar" role="listitem" style={{ gridTemplateColumns: '120px minmax(0,1fr) 92px' }} aria-label={`${d.category}: ${d.pct}%, ${d.made} of ${d.attempts}`}>
                <span>{d.category}</span>
                <span className="track" aria-hidden="true"><span className="fill" style={{ display: 'block', width: `${d.pct}%` }} /></span>
                <span className="val"><b style={{ fontWeight: 600 }}>{d.pct}%</b> <span className="muted">{d.made}/{d.attempts}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-label="Recent sessions">
        <h2 style={{ fontSize: 18 }}>Recent sessions</h2>
        {sessions.length === 0 ? (
          <EmptyState icon="train" title="No sessions yet" action={<button type="button" className="btn btn-primary" onClick={() => go('session-new')}>Log training</button>}>
            Log drills, coaching, fitness and rest days to track your training.
          </EmptyState>
        ) : sessions.slice(0, 12).map((s) => (
          <button key={s.id} type="button" className="match-row" onClick={() => go('session', s.id)}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 500 }}>{sessionLabel(s.type)}</span>
                <span className="small muted">{shortDate(s.date)}</span>
              </span>
              <span className="small muted" style={{ display: 'block' }}>
                {s.type === 'rest' ? 'Rest day' : `${s.minutes} min`}{s.intensity ? ` · intensity ${s.intensity}` : ''}{s.drills.length ? ` · ${s.drills.map((d) => `${d.category.toLowerCase()} ${d.made}/${d.attempts}`).join(', ')}` : ''}
              </span>
            </span>
          </button>
        ))}
      </section>
    </main>
  );
}
