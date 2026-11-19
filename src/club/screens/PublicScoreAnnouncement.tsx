import { useEffect, useRef, useState } from 'react';
import type { PublicTournament } from '../backend';

/** Announce changed public totals, not a whole results table on every poll. */
export function PublicScoreAnnouncement({ slug, data }: { slug: string; data: PublicTournament | null }) {
  const previous = useRef<{ slug: string; scores: Map<string, string> } | null>(null);
  const [message, setMessage] = useState('');
  const scores = (data?.matches ?? []).filter(m => m.court && m.games.length && (m.status === 'live' || m.status === 'done'));
  const signature = JSON.stringify(scores.map(m => [m.id, m.court, m.status, m.games.map(g => [g.a, g.b])]));
  useEffect(() => {
    const next = new Map(scores.map(m => [m.id, JSON.stringify([m.court, m.status, m.games.map(g => [g.a, g.b])])]));
    const old = previous.current;
    previous.current = { slug, scores: next };
    if (!old || old.slug !== slug || !data) { setMessage(''); return; }
    const changed = scores.filter(m => old.scores.get(m.id) !== next.get(m.id));
    if (!changed.length) return;
    const names = new Map(data.entries.map(e => [e.id, e.names.join(' / ')]));
    const text = changed.slice(0, 2).map(m => {
      const game = m.games[m.games.length - 1];
      return 'Court ' + m.court + ': ' + (names.get(m.entryA ?? '') ?? 'Team A') + ', ' + game.a + '. ' + (names.get(m.entryB ?? '') ?? 'Team B') + ', ' + game.b + '.';
    }).join(' ') + (changed.length > 2 ? ' More court scores updated.' : '');
    const timer = window.setTimeout(() => setMessage(text), 1000);
    return () => window.clearTimeout(timer);
    // The score signature prevents unchanged polls from repeating announcements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, signature]);
  return <p className="sr-only" aria-live="polite" aria-atomic="true" data-score-announcement>{message}</p>;
}
