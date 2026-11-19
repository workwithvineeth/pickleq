import type { CSSProperties, ReactNode } from 'react';

/**
 * Shared form parts that are not rebuilt yet (person fields, sheet import, format picker, poster picker) still use the
 * older class names. Inside a v1.2 shell, wrap them in <Legacy> so they take the RallyQ look (dark glass inputs,
 * quiet buttons) instead of the old one. Their old primary button becomes the white "alt" button: the page keeps one
 * ball-yellow button.
 */
const P = '.rallyq-prototype.rallyq-prototype .rq .lgc';
const RULES: [string, string][] = [
  ['.input', 'min-height:48px;width:100%;padding:0 14px;border-radius:14px;border:0;background:var(--c2);color:var(--ink);font:inherit;font-size:15px;box-shadow:inset 0 0 0 1px var(--line)'],
  ['.input::placeholder', 'color:var(--mut)'],
  ['.input:focus', 'outline:2px solid var(--ball);outline-offset:1px'],
  ['textarea.input', 'min-height:96px;padding:12px 14px'],
  ['select.input option', 'color:#0B2418;background:#F1F4EA'],
  ['input[type=file]', 'color:var(--mut);font:inherit;max-width:100%'],
  ['.btn.btn-outline', 'background:transparent;color:var(--ink)!important;box-shadow:inset 0 0 0 1px rgba(241,244,234,.28);border:0'],
  ['.btn.btn-primary', 'background:var(--ink);color:var(--on)!important;border:0'],
  ['.btn[disabled]', 'background:var(--c2)!important;color:var(--mut)!important;box-shadow:none'],
  ['.card', 'background:transparent;box-shadow:none;border:0;border-radius:0;padding:0;-webkit-backdrop-filter:none;backdrop-filter:none'],
  ['.section', 'display:flex;flex-direction:column;gap:10px;min-width:0'],
  ['.label', 'font-size:13px;font-weight:700;color:var(--ink);text-transform:none;letter-spacing:0'],
  ['.small', 'font-size:13px'],
  ['.muted', 'color:var(--mut)'],
  ['.seg', 'display:flex;gap:6px;flex-wrap:wrap;background:none;border:0;padding:0;box-shadow:none'],
  ['.seg button,.chips .chip', 'flex:0 1 auto;min-height:44px;padding:0 14px;border-radius:999px;border:0;font:inherit;font-weight:700;font-size:13px;cursor:pointer;background:var(--c1);color:var(--mut);box-shadow:inset 0 0 0 1px var(--line);text-transform:none;letter-spacing:0'],
  ['.seg button[aria-pressed=true],.chips .chip[aria-pressed=true]', 'background:var(--ink);color:var(--on)'],
  ['.chips', 'display:flex;gap:6px;flex-wrap:wrap'],
  ['.msg', 'border-radius:14px;padding:10px 14px;font-size:14px;background:none;color:var(--ink);border:0;box-shadow:inset 0 0 0 1px rgba(241,244,234,.3)'],
  ['.row', 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap'],
  ['.meta', 'display:flex;flex-wrap:wrap;gap:8px;align-items:center'],
  ['.link-btn', 'min-height:44px;font:inherit;font-weight:700;font-size:14px;color:var(--ink);border:0;background:none;padding:0;cursor:pointer;text-decoration:underline'],
  ['.table', 'width:100%;border-collapse:collapse;font-size:14px;color:var(--ink)'],
  ['.table th,.table td', 'padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;background:none;color:inherit'],
  ['fieldset', 'border:0;margin:0;padding:0;min-width:0'],
  ['h2,h3', 'margin:0;color:var(--ink)'],
  ['a', 'text-decoration:underline'],
  ['summary', 'min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:700'],
  ['.check-row', 'display:flex;align-items:center;gap:10px;min-height:44px'],
];
const CSS = RULES.map(([sel, body]) => `${sel.split(',').map((s) => `${P} ${s}`).join(',')}{${body}}`).join('');
/** With `cards`: older cards stay visible as v1.2 data-glass cards (for whole older screens, e.g. the admin dashboard). */
const CARDS: [string, string][] = [
  ['.card', 'background:var(--c1);border-radius:22px;padding:18px;box-shadow:inset 0 0 0 1px var(--line);display:flex;flex-direction:column;gap:10px;min-width:0'],
  ['.pill', 'display:inline-flex;align-items:center;min-height:26px;padding:0 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;background:var(--c2);color:var(--mut);white-space:nowrap'],
  ['.pill-ok', 'background:rgba(217,242,74,.14);color:var(--ball)'],
  ['.pill-warn,.pill-bad', 'background:var(--c2);color:var(--ink)'],
  ['.banner-btn', 'display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;min-height:56px;padding:0 18px;border-radius:18px;border:0;background:var(--c1);color:var(--ink);font:inherit;font-weight:700;box-shadow:inset 0 0 0 1px var(--line);cursor:pointer'],
  ['.match-row', 'display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:10px 14px;border-radius:16px;border:0;background:var(--c2);color:var(--ink);font:inherit;text-align:left;cursor:pointer'],
  ['.pq-admin-list', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:12px'],
  ['.pq-kicker,h2', 'font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:6px 0 0'],
  ['.card h2,.card h3', 'font-size:18px;letter-spacing:0;text-transform:none;color:var(--ink)'],
  ['.msg-bad', 'box-shadow:inset 0 0 0 1px rgba(241,244,234,.5)'],
];
const CARD_CSS = CARDS.map(([sel, body]) => `${sel.split(',').map((s) => `${P}.lgcc ${s}`).join(',')}{${body}}`).join('');

export function Legacy({ children, style, className, cards = false }: { children: ReactNode; style?: CSSProperties; className?: string; cards?: boolean }) {
  return <div className={`lgc${cards ? ' lgcc' : ''}${className ? ` ${className}` : ''}`} style={style}><style>{cards ? CSS + CARD_CSS : CSS}</style>{children}</div>;
}

/** A visually hidden label (the prototype's "sr" span). */
export const SR: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };
