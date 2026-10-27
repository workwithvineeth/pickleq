import type { ReactNode } from 'react';
import type { Insight } from '../domain/insights';

const kindLabel = { watch: 'Pattern to watch', strength: 'Strength', progress: 'Progress' } as const;

export function InsightCard({ insight, action }: { insight: Insight; action?: ReactNode }) {
  return (
    <div className="card section" style={{ gap: 8 }}>
      <div className="meta" style={{ marginTop: 0 }}>
        <span className="pill">From your data</span>
        <span className={`pill ${insight.kind === 'watch' ? 'pill-warn' : 'pill-ok'}`}>{kindLabel[insight.kind]}</span>
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.45 }}>{insight.text}</div>
      {action}
    </div>
  );
}
