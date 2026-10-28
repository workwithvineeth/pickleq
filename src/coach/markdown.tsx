import type { ReactNode } from 'react';

/** Renders the small Markdown subset Claude uses. Builds React elements only — no raw HTML ever reaches the page. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <strong key={`${key}-b${i++}`}>{m[1]}</strong> : <em key={`${key}-i${i++}`}>{m[2]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) { const k = `p${blocks.length}`; blocks.push(<p key={k}>{inline(para.join(' '), k)}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((it, i) => <li key={`${k}-${i}`}>{inline(it, `${k}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) { flushPara(); flushList(); const k = `h${blocks.length}`; blocks.push(h[1].length <= 2 ? <h3 key={k} className="md-h1">{inline(h[2], k)}</h3> : <h4 key={k} className="md-h2">{inline(h[2], k)}</h4>); }
    else if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
    } else if (!line.trim()) { flushPara(); flushList(); }
    else if (list && /^\s{2,}/.test(raw)) list.items[list.items.length - 1] += ` ${line.trim()}`;
    else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList();
  return <div className="md">{blocks}</div>;
}

/** Plain text version for the PDF. */
export function stripMarkdown(text: string): { kind: 'h1' | 'h2' | 'li' | 'p'; text: string; n?: number }[] {
  const out: { kind: 'h1' | 'h2' | 'li' | 'p'; text: string; n?: number }[] = [];
  let n = 0;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
    if (!line) { n = 0; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (h) { out.push({ kind: h[1].length <= 2 ? 'h1' : 'h2', text: h[2] }); n = 0; }
    else if (ol) out.push({ kind: 'li', text: ol[1], n: ++n });
    else if (ul) out.push({ kind: 'li', text: ul[1] });
    else out.push({ kind: 'p', text: line });
  }
  return out;
}
