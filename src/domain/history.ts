import { formatLabel, momentumLabel, scoreLine } from './scoring';
import type { HistoryChange, Match } from './types';

const label: Record<string, string> = {
  date: 'Date', type: 'Match type', category: 'Category', format: 'Format', people: 'Players',
  score: 'Score', momentum: 'Momentum', result: 'Result', tags: 'Tags', energy: 'Energy',
  venue: 'Venue', setting: 'Indoor/outdoor', notes: 'Notes',
};

function people(m: Match): string {
  return m.participants
    .map((p) => {
      const extra = p.rating !== undefined ? ` (${p.rating})` : p.strength ? ` (${p.strength})` : '';
      return `${p.role === 'partner' ? 'with' : 'vs'} ${p.name || 'unnamed'}${extra}`;
    })
    .join(', ');
}

function snapshot(m: Match): Record<string, string> {
  return {
    date: m.date,
    type: m.type,
    category: m.category,
    format: formatLabel(m.format),
    people: people(m),
    score: scoreLine(m),
    momentum: m.games.map((g) => momentumLabel(g) ?? '—').join(' · '),
    result: m.won ? 'Win' : 'Loss',
    tags: Object.entries(m.tags).map(([t, v]) => `${v === 'needs-work' ? '−' : '+'} ${t}`).sort().join(', '),
    energy: m.energy !== undefined ? String(m.energy) : '',
    venue: m.venue ?? '',
    setting: m.setting ?? '',
    notes: m.notes ?? '',
  };
}

/** Field-by-field list of what changed between two versions of a match, in plain words. */
export function diffMatch(before: Match, after: Match): HistoryChange[] {
  const a = snapshot(before);
  const b = snapshot(after);
  return Object.keys(a)
    .filter((k) => a[k] !== b[k])
    .map((k) => ({ field: label[k] ?? k, from: a[k] || '—', to: b[k] || '—' }));
}
