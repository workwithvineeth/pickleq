import type { Rally } from './rallies';

const QPATH = 'M62 86H32A18 18 0 0 1 14 68V32A18 18 0 0 1 32 14H68A18 18 0 0 1 86 32V62';
const QPTS = (() => {
  const P: [number, number][] = [];
  const ln = (a: number, b: number, c: number, d: number) => {
    for (let k = 0; k <= 20; k++) P.push([a + (c - a) * k / 20, b + (d - b) * k / 20]);
  };
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let k = 0; k <= 16; k++) {
      const a = (a0 + (a1 - a0) * k / 16) * Math.PI / 180;
      P.push([cx + 18 * Math.cos(a), cy + 18 * Math.sin(a)]);
    }
  };
  ln(62, 86, 32, 86); arc(32, 68, 90, 180); ln(14, 68, 14, 32);
  arc(32, 32, 180, 270); ln(32, 14, 68, 14); arc(68, 32, 270, 360); ln(86, 32, 86, 62);
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return { P, L, T: L[L.length - 1] };
})();

function qAt(t: number) {
  const { P, L } = QPTS;
  let i = 1;
  while (i < L.length - 1 && L[i] < t) i++;
  const k = (t - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
  const x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k;
  const y = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k;
  const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1];
  const d = Math.hypot(dx, dy) || 1;
  let nx = dy / d, ny = -dx / d;
  if ((x - 50) * nx + (y - 50) * ny < 0) { nx = -nx; ny = -ny; }
  return { x, y, nx, ny };
}

export function LivingQ({ rallies, confirmed = false }: {
  rallies: readonly Rally[];
  confirmed?: boolean;
  winner?: Rally['winner'] | null;
}) {
  const n = Math.max(rallies.length, 32);
  return <svg viewBox="0 0 100 100">
    <path d={QPATH} fill="none" stroke="var(--ink)" strokeOpacity={confirmed ? .9 : .3} strokeWidth="3" />
    {rallies.map((r, i) => {
      const p = qAt((i + .5) / n * QPTS.T), o = r.winner === 'A' ? 1 : -1;
      const len = r.outcome === 'point' ? 10 : 4.5;
      const outcome = r.outcome === 'point' ? 'point' : r.outcome === 'side_out' ? 'side-out' : 'second server';
      return <line key={r.n} className={i === rallies.length - 1 ? 'lqs' : undefined}
        x1={p.x.toFixed(1)} y1={p.y.toFixed(1)} x2={(p.x + p.nx * o * len).toFixed(1)} y2={(p.y + p.ny * o * len).toFixed(1)}
        stroke={r.winner === 'A' ? 'var(--sea)' : 'var(--tide)'} strokeWidth="3.2" strokeLinecap="round">
        <title>{`Rally ${r.n} · ${outcome} · ${r.before} → ${r.after}`}</title>
      </line>;
    })}
    <circle cx="83" cy="83" r="6" fill="var(--ball)" />
  </svg>;
}
