import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Chips, Field } from '../components/Controls';
import { Icon } from '../components/Icon';
import { db } from '../db/db';
import { activeMatches, updateMatch } from '../db/matches';
import { scoreLine } from '../domain/scoring';
import { TAGS, type Setting, type TagMark } from '../domain/types';
import type { Go } from '../navigation';

const next: Record<string, TagMark | undefined> = { none: 'needs-work', 'needs-work': 'went-well', 'went-well': undefined };

/** Step 2 of logging: quick tags, energy, venue and notes. Can be finished later. */
export function MatchDetails({ matchId, go, onClose }: { matchId: string; go: Go; onClose: () => void }) {
  const match = useLiveQuery(() => db.matches.get(matchId).then((m) => m ?? null), [matchId]);
  const venues = useLiveQuery(async () => [...new Set((await activeMatches()).map((m) => m.venue).filter(Boolean) as string[])], []) ?? [];
  const [loaded, setLoaded] = useState(false);
  const [tags, setTags] = useState<Record<string, TagMark>>({});
  const [energy, setEnergy] = useState<number | undefined>();
  const [venue, setVenue] = useState('');
  const [setting, setSetting] = useState<Setting | undefined>();
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!match || loaded) return;
    setTags(match.tags);
    setEnergy(match.energy);
    setVenue(match.venue ?? '');
    setSetting(match.setting);
    setNotes(match.notes ?? '');
    setLoaded(true);
  }, [match, loaded]);

  if (match === undefined) return <main className="screen"><p className="muted">Loading…</p></main>;
  if (match === null) return <main className="screen"><p>Match not found.</p></main>;

  const wasIncomplete = match.status === 'incomplete';

  async function save(complete: boolean) {
    const t = venue.trim();
    const n = notes.trim();
    await updateMatch(matchId, {
      tags, energy, venue: t || undefined, setting, notes: n || undefined,
      status: complete ? 'complete' : match!.status,
    });
    if (complete && wasIncomplete) go('match', matchId, { replace: true });
    else onClose();
  }

  function cycle(tag: string) {
    setTags((cur) => {
      const mark = next[cur[tag] ?? 'none'];
      const copy = { ...cur };
      if (mark) copy[tag] = mark;
      else delete copy[tag];
      return copy;
    });
  }

  return (
    <main className="screen" aria-labelledby="details-title">
      <header className="header">
        <h1 id="details-title" className="screen-title">Match details</h1>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
      </header>
      {wasIncomplete && <div className="notice notice-ok">Score saved: {match.won ? 'win' : 'loss'} {scoreLine(match)}. Add details now or later.</div>}

      <Field label="Quick tags: tap once for needs work, twice for went well, again to clear">
        <div className="chips" role="group" aria-label="Quick tags">
          {TAGS.map((t) => {
            const mark = tags[t];
            const cls = mark === 'needs-work' ? 'chip tag-needs' : mark === 'went-well' ? 'chip tag-well' : 'chip';
            const prefix = mark === 'needs-work' ? '− ' : mark === 'went-well' ? '+ ' : '';
            const state = mark === 'needs-work' ? ', needs work' : mark === 'went-well' ? ', went well' : '';
            return <button key={t} type="button" className={cls} aria-label={`${t}${state}`} onClick={() => cycle(t)}>{prefix}{t}</button>;
          })}
        </div>
      </Field>

      <Field label="Energy level (1 = drained, 5 = sharp)">
        <Chips label="Energy" value={energy} options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))} onChange={(v) => setEnergy(energy === v ? undefined : v)} />
      </Field>

      <Field label="Venue">
        <datalist id="venues">{venues.map((v) => <option key={v} value={v} />)}</datalist>
        <input className="input" aria-label="Venue" list="venues" placeholder="Club or court name" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <Chips label="Indoor or outdoor" value={setting} options={[{ value: 'indoor' as Setting, label: 'Indoor' }, { value: 'outdoor' as Setting, label: 'Outdoor' }]} onChange={(v) => setSetting(setting === v ? undefined : v)} />
      </Field>

      <Field label="Notes">
        <textarea className="input" aria-label="Notes" placeholder="Their lefty kept attacking my backhand…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="sticky-actions">
        {wasIncomplete && <button type="button" className="btn btn-outline" style={{ background: 'var(--bg)' }} onClick={() => save(false)}>Finish later</button>}
        <button type="button" className="btn btn-primary" onClick={() => save(true)}>Save details</button>
      </div>
    </main>
  );
}
