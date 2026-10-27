import { formatLabel, momentumLabel, scoreLine } from '../domain/scoring';
import type { Match } from '../domain/types';

const HEADERS = ['Date', 'Result', 'Score', 'Type', 'Category', 'Format', 'Partner', 'Opponents', 'Opponent ratings',
  'Momentum', 'Needs work', 'Went well', 'Energy', 'Venue', 'Indoor/outdoor', 'Notes', 'Details added', 'Backfilled'];

export function csvCell(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v);
  // Quote when needed; guard against spreadsheet formula injection from names or notes.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per active match, oldest first, ready for Excel or Google Sheets. */
export function matchesToCsv(matches: Match[]): string {
  const rows = matches
    .filter((m) => m.deletedAt === undefined)
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .map((m) => {
      const opps = m.participants.filter((p) => p.role === 'opponent');
      const tags = Object.entries(m.tags);
      return [
        m.date, m.won ? 'Win' : 'Loss', scoreLine(m), m.type, m.category, formatLabel(m.format),
        m.participants.find((p) => p.role === 'partner')?.name ?? '',
        opps.map((p) => p.name).filter(Boolean).join(' & '),
        opps.map((p) => (p.rating !== undefined ? String(p.rating) : p.strength ?? '')).join(' & '),
        m.games.map((g) => momentumLabel(g) ?? '').filter(Boolean).join('; '),
        tags.filter(([, v]) => v === 'needs-work').map(([t]) => t).join('; '),
        tags.filter(([, v]) => v === 'went-well').map(([t]) => t).join('; '),
        m.energy, m.venue, m.setting, m.notes,
        m.status === 'complete' ? 'Yes' : 'No', m.backfilled ? 'Yes' : 'No',
      ].map(csvCell).join(',');
    });
  return '﻿' + [HEADERS.join(','), ...rows].join('\r\n') + '\r\n';
}
