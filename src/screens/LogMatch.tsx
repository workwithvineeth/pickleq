import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Chips, Field, NumberGrid, Segmented, Stepper } from '../components/Controls';
import { Icon } from '../components/Icon';
import { db } from '../db/db';
import { addMatch, updateMatch, type NewMatch } from '../db/matches';
import { checkMatch, formatLabel, gamesNeeded } from '../domain/scoring';
import { emptyGame, type BestOf, type Category, type Format, type Game, type MatchType, type Momentum, type Outcome, type Participant, type PointsTo, type Strength } from '../domain/types';
import type { Go } from '../navigation';
import { loadPrefs, savePrefs } from '../prefs';

type Mode = 'new' | 'edit' | 'backfill';

interface PersonDraft { name: string; rating: string; strength?: Strength }
const blankPerson = (): PersonDraft => ({ name: '', rating: '' });

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toPerson(p?: Participant): PersonDraft {
  if (!p) return blankPerson();
  return { name: p.name, rating: p.rating !== undefined ? String(p.rating) : '', strength: p.strength };
}

function parseRating(text: string): number | undefined | 'bad' {
  const t = text.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 1 && n <= 8 ? Math.round(n * 1000) / 1000 : 'bad';
}

const typeOptions: { value: MatchType; label: string }[] = [
  { value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }, { value: 'mixed', label: 'Mixed' },
];
const categoryOptions: { value: Category; label: string }[] = [
  { value: 'casual', label: 'Casual' }, { value: 'practice', label: 'Practice' }, { value: 'tournament', label: 'Tournament' },
];
const momentumOptions: { value: Momentum; label: string }[] = [
  { value: 'came-back', label: 'Came back' }, { value: 'lost-lead', label: 'Lost a lead' },
  { value: 'dominated', label: 'Dominated' }, { value: 'neither', label: 'Neither' },
];

