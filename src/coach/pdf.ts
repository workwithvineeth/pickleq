import { fmtRating } from '../domain/record';
import { jsPDF } from 'jspdf';
import { shareOrDownload } from '../backup/share';
import { drillStats, iso } from '../domain/training';
import { splits, summarize } from '../domain/stats';
import type { CoachData } from './context';
import { stripMarkdown } from './markdown';

const WINANSI_EXTRA = '–—‘’“”•…€™‚„†‡‰‹›ŒœŠšŸŽžƒˆ˜';
/** The built-in PDF fonts can't draw every character; swap the few Claude uses. */
export function pdfSafe(s: string): string {
  return s.replace(/₹/g, 'Rs ').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/→/g, '->').replace(/←/g, '<-').replace(/−/g, '-').replace(/✓/g, 'v')
    .replace(/ /g, ' ').split('').map((c) => (c.charCodeAt(0) < 256 || WINANSI_EXTRA.includes(c) ? c : '')).join('');
}

export interface MeasuredLine { label: string; value: string }
export function measuredLines(d: CoachData, today = new Date()): MeasuredLine[] {
  const from = iso(new Date(today.getTime() - 89 * 86_400_000));
  const ms = d.matches.filter((m) => m.date >= from);
  const ss = d.sessions.filter((s) => s.date >= from);
  const s = summarize(ms);
  const sp = splits(ms, d.singles, d.doubles);
  const pc = (w: { wins: number; losses: number }) => (w.wins + w.losses ? ` (${Math.round((w.wins / (w.wins + w.losses)) * 100)}%)` : '');
  const r = (h: CoachData['singles']) => (h.length ? `${fmtRating(h.at(-1)!.value)} on ${h.at(-1)!.date}` : 'not entered');
  const hours = Math.round((ss.reduce((n, x) => n + x.minutes, 0) / 60) * 10) / 10;
  const drills = drillStats(ss).slice(0, 6).map((x) => `${x.category} ${x.pct}% (${x.made}/${x.attempts})`).join(', ');
  return [
    { label: 'Matches', value: `${s.matches} · record ${s.record.wins}-${s.record.losses}${pc(s.record)}` },
    { label: 'Singles / doubles / mixed', value: `${sp.byType.singles.wins}-${sp.byType.singles.losses} / ${sp.byType.doubles.wins}-${sp.byType.doubles.losses} / ${sp.byType.mixed.wins}-${sp.byType.mixed.losses}` },
    { label: 'Close games (3 points or fewer)', value: `${s.closeGames.wins}-${s.closeGames.losses}${pc(s.closeGames)}` },
    { label: 'Comebacks / lost leads', value: `${s.comebacks} / ${s.lostLeads} in ${s.trackedGames} tracked games` },
    { label: 'Average points per game', value: s.pointsFor === null ? 'n/a' : `${s.pointsFor} for, ${s.pointsAgainst} against` },
    { label: 'DUPR singles / doubles', value: `${r(d.singles)} / ${r(d.doubles)}` },
    { label: 'Training', value: `${ss.filter((x) => x.type !== 'rest').length} sessions, ${hours} hours` },
    { label: 'Drill success (measured)', value: drills || 'no drills counted' },
  ];
}

export function buildReportPdf(claudeText: string, d: CoachData, today = new Date()): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  let y = M;
  const maroon: [number, number, number] = [122, 31, 43];
  const need = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
  const write = (text: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(size);
    doc.setTextColor(...(opts.color ?? [30, 24, 20]));
    const lines = doc.splitTextToSize(pdfSafe(text), W - 2 * M - (opts.indent ?? 0)) as string[];
    for (const l of lines) { need(size * 1.35); doc.text(l, M + (opts.indent ?? 0), y + size); y += size * 1.35; }
    y += opts.gap ?? 4;
  };
  const from = iso(new Date(today.getTime() - 89 * 86_400_000));
  write('PICKLEQ performance report', 22, { bold: true, color: maroon });
  write(`${from} to ${iso(today)} · made ${today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, 10, { color: [110, 100, 90], gap: 14 });
  write('Measured by the app', 14, { bold: true, color: maroon, gap: 2 });
  write('These figures are calculated by PICKLEQ from the matches and training you logged.', 9, { color: [110, 100, 90] });
  for (const l of measuredLines(d, today)) write(`${l.label}: ${l.value}`, 10.5, { gap: 1 });
  y += 12;
  write('Analysis written by Claude', 14, { bold: true, color: maroon, gap: 2 });
  write('Claude (Haiku 5.5) wrote this from your records. Explanations are possibilities, not proven. Shot ratings are your own estimates.', 9, { color: [110, 100, 90], gap: 8 });
  for (const b of stripMarkdown(claudeText)) {
    if (b.kind === 'h1') { y += 4; write(b.text, 13, { bold: true }); }
    else if (b.kind === 'h2') { y += 4; write(b.text, 11.5, { bold: true, color: maroon }); }
    else if (b.kind === 'li') write(`${b.n ? `${b.n}.` : '•'} ${b.text}`, 10.5, { indent: 10, gap: 2 });
    else write(b.text, 10.5);
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 130, 120);
    doc.text(`PICKLEQ · page ${i} of ${pages}`, M, H - 24);
  }
  return doc;
}

export async function makeReportPdf(claudeText: string, d: CoachData): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const doc = buildReportPdf(claudeText, d);
  const blob = doc.output('blob');
  return shareOrDownload(`pickleq-report-${iso(new Date())}.pdf`, blob, 'application/pdf');
}
