import { useEffect, useState } from 'react';

/** Counts up from 0 to the number once, when it first appears (motion board: Studio and Home totals).
 *  Keeps any formatting such as "1,003" or "12–10"; reduced motion shows the number straight away. */
export function CountUp({ text, ms = 700 }: { text: string; ms?: number }) {
  const m = /^(\D*)(\d[\d,]*)(.*)$/.exec(text);
  const target = m ? Number(m[2].replace(/,/g, '')) : NaN;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [v, setV] = useState(() => (reduced || !Number.isFinite(target) ? target : 0));
  useEffect(() => {
    if (reduced || !Number.isFinite(target)) { setV(target); return; }
    let raf = 0; const start = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms); setV(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  if (!m) return <>{text}</>;
  const shown = m[2].includes(',') ? v.toLocaleString('en-IN') : String(v);
  return <span aria-label={text}><span aria-hidden="true">{m[1]}{shown}{m[3]}</span></span>;
}
