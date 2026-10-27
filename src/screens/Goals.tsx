import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Chips, Field } from '../components/Controls';
import { Icon } from '../components/Icon';
import { db } from '../db/db';
import { addGoal, deleteGoal, drillNames, updateGoal } from '../db/training';
import { goalTitle } from '../domain/training';
import type { GoalKind, RatingKind } from '../domain/types';

const kinds: { value: GoalKind; label: string }[] = [
  { value: 'rating', label: 'DUPR rating' }, { value: 'weekly-hours', label: 'Hours per week' }, { value: 'drill-rate', label: 'Drill success' },
  { value: 'streak', label: 'Training streak' }, { value: 'tournament', label: 'Tournament result' },
];

export function Goals({ onBack }: { onBack: () => void }) {
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? [];
  const names = useLiveQuery(() => drillNames(), []) ?? [];
  const [kind, setKind] = useState<GoalKind>('weekly-hours');
  const [ratingKind, setRatingKind] = useState<RatingKind>('doubles');
  const [drill, setDrill] = useState<string>('Third-shot drops');
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (kind === 'tournament') {
      if (!text.trim()) return setError('Describe the result you’re aiming for');
      await addGoal({ kind, target: 0, text: text.trim() });
    } else {
      const n = Number(target);
      const bad = !target.trim() || !Number.isFinite(n) || n <= 0
        || (kind === 'rating' && (n < 1 || n > 8)) || (kind === 'drill-rate' && n > 100) || (kind === 'weekly-hours' && n > 60) || (kind === 'streak' && !Number.isInteger(n));
      if (bad) return setError(kind === 'rating' ? 'Enter a DUPR rating between 1 and 8' : kind === 'drill-rate' ? 'Enter a percentage up to 100' : kind === 'streak' ? 'Enter a whole number of days' : 'Enter a number of hours up to 60');
      if (kind === 'weekly-hours' && goals.some((g) => g.kind === 'weekly-hours')) return setError('You already have a weekly hours goal. Remove it first');
      await addGoal({ kind, target: n, ratingKind: kind === 'rating' ? ratingKind : undefined, drillCategory: kind === 'drill-rate' ? drill : undefined });
    }
    setTarget('');
    setText('');
    setError(null);
  }

  const placeholder = kind === 'rating' ? '4.00' : kind === 'weekly-hours' ? '6' : kind === 'drill-rate' ? '80' : '14';
  const unit = kind === 'weekly-hours' ? 'Hours per week' : kind === 'drill-rate' ? 'Target success %' : kind === 'streak' ? 'Days in a row' : 'Target rating';

  return (
    <main className="screen" aria-labelledby="goals-title">
      <header className="header">
        <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
        <h1 id="goals-title" className="screen-title" style={{ flex: 1 }}>Goals</h1>
      </header>

      <section className="card section" aria-label="Your goals">
        {goals.length === 0 && <p className="small muted" style={{ margin: 0 }}>No goals yet.</p>}
        {goals.map((g) => (
          <div key={g.id} className="kv" style={{ alignItems: 'center' }}>
            <span>{goalTitle(g)}</span>
            <span style={{ display: 'flex', gap: 10 }}>
              {g.kind === 'tournament' && (
                <button type="button" className="link-btn" onClick={() => updateGoal(g.id, { achieved: !g.achieved })}>{g.achieved ? 'Mark not done' : 'Mark done'}</button>
              )}
              <button type="button" className="link-btn" aria-label={`Remove goal: ${goalTitle(g)}`} onClick={() => deleteGoal(g.id)}>Remove</button>
            </span>
          </div>
        ))}
      </section>

      <section className="card section" aria-label="Add a goal">
        <h2 style={{ fontSize: 18 }}>Add a goal</h2>
        <Chips label="Goal type" value={kind} options={kinds} onChange={(k) => { setKind(k); setError(null); }} />
        {kind === 'rating' && <Chips label="Which rating" value={ratingKind} options={[{ value: 'singles' as RatingKind, label: 'Singles' }, { value: 'doubles' as RatingKind, label: 'Doubles' }]} onChange={setRatingKind} />}
        {kind === 'drill-rate' && (
          <Field label="Drill">
            <select className="input" aria-label="Drill" value={drill} onChange={(e) => setDrill(e.target.value)}>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        )}
        {kind === 'tournament' ? (
          <Field label="What are you aiming for?">
            <input className="input" aria-label="Tournament goal" placeholder="Medal at Bengaluru Open" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        ) : (
          <Field label={unit}>
            <input className="input" aria-label={unit} inputMode="decimal" placeholder={placeholder} value={target} onChange={(e) => { setTarget(e.target.value); setError(null); }} />
          </Field>
        )}
        {error && <div role="status" className="msg msg-bad">{error}</div>}
        <button type="button" className="btn btn-primary" onClick={save}>Add goal</button>
      </section>
    </main>
  );
}
