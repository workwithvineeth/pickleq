import { InsightCard } from '../components/InsightCard';
import { EmptyState } from '../components/EmptyState';
import { useInsights } from '../hooks/useInsights';
import type { Go } from '../navigation';

export function Coach({ go }: { go: Go }) {
  const list = useInsights();
  const questions = (list ?? []).filter((i) => i.coachQuestion).slice(0, 5);
  return (
    <main className="screen" aria-labelledby="coach-title">
      <h1 id="coach-title" className="screen-title">Coach</h1>
      <div className="notice notice-warn">The Claude coach arrives in a later update. These built-in insights work offline and only describe what you’ve recorded. They don’t say why something happened.</div>

      {list && list.length === 0 && (
        <EmptyState icon="coach" title="Not enough data yet"
          action={<button type="button" className="btn btn-primary" onClick={() => go('log')}>Log a match</button>}>
          Insights appear once you’ve logged a few matches with tags and energy, or some training. Each one needs a minimum amount of data first.
        </EmptyState>
      )}

      {list && list.length > 0 && (
        <>
          <h2 style={{ fontSize: 18 }}>Insights · last 90 days</h2>
          {list.map((i) => <InsightCard key={i.id} insight={i} />)}
        </>
      )}

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
