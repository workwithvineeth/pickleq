import { useLiveQuery } from 'dexie-react-hooks';
import { backupDue, daysSince, lastBackupAt } from '../backup/status';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { MatchRow } from '../components/MatchRow';
import { RatingCards } from '../components/RatingCards';
import { InsightCard } from '../components/InsightCard';
import { Logo } from '../components/Logo';
import { db } from '../db/db';
import { activeSessions } from '../db/training';
import { streak, weekTraining } from '../domain/training';
import { useInsights } from '../hooks/useInsights';
import { channel } from '../config';
import { activeMatches } from '../db/matches';
import { recordSummary, winPct, type WinLoss } from '../domain/record';
import type { Go } from '../navigation';
import { NextTournamentCard } from './Tournaments';
import { lazy, Suspense } from 'react';
import { isClubEnabled } from '../club/config';

const ClubHomeCard = lazy(() => import('../club/screens/HomeCard'));

function today(): string {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function Split({ label, r }: { label: string; r: WinLoss }) {
  const pct = winPct(r);
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '6px 10px' }}>
      <div className="small muted">{label}</div>
      <div style={{ fontWeight: 600 }}>
        {r.wins}–{r.losses} {pct !== null && <span className="small muted" style={{ fontWeight: 400 }}>{pct}%</span>}
      </div>
    </div>
  );
}

export function Home({ go }: { go: Go }) {
  const matches = useLiveQuery(() => activeMatches(), []);
  const summary = recordSummary(matches ?? []);
  const pct = winPct(summary.overall);
  const sessions = useLiveQuery(() => activeSessions(), []) ?? [];
  const hoursGoal = useLiveQuery(async () => (await db.goals.toArray()).find((g) => g.kind === 'weekly-hours')?.target, []);
  const weekHours = Math.round((weekTraining(sessions).reduce((n, d) => n + d.minutes, 0) / 60) * 10) / 10;
  const run = streak(sessions);
  const top = useInsights()?.[0];
  const total = summary.overall.wins + summary.overall.losses;
  const last = lastBackupAt();
  const showBackup = backupDue(matches?.length ?? 0, last);
  const ago = daysSince(last);

  return (
    <main className="screen" aria-labelledby="home-title">
      <header className="header">
        <div className="brand-row">
          <Logo size={44} />
          <div>
            <h1 id="home-title" className="brand">PICKLEQ</h1>
            <div className="small muted">{today()}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {channel === 'preview' && <span className="badge badge-preview">Preview</span>}
          <button type="button" className="icon-btn" aria-label="Settings" onClick={() => go('settings')}>
            <Icon name="settings" size={20} />
          </button>
        </div>
      </header>

      {summary.incomplete > 0 && (
        <button type="button" className="banner-btn" onClick={() => go('matches', 'incomplete')}>
          <span>{summary.incomplete} {summary.incomplete === 1 ? 'match needs' : 'matches need'} details</span><span>Finish ›</span>
        </button>
      )}

      {showBackup && (
        <button type="button" className="banner-btn" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} onClick={() => go('backup')}>
          <span>{ago === null ? 'Matches not backed up yet' : `Last backup ${ago} days ago`}</span><span>Back up ›</span>
        </button>
      )}

      <section className="card" aria-label="Overall record">
        <div className="small muted">Overall record{total ? ` · ${total} ${total === 1 ? 'match' : 'matches'}` : ''}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600 }}>{summary.overall.wins}–{summary.overall.losses}</span>
          {pct !== null && <span className="muted">{pct}% won</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
          <Split label="Singles" r={summary.singles} />
          <Split label="Doubles" r={summary.doubles} />
        </div>
      </section>

      <RatingCards go={go} />

      <button type="button" className="rating-card" onClick={() => go('train')} aria-label={`Training this week: ${weekHours} hours. ${run}-day streak. Open training`}>
        <span className="header" style={{ width: '100%' }}>
          <span className="small muted">Training this week</span>
          <span className="small" style={{ color: 'var(--win-fg)', fontWeight: 600 }}>{run}-day streak</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600 }}>{weekHours} h</span>
          {hoursGoal ? <span className="small muted">of your {hoursGoal} h goal</span> : <span className="small muted">trained</span>}
        </span>
        {hoursGoal ? <span style={{ height: 6, background: 'var(--chart-grid)', borderRadius: 3, width: '100%', display: 'block' }}><span style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--chart-1)', width: `${Math.min(100, (weekHours / hoursGoal) * 100)}%` }} /></span> : null}
      </button>

      {matches && matches.length > 0 && (
        <section className="card" aria-label="Recent form">
          <div className="header" style={{ marginBottom: 8 }}>
            <span className="small muted">Form · last {Math.min(10, matches.length)}</span>
            <span className="small" style={{ fontWeight: 600 }}>
              {matches.slice(0, 10).filter((m) => m.won).length}–{matches.slice(0, 10).filter((m) => !m.won).length}
            </span>
          </div>
          <div className="formrow" role="list" aria-label="Most recent first">
            {matches.slice(0, 10).map((m) => (
              <span key={m.id} role="listitem" className="formchip" style={{ background: m.won ? 'var(--win-bg)' : 'var(--loss-bg)', color: m.won ? 'var(--win-fg)' : 'var(--loss-fg)' }}>{m.won ? 'W' : 'L'}</span>
            ))}
          </div>
        </section>
      )}

      {top && <InsightCard insight={top} action={<button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('coach')}>See all insights</button>} />}

      <NextTournamentCard go={go} />

      {isClubEnabled() && <Suspense fallback={null}><ClubHomeCard go={go} /></Suspense>}

      {matches && matches.length === 0 && (
        <EmptyState icon="ball" title="Log your first match"
          action={<button type="button" className="btn btn-primary" onClick={() => go('log')}>Log a match</button>}>
          Your ratings, form, training and insights fill in here as you play.
        </EmptyState>
      )}

      {matches && matches.length > 0 && (
        <section className="section" aria-label="Recent matches">
          <div className="header"><h2 style={{ fontSize: 18 }}>Recent matches</h2><button type="button" className="link-btn" onClick={() => go('matches')}>See all</button></div>
          {matches.slice(0, 3).map((m) => <MatchRow key={m.id} match={m} onOpen={() => go('match', m.id)} />)}
        </section>
      )}
    </main>
  );
}
