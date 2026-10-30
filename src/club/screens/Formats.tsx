import { useMemo } from 'react';
import { Chips, Field, Segmented } from '../../components/Controls';
import type { BestOf, Format, PointsTo, Scoring } from '../../domain/types';
import { clockText, estimateDay, eventMatches, fasterOptions, minutesOf, shapeText, type EventPlanInput, type ShapeChoice } from '../estimate';
import { checkShape } from '../plan';
import { KNOCKOUT_STAGES, STAGE_LABEL, type Division, type KnockoutStage } from '../types';

/** The organiser's choices for one event: its shape and the game format for pools and each knockout round. */
export interface FormatDraft extends ShapeChoice {
  scoring: Scoring;
  /** Golden point in pool games / in knockout games. */
  golden: boolean;
  koGolden: boolean;
  pool: { pointsTo: PointsTo; bestOf: BestOf };
  stages: Record<KnockoutStage, { pointsTo: PointsTo; bestOf: BestOf }>;
}

const allStages = (pointsTo: PointsTo, bestOf: BestOf) => Object.fromEntries(KNOCKOUT_STAGES.map((s) => [s, { pointsTo, bestOf }])) as FormatDraft['stages'];
export const defaultFormatDraft = (): FormatDraft => ({ shape: 'pools-ko', pools: 2, advance: 2, extra: 0, scoring: 'sideout', golden: true, koGolden: false, pool: { pointsTo: 11, bestOf: 1 }, stages: allStages(11, 3) });

/** What a draft means for the division: pools, places through, and the formats (per round only where they differ). */
export function draftToDivision(d: FormatDraft): Pick<Division, 'pools' | 'advance' | 'format' | 'koFormat' | 'shape' | 'extra' | 'stageFormats'> {
  const ko = d.shape === 'ko', rr = d.shape === 'rr';
  const format: Format = { pointsTo: d.pool.pointsTo, bestOf: d.pool.bestOf, scoring: d.scoring, golden: d.golden };
  const stageFormat = (s: KnockoutStage): Format => ({ pointsTo: d.stages[s].pointsTo, bestOf: d.stages[s].bestOf, scoring: d.scoring, golden: d.koGolden });
  // The knockout default is the final's format; other rounds are stored only when they differ from it.
  const koFormat = stageFormat('final');
  const stageFormats: Division['stageFormats'] = {};
  for (const s of KNOCKOUT_STAGES) {
    const f = stageFormat(s);
    if (s !== 'final' && (f.pointsTo !== koFormat.pointsTo || f.bestOf !== koFormat.bestOf)) stageFormats[s] = f;
  }
  return {
    pools: ko || rr ? 1 : d.pools, advance: ko || rr ? 0 : d.advance, format, koFormat,
    ...(ko ? { shape: 'ko' as const } : {}), ...(!ko && !rr && d.extra ? { extra: d.extra } : {}),
    ...(Object.keys(stageFormats).length ? { stageFormats } : {}),
  };
}

/** A division's current settings as a draft (for the draw screen). */
export function divisionToDraft(div: Division): FormatDraft {
  const stages = allStages(div.koFormat.pointsTo, div.koFormat.bestOf);
  for (const s of KNOCKOUT_STAGES) { const f = div.stageFormats?.[s]; if (f) stages[s] = { pointsTo: f.pointsTo, bestOf: f.bestOf }; }
  const shape = div.shape === 'ko' ? 'ko' : div.advance === 0 ? 'rr' : 'pools-ko';
  return {
    shape, pools: div.pools, advance: div.advance || 2, extra: div.extra ?? 0, scoring: div.format.scoring ?? 'sideout', golden: !!div.format.golden, koGolden: !!div.koFormat.golden,
    pool: { pointsTo: div.format.pointsTo, bestOf: div.format.bestOf }, stages,
  };
}

const SCORING = [{ value: 'golden', label: 'Golden point' }, { value: 'win2', label: 'Win by 2' }];
const POINTS: PointsTo[] = [11, 15, 21];

