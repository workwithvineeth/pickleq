import type {CSSProperties} from 'react';
/** The RallyQ Q logo path (same as the brand mark). */
export const Q_PATH='M62 86H32A18 18 0 0 1 14 68V32A18 18 0 0 1 32 14H68A18 18 0 0 1 86 32V62';
/** One big Q off the top right of the page head (final prototype `svg.wm.motif`). Decorative only. */
export function Watermark({style}:{style?:CSSProperties}){
 return <svg className="wm motif" viewBox="0 0 100 100" aria-hidden="true" style={{['--c' as string]:'rgba(241,244,234,.07)',['--a' as string]:'rgba(217,242,74,.14)',...style}}><path d={Q_PATH} fill="none" style={{stroke:'var(--c)'}} strokeWidth="10"/><line x1="28" y1="50" x2="72" y2="50" style={{stroke:'var(--a)'}} strokeWidth="3"/><circle cx="83" cy="83" r="11" style={{fill:'var(--a)'}}/></svg>;
}
