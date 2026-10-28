import { useLiveQuery } from 'dexie-react-hooks';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { InsightCard } from '../components/InsightCard';
import { shortDate } from '../components/MatchRow';
import { fmtInr, fmtUsd } from '../coach/cost';
import { loadKey, loadRate } from '../coach/key';
import { TASKS, taskInfo } from '../coach/tasks';
import { listConversations, summarizeUsage } from '../db/coach';
import { db } from '../db/db';
import { clipShotForInsight, shotSlug } from '../domain/clips';
import { useInsights } from '../hooks/useInsights';
import type { Go } from '../navigation';

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

export function Coach({ go }: { go: Go }) {
  const list = useInsights();
  const questions = (list ?? []).filter((i) => i.coachQuestion).slice(0, 5);
  const convs = useLiveQuery(() => listConversations(), []) ?? [];
  const usage = useLiveQuery(() => db.usage.toArray(), []) ?? [];
  const month = summarizeUsage(usage, monthStart());
  const hasKey = !!loadKey();
  const rate = loadRate();

  return (
    <main className="screen" aria-labelledby="coach-title">
      <div className="header">
        <h1 id="coach-title" className="screen-title">Coach</h1>
        <button type="button" className="icon-btn" aria-label="Coach settings" onClick={() => go('coach-settings')}><Icon name="settings" size={20} /></button>
      </div>

      <section className="card section" aria-label="Claude coach">
        <div>
          <h2 style={{ fontSize: 18 }}>Ask Claude</h2>
          <span className="small muted">{month.answers} {month.answers === 1 ? 'answer' : 'answers'} this month · {fmtInr(month.usd, rate)}</span>
        </div>
        {!hasKey ? (
          <>
            <p className="small muted" style={{ margin: 0 }}>Claude writes detailed coaching from your own records. It uses your own Claude API key, costing about ₹0.15–0.5 per answer.</p>
            <button type="button" className="btn btn-primary" onClick={() => go('coach-settings')}>Add your Claude key</button>
          </>
        ) : (
          <div className="task-grid">
            {TASKS.map((t) => (
              <button key={t.id} type="button" className="task-btn" onClick={() => go('coach-task', t.id)}>
                <b>{t.title}</b><span className="small muted">{t.blurb}</span>
              </button>
            ))}
          </div>
        )}
        {hasKey && <button type="button" className="btn btn-outline" onClick={() => go('report')}>Performance report (PDF)</button>}
        {hasKey && month.usd > 0 && <span className="small muted">This month so far: {fmtUsd(month.usd)} of your prepaid credit.</span>}
      </section>

      {convs.length > 0 && (
        <section className="section" aria-label="Saved conversations">
          <h2 style={{ fontSize: 18 }}>Saved conversations</h2>
          {convs.slice(0, 20).map((c) => (
            <button key={c.id} type="button" className="match-row" onClick={() => go('conversation', c.id)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{c.title}</span>
                  <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(new Date(c.updatedAt).toISOString().slice(0, 10))}</span>
                </span>
                <span className="small muted">{taskInfo(c.task).title} · {c.messages.filter((m) => m.role === 'assistant' && !m.error).length} {c.messages.filter((m) => m.role === 'assistant' && !m.error).length === 1 ? 'answer' : 'answers'}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      <h2 style={{ fontSize: 18 }}>Built-in insights · last 90 days</h2>
      <div className="notice notice-warn">These work offline and only describe what you’ve recorded. They don’t say why something happened.</div>

      {list && list.length === 0 && (
        <EmptyState icon="coach" title="Not enough data yet"
          action={<button type="button" className="btn btn-primary" onClick={() => go('log')}>Log a match</button>}>
          Insights appear once you’ve logged a few matches with tags and energy, or some training. Each one needs a minimum amount of data first.
        </EmptyState>
      )}
      {list?.map((i) => {
        const shot = clipShotForInsight(i.id);
        return <InsightCard key={i.id} insight={i} action={shot && i.kind === 'watch' ? (
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('clips', shotSlug(shot))}>Watch pro clips: {shot.toLowerCase()}</button>
        ) : undefined} />;
      })}

      {questions.length > 0 && (
        <section className="card section" aria-label="Questions for your coach">
          <h2 style={{ fontSize: 18 }}>To discuss with your coach</h2>
          <p className="small muted" style={{ margin: 0 }}>Your data shows these patterns. Your coach can tell you why.</p>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {questions.map((q) => <li key={q.id}>{q.coachQuestion}</li>)}
          </ol>
        </section>
      )}
    </main>
  );
}