export function LogMatch({ mode, matchId, go, onClose }: { mode: Mode; matchId?: string; go: Go; onClose: () => void }) {
  const existing = useLiveQuery(async () => (matchId ? ((await db.matches.get(matchId)) ?? null) : null), [matchId]);
  const players = useLiveQuery(() => db.players.orderBy('lastUsedAt').reverse().toArray(), []) ?? [];
  const prefs = useMemo(loadPrefs, []);

  const [loaded, setLoaded] = useState(mode !== 'edit');
  const [date, setDate] = useState(today());
  const [type, setType] = useState<MatchType>(prefs.type);
  const [category, setCategory] = useState<Category>(prefs.category);
  const [format, setFormat] = useState<Format>(prefs.format);
  const [showFormat, setShowFormat] = useState(false);
  const [partner, setPartner] = useState<PersonDraft>(blankPerson());
  const [opp1, setOpp1] = useState<PersonDraft>(blankPerson());
  const [opp2, setOpp2] = useState<PersonDraft>(blankPerson());
  const [outcome, setOutcome] = useState<Outcome>('played');
  const [wonChoice, setWonChoice] = useState<boolean | null>(null);
  const [games, setGames] = useState<Game[]>([emptyGame(), emptyGame(), emptyGame()]);
  const [active, setActive] = useState(0);
  const [side, setSide] = useState<'you' | 'them'>('you');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode !== 'edit' || !existing || loaded) return;
    setDate(existing.date);
    setType(existing.type);
    setCategory(existing.category);
    setFormat(existing.format);
    setPartner(toPerson(existing.participants.find((p) => p.role === 'partner')));
    const opps = existing.participants.filter((p) => p.role === 'opponent');
    setOpp1(toPerson(opps[0]));
    setOpp2(toPerson(opps[1]));
    setOutcome(existing.outcome);
    setWonChoice(existing.outcome === 'played' ? null : existing.won);
    const gs = [...existing.games.map((g) => ({ ...g }))];
    while (gs.length < 3) gs.push(emptyGame());
    setGames(gs);
    setLoaded(true);
  }, [mode, existing, loaded]);

  const doubles = type !== 'singles';
  const needed = outcome === 'walkover' ? 0 : outcome === 'retired' ? format.bestOf : gamesNeeded(format, games);
  const visibleGames = games.slice(0, needed);
  const check = checkMatch(format, outcome, visibleGames, wonChoice);
  const game = games[Math.min(active, Math.max(needed - 1, 0))];
  const gridMax = Math.max(format.pointsTo + 6, (game?.you ?? 0), (game?.them ?? 0));

  const setGame = (i: number, g: Game) => setGames((all) => all.map((x, j) => (j === i ? g : x)));

  function pick(n: number) {
    setError(null);
    const i = Math.min(active, needed - 1);
    const g = games[i];
    if (side === 'you') {
      setGame(i, { ...g, you: n });
      if (g.them === null) setSide('them');
    } else {
      setGame(i, { ...g, them: n });
      if (g.you === null) setSide('you');
    }
  }

  function pickMomentum(m: Momentum) {
    setError(null);
    const i = Math.min(active, needed - 1);
    const g = games[i];
    const fromYou = m === 'came-back' ? 4 : m === 'lost-lead' ? 8 : undefined;
    const fromThem = m === 'came-back' ? 8 : m === 'lost-lead' ? 4 : undefined;
    setGame(i, { ...g, momentum: m, fromYou, fromThem });
  }

  async function save() {
    if (!check.ok) {
      setError(check.message);
      return;
    }
    const people: [PersonDraft, Participant['role']][] = doubles
      ? [[partner, 'partner'], [opp1, 'opponent'], [opp2, 'opponent']]
      : [[opp1, 'opponent']];
    const participants: Participant[] = [];
    for (const [p, role] of people) {
      const rating = parseRating(p.rating);
      if (rating === 'bad') {
        setError('Ratings must be between 1 and 8, like 3.82');
        return;
      }
      participants.push({ name: p.name.trim(), role, rating, strength: rating === undefined ? p.strength : undefined });
    }
    const keptGames = outcome === 'walkover' ? [] : visibleGames
      .filter((g) => outcome === 'played' || g.you !== null || g.them !== null)
      .map((g) => (mode === 'backfill' || outcome !== 'played' ? { ...g, momentum: 'neither' as Momentum, fromYou: undefined, fromThem: undefined } : g));
    const scorePart: Partial<NewMatch> = { date, type, category, format, participants, outcome, games: keptGames, won: check.won as boolean };
    setSaving(true);
    try {
      savePrefs({ type, category, format });
      if (mode === 'edit' && matchId) {
        await updateMatch(matchId, scorePart);
        onClose();
      } else {
        const m = await addMatch({
          ...(scorePart as Required<Pick<NewMatch, 'date' | 'type' | 'category' | 'format' | 'participants' | 'outcome' | 'games' | 'won'>>),
          status: mode === 'backfill' ? 'complete' : 'incomplete',
          backfilled: mode === 'backfill',
          tags: {},
        });
        if (mode === 'backfill') go('match', m.id, { replace: true });
        else go('details', m.id, { replace: true });
      }
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'edit' && existing === null) return <main className="screen"><p>Match not found.</p></main>;
  if (!loaded) return <main className="screen"><p className="muted">Loading…</p></main>;

  const title = mode === 'edit' ? 'Edit match' : mode === 'backfill' ? 'Add an old match' : 'Log match';
  const statusMsg = error ?? (check.ok ? `${check.won ? 'Win' : 'Loss'} · ready to save` : null);

  return (
    <main className="screen" aria-labelledby="log-title">
      <header className="header">
        <h1 id="log-title" className="screen-title">{title}</h1>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </header>
      {mode === 'backfill' && <div className="notice notice-warn">For matches from your notebook: just the score. These count in your record but have no tags.</div>}

      <Segmented label="Match type" value={type} options={typeOptions} onChange={setType} />
      <Chips label="Category" value={category} options={categoryOptions} onChange={setCategory} />

      <Segmented label="How the match ended" value={outcome} onChange={(v) => { setOutcome(v); setError(null); setActive(0); }}
        options={[{ value: 'played', label: 'Played' }, { value: 'walkover', label: 'Walkover' }, { value: 'retired', label: 'Retired' }]} />

      {outcome !== 'played' && (
        <Field label="Who won?">
          <Chips label="Who won" value={wonChoice === null ? null : wonChoice ? 'you' : 'them'}
            options={[{ value: 'you', label: 'I won' }, { value: 'them', label: 'They won' }]}
            onChange={(v) => { setWonChoice(v === 'you'); setError(null); }} />
        </Field>
      )}

      {needed > 0 && (
        <>
          {needed > 1 && (
            <Chips label="Game" value={Math.min(active, needed - 1)}
              options={visibleGames.map((g, i) => ({ value: i, label: `Game ${i + 1}${g.you !== null && g.them !== null ? ` · ${g.you}–${g.them}` : ''}` }))}
              onChange={(i) => { setActive(i); setSide('you'); }} />
          )}
          <div className="scores">
            <button type="button" className="score-box" aria-pressed={side === 'you'} aria-label={`Your score: ${game.you ?? 'not set'}`} onClick={() => setSide('you')}>
              <span className="label">You</span><span className="big">{game.you ?? '–'}</span>
            </button>
            <button type="button" className="score-box" aria-pressed={side === 'them'} aria-label={`Their score: ${game.them ?? 'not set'}`} onClick={() => setSide('them')}>
              <span className="label">Them</span><span className="big">{game.them ?? '–'}</span>
            </button>
          </div>
          <div className="small muted">Tap a number for <b>{side === 'you' ? 'your score' : 'their score'}</b></div>
          <NumberGrid max={gridMax} selected={side === 'you' ? game.you : game.them} onPick={pick} label={side === 'you' ? 'Your score' : 'Their score'} />

          {mode !== 'backfill' && outcome === 'played' && (
            <Field label="How did the game go?">
              <Chips label="Momentum" value={game.momentum} options={momentumOptions} onChange={pickMomentum} />
              {(game.momentum === 'came-back' || game.momentum === 'lost-lead') && (
                <div className="card section" style={{ padding: 12 }}>
                  <div className="small muted">{game.momentum === 'came-back' ? 'You came back from (your worst point):' : 'You lost the lead from (your best point):'}</div>
                  <div className="scores">
                    <Stepper label="You" value={game.fromYou ?? 0} onChange={(v) => setGame(Math.min(active, needed - 1), { ...game, fromYou: v })} />
                    <Stepper label="Them" value={game.fromThem ?? 0} onChange={(v) => setGame(Math.min(active, needed - 1), { ...game, fromThem: v })} />
                  </div>
                </div>
              )}
            </Field>
          )}
        </>
      )}

      <div className="label" style={{ marginTop: 4 }}>Players, date and format (optional)</div>
      <div className="person" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <label className="label" htmlFor="match-date">Date</label>
        <input id="match-date" className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
      </div>

      <div className="card section" style={{ padding: 12 }}>
        <div className="header">
          <span className="small">{formatLabel(format)}</span>
          <button type="button" className="link-btn" aria-expanded={showFormat} onClick={() => setShowFormat((s) => !s)}>{showFormat ? 'Done' : 'Change'}</button>
        </div>
        {showFormat && (
          <>
            <Chips label="Points to win" value={format.pointsTo} options={[11, 15, 21].map((v) => ({ value: v as PointsTo, label: `To ${v}` }))} onChange={(v) => setFormat({ ...format, pointsTo: v })} />
            <Chips label="Games" value={format.bestOf} options={[{ value: 1 as BestOf, label: '1 game' }, { value: 3 as BestOf, label: 'Best of 3' }]} onChange={(v) => { setFormat({ ...format, bestOf: v }); setActive(0); }} />
            <Chips label="Scoring" value={format.scoring} options={[{ value: 'sideout' as const, label: 'Side-out' }, { value: 'rally' as const, label: 'Rally' }]} onChange={(v) => setFormat({ ...format, scoring: v })} />
          </>
        )}
      </div>

      <datalist id="player-names">{players.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <div className="card section" style={{ padding: 12 }}>
        {doubles && <PersonFields label="Partner" person={partner} onChange={setPartner} players={players} />}
        <PersonFields label={doubles ? 'Opponent 1' : 'Opponent'} person={opp1} onChange={setOpp1} players={players} />
        {doubles && <PersonFields label="Opponent 2" person={opp2} onChange={setOpp2} players={players} />}
      </div>

      {statusMsg && <div role="status" className={`msg ${error || !check.ok ? 'msg-bad' : 'msg-ok'}`}>{statusMsg}</div>}
      <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
        {mode === 'edit' ? 'Save changes' : mode === 'backfill' ? 'Save old match' : 'Save score'}
      </button>
    </main>
  );
}

function PersonFields({ label, person, onChange, players }: {
  label: string; person: PersonDraft; onChange: (p: PersonDraft) => void; players: { name: string; lastRating?: number; lastStrength?: Strength }[];
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  function setName(name: string) {
    const known = players.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    const next = { ...person, name };
    if (known && !person.rating && !person.strength) {
      if (known.lastRating !== undefined) next.rating = String(known.lastRating);
      else if (known.lastStrength) next.strength = known.lastStrength;
    }
    onChange(next);
  }
  return (
    <div className="person">
      <div>
        <label className="label" htmlFor={`${id}-name`}>{label}</label>
        <input id={`${id}-name`} className="input" list="player-names" autoComplete="off" placeholder="Name" value={person.name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-rating`}>DUPR</label>
        <input id={`${id}-rating`} className="input" inputMode="decimal" placeholder="3.82" value={person.rating} onChange={(e) => onChange({ ...person, rating: e.target.value })} />
      </div>
      {!person.rating.trim() && (
        <Chips small label={`${label} strength`} value={person.strength}
          options={[{ value: 'stronger' as Strength, label: 'Stronger' }, { value: 'equal' as Strength, label: 'Equal' }, { value: 'weaker' as Strength, label: 'Weaker' }]}
          onChange={(v) => onChange({ ...person, strength: person.strength === v ? undefined : v })} />
      )}
    </div>
  );
}

