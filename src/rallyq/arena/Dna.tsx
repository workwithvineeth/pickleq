import { currentRun } from './rallies';
import type { Rally } from './rallies';

export function Dna({ rallies }: { rallies: readonly Rally[] }) {
  const run = currentRun(rallies);
  return <div className="dna">
    {rallies.map((r, i) => {
      const outcome = r.outcome === 'point' ? 'point' : r.outcome === 'side_out' ? 'side-out' : 'second server';
      const classes = [r.winner === 'A' ? 'a' : 'b'];
      if (r.outcome !== 'point') classes.push('so');
      if (run && run.count >= 3 && i >= rallies.length - run.count) classes.push('run');
      // the current serve turn: the points won in a row by the side serving now (ball green on the board)
      if (run && run.count >= 1 && i >= rallies.length - run.count) classes.push('turn');
      if (i === rallies.length - 1) classes.push('now');
      return <i key={r.n} className={classes.join(' ')} title={`Rally ${r.n} · ${outcome} · ${r.before} → ${r.after}`} />;
    })}
  </div>;
}