/** Format fields for one event. entries: how many entries it has now (for the knockout rounds shown and checks). */
export function FormatFields({ label, entries, value, onChange, showShape = true }: { label: string; entries: number; value: FormatDraft; onChange: (patch: Partial<FormatDraft>) => void; showShape?: boolean }) {
  const d = value;
  const counts = eventMatches({ ...d, name: label, entries: Math.max(entries, 2) });
  const firstIdx = counts.firstStage ? KNOCKOUT_STAGES.indexOf(counts.firstStage) : KNOCKOUT_STAGES.length;
  const rounds = KNOCKOUT_STAGES.slice(firstIdx);
  const problem = entries >= 2 ? checkShape(d, entries) : null;
  const hasKo = d.shape !== 'rr';
  const setStage = (s: KnockoutStage, patch: Partial<{ pointsTo: PointsTo; bestOf: BestOf }>) => onChange({ stages: { ...d.stages, [s]: { ...d.stages[s], ...patch } } });
  const allKoBestOf = rounds.length && rounds.every((s) => d.stages[s].bestOf === d.stages[rounds[0]].bestOf) ? d.stages[rounds[0]].bestOf : null;
  return (
    <div className="section">
      {showShape && <Field label="Format">
        <Segmented label={`${label} format`} value={d.shape} options={[{ value: 'rr', label: 'Round robin' }, { value: 'pools-ko', label: 'Pools, then knockouts' }, { value: 'ko', label: 'Knockout only' }]} onChange={(v) => onChange({ shape: v, ...(v === 'pools-ko' ? { pools: Math.max(2, d.pools), advance: d.advance || 2 } : {}) })} />
      </Field>}
      {showShape && d.shape === 'pools-ko' && <>
        <Field label="Pools"><Chips label={`${label} pools`} value={d.pools} options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => onChange({ pools: v, extra: Math.min(d.extra, Math.max(0, v - 1)) })} /></Field>
        <Field label="Go through to knockouts, per pool"><Chips label={`${label} going through`} value={d.advance} options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => onChange({ advance: v })} /></Field>
        {d.pools > 1 && <Field label={`Best ${d.advance === 1 ? 'runners-up' : 'next-placed'} also through`}>
          <Chips label={`${label} best runners-up`} value={d.extra} options={Array.from({ length: Math.min(d.pools, 8) }, (_, n) => ({ value: n, label: n === 0 ? 'None' : String(n) }))} onChange={(v) => onChange({ extra: v })} />
        </Field>}
      </>}
      {showShape && entries >= 2 && <p className="small muted" style={{ margin: 0 }} aria-label={`${label} plan`}>{shapeText({ ...d, name: label, entries })} · {counts.pool + counts.knockout} matches</p>}
      {showShape && problem && <div className="msg msg-bad small">{problem}</div>}
      {d.shape !== 'ko' && <>
        <Field label={d.shape === 'rr' ? 'Games to' : 'Pool games to'}><Chips label={`${label} games to`} value={d.pool.pointsTo} options={POINTS.map((n) => ({ value: n, label: String(n) }))} onChange={(v) => onChange({ pool: { ...d.pool, pointsTo: v } })} /></Field>
        <Field label={d.shape === 'rr' ? 'Matches' : 'Pool matches'}><Chips label={`${label} pool matches`} value={d.pool.bestOf} options={[{ value: 1 as BestOf, label: 'One game' }, { value: 3 as BestOf, label: 'Best of 3' }]} onChange={(v) => onChange({ pool: { ...d.pool, bestOf: v } })} /></Field>
        <Field label={d.shape === 'rr' ? 'At level scores' : 'Pool games, at level scores'}><Segmented label={`${label} scoring`} value={d.golden ? 'golden' : 'win2'} options={SCORING} onChange={(v) => onChange({ golden: v === 'golden' })} /></Field>
        <p className="small muted" style={{ margin: 0 }}>{d.golden ? `Golden point: at ${d.pool.pointsTo - 1}–${d.pool.pointsTo - 1} the next point wins.` : `Win by 2: play on past ${d.pool.pointsTo} until someone leads by 2.`}</p>
      </>}
      {hasKo && <>
        <Field label="Knockout matches"><Chips label={`${label} knockout matches`} value={allKoBestOf} options={[{ value: 1 as BestOf, label: 'One game' }, { value: 3 as BestOf, label: 'Best of 3' }]} onChange={(v) => onChange({ stages: Object.fromEntries(KNOCKOUT_STAGES.map((s) => [s, { ...d.stages[s], bestOf: v }])) as FormatDraft['stages'] })} /></Field>
        <Field label="Knockout games, at level scores"><Segmented label={`${label} knockout scoring`} value={d.koGolden ? 'golden' : 'win2'} options={SCORING} onChange={(v) => onChange({ koGolden: v === 'golden' })} /></Field>
        <details className="card" style={{ padding: 10 }}>
          <summary>Each knockout round: games to and best of</summary>
          <table className="table" aria-label={`${label} knockout rounds`} style={{ marginTop: 8 }}>
            <thead><tr><th>Round</th><th>Games to</th><th>Best of</th></tr></thead>
            <tbody>
              {rounds.map((s) => (
                <tr key={s}>
                  <td>{STAGE_LABEL[s]}</td>
                  <td><select className="input" aria-label={`${label} ${STAGE_LABEL[s]} games to`} value={d.stages[s].pointsTo} onChange={(e) => setStage(s, { pointsTo: Number(e.target.value) as PointsTo })}>{POINTS.map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
                  <td><select className="input" aria-label={`${label} ${STAGE_LABEL[s]} best of`} value={d.stages[s].bestOf} onChange={(e) => setStage(s, { bestOf: Number(e.target.value) as BestOf })}><option value={1}>1 game</option><option value={3}>Best of 3</option></select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </>}
      <Field label="Scoring"><Segmented<Scoring> label={`${label} rally or side-out`} value={d.scoring} options={[{ value: 'sideout', label: 'Side-out' }, { value: 'rally', label: 'Rally' }]} onChange={(v) => onChange({ scoring: v })} /></Field>
    </div>
  );
}

export const SLOT_OPTIONS = [10, 12, 15, 20, 25, 30];

/**
 * The live time estimate for the day, and faster options when it runs past the time they want to finish by.
 * Only a guide: the organiser's choices are never changed unless they tap "Use this".
 */
export function DayEstimateBox({ events, courts, slotMinutes, startTime, finishBy, onFinishBy, onUse }: {
  events: EventPlanInput[]; courts: number; slotMinutes: number; startTime: string; finishBy: string; onFinishBy: (v: string) => void;
  onUse: (eventIndex: number, choice: ShapeChoice) => void;
}) {
  const usable = events.filter((e) => e.entries >= 2);
  const est = useMemo(() => estimateDay(usable, courts, slotMinutes, startTime), [usable, courts, slotMinutes, startTime]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = finishBy ? minutesOf(finishBy) + (minutesOf(finishBy) < minutesOf(startTime) ? 1440 : 0) : undefined;
  const late = target !== undefined && est.endMinutes > target;
  const faster = useMemo(() => (late && target !== undefined ? fasterOptions(usable, courts, slotMinutes, startTime, target) : []), [late, target, usable, courts, slotMinutes, startTime]); // eslint-disable-line react-hooks/exhaustive-deps
  const longGames = events.some((e) => e.entries >= 2) && slotMinutes < 30 && usable.length > 0;
  if (!usable.length) return <p className="small muted" style={{ margin: 0 }}>The time estimate appears once an event has 2 or more entries.</p>;
  return (
    <section className={`card section`} aria-label="Time estimate" style={{ borderLeft: `4px solid ${late ? 'var(--bad, #b3261e)' : 'var(--ok, #2f6b3a)'}` }}>
      <b>About {est.matches} matches · finishes around {clockText(est.endMinutes)} on {courts} {courts === 1 ? 'court' : 'courts'}</b>
      <p className="small muted" style={{ margin: 0 }}>From {clockText(minutesOf(startTime))}, {slotMinutes} minutes a match. Only a guide: it assumes different players in each event and no delays.</p>
      <Field label="Finish by (optional)"><input className="input" type="time" aria-label="Finish by" value={finishBy} onChange={(e) => onFinishBy(e.target.value)} /></Field>
      {late && <div className="msg msg-bad small">That’s later than {clockText(target as number)}.{faster.length ? ' Faster options:' : ' Try more courts, shorter matches, or fewer matches per event.'}</div>}
      {faster.map((f) => (
        <div key={`${f.eventIndex}-${f.text}`} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
          <span className="small" style={{ flex: 1, minWidth: 0 }}>{f.text} → {f.estimate.matches} matches, finishes around {clockText(f.estimate.endMinutes)}</span>
          <button type="button" className="btn btn-outline" style={{ flex: 'none' }} aria-label={`Use: ${f.text}`} onClick={() => onUse(events.indexOf(usable[f.eventIndex]), f.choice)}>Use this</button>
        </div>
      ))}
      {longGames && <p className="small muted" style={{ margin: 0 }}>Tip: a game to 11 usually takes 12–20 minutes; best of 3, or games to 15 or 21, take longer. Choose the minutes per match to suit the longest matches.</p>}
    </section>
  );
}
