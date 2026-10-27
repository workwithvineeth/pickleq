import { opponentStrength, pct, summarize } from './stats';
import { drillStats, iso, weekTraining } from './training';
import { RATED_SHOTS, TAGS, type Match, type RatingEntry, type TrainingSession } from './types';
import { ratingOn } from '../db/ratings';

export interface TagStat {
  tag: string;
  needsWork: number;
  wentWell: number;
  needsInLosses: number;
  needsInWins: number;
  wellInWins: number;
}

/** Only matches where details were added (complete, not backfilled) can carry tags. */
export const taggedMatches = (matches: Match[]) => matches.filter((m) => m.status === 'complete' && !m.backfilled);

export function tagStats(matches: Match[]): TagStat[] {
  const out = new Map<string, TagStat>(TAGS.map((t) => [t, { tag: t, needsWork: 0, wentWell: 0, needsInLosses: 0, needsInWins: 0, wellInWins: 0 }]));
  for (const m of taggedMatches(matches)) {
    for (const [tag, mark] of Object.entries(m.tags)) {
      const t = out.get(tag) ?? { tag, needsWork: 0, wentWell: 0, needsInLosses: 0, needsInWins: 0, wellInWins: 0 };
      if (mark === 'needs-work') {
        t.needsWork++;
        if (m.won) t.needsInWins++;
        else t.needsInLosses++;
      } else {
        t.wentWell++;
        if (m.won) t.wellInWins++;
      }
      out.set(tag, t);
    }
  }
  return [...out.values()];
}

export interface ShotAverage { shot: string; average: number | null; n: number; recent: number | null; earlier: number | null }

/** Your 1–5 estimates per shot. `recent` = last 5 rated matches, `earlier` = the ones before. */
export function shotAverages(matchesNewestFirst: Match[]): ShotAverage[] {
  return RATED_SHOTS.map((shot) => {
    const values = matchesNewestFirst.map((m) => m.shotRatings?.[shot]).filter((v): v is number => typeof v === 'number');
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    return { shot, average: avg(values), n: values.length, recent: avg(values.slice(0, 5)), earlier: avg(values.slice(5)) };
  });
}

export type InsightKind = 'watch' | 'strength' | 'progress';
export interface Insight {
  id: string;
  kind: InsightKind;
  /** One sentence, built only from recorded numbers. Never states a cause. */
  text: string;
  /** Higher = more notable. Used for ordering. */
  score: number;
  /** A question to take to your coach, when this pattern is worth discussing. */
  coachQuestion?: string;
}

/** Drill category ↔ the shot you rate after matches. */
const DRILL_FOR_SHOT: Record<string, string> = {
  Serve: 'Serves', Return: 'Returns', 'Third-shot drop': 'Third-shot drops', Dink: 'Dinks',
  'Forehand drive': 'Forehand drives', 'Backhand drive': 'Backhand drives',
};

export interface InsightInput {
  /** Newest first. */
  matches: Match[];
  sessions: TrainingSession[];
  singles: RatingEntry[];
  doubles: RatingEntry[];
  weeklyHoursGoal?: number;
  today?: Date;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Rule-based insights from your own records. Each rule needs a minimum amount of data before it says anything,
 * and every sentence states what was recorded, never why it happened.
 */
export function insights(input: InsightInput): Insight[] {
  const today = input.today ?? new Date();
  const out: Insight[] = [];
  const matches = input.matches.filter((m) => m.deletedAt === undefined);
  const tagged = taggedMatches(matches);
  const taggedLosses = tagged.filter((m) => !m.won);
  const taggedWins = tagged.filter((m) => m.won);

  // 1. A "needs work" tag that clusters in losses.
  if (taggedLosses.length >= 4) {
    for (const t of tagStats(matches)) {
      const inL = t.needsInLosses / taggedLosses.length;
      const inW = taggedWins.length ? t.needsInWins / taggedWins.length : 0;
      if (t.needsInLosses >= 3 && inL >= 0.5 && inL - inW >= 0.3) {
        out.push({
          id: `tag-losses-${t.tag}`, kind: 'watch', score: 90 + Math.round(inL * 10),
          text: `${t.tag} was tagged “needs work” in ${t.needsInLosses} of your ${taggedLosses.length} tagged losses, but in ${t.needsInWins} of ${taggedWins.length} tagged wins.`,
          coachQuestion: `What should I change about my ${t.tag.toLowerCase()} in the matches I lose? It's tagged in ${t.needsInLosses} of ${taggedLosses.length} losses.`,
        });
      }
    }
  }

  // 2. A "went well" tag that shows up often in wins.
  if (taggedWins.length >= 4) {
    const best = tagStats(matches).filter((t) => t.wellInWins >= 3 && t.wellInWins / taggedWins.length >= 0.4).sort((a, b) => b.wellInWins - a.wellInWins)[0];
    if (best) {
      out.push({ id: `tag-strength-${best.tag}`, kind: 'strength', score: 60,
        text: `${best.tag} was tagged “went well” in ${best.wellInWins} of your ${taggedWins.length} tagged wins.` });
    }
  }

  const s = summarize(matches);
  const overall = pct(s.record);
  // 3. Close games.
  const closeN = s.closeGames.wins + s.closeGames.losses;
  const close = pct(s.closeGames);
  if (closeN >= 5 && close !== null && overall !== null && close <= overall - 15) {
    out.push({ id: 'close-games', kind: 'watch', score: 80,
      text: `You've won ${close}% of close games (decided by 3 or fewer, ${s.closeGames.wins}–${s.closeGames.losses}), against ${overall}% of matches overall.`,
      coachQuestion: 'What can I do differently at the end of tight games?' });
  }

  // 4. Lost leads.
  if (s.lostLeads >= 2 && s.biggestLostLead) {
    out.push({ id: 'lost-leads', kind: 'watch', score: 70 + s.lostLeads,
      text: `You've recorded ${plural(s.lostLeads, 'lost lead')}; the biggest was from ${s.biggestLostLead.from} up.`,
      coachQuestion: `How do I keep control when I'm ahead? I've lost ${s.lostLeads} leads, one from ${s.biggestLostLead.from}.` });
  }

  // 5. Energy.
  const lowE = matches.filter((m) => m.energy !== undefined && m.energy <= 2);
  const highE = matches.filter((m) => m.energy !== undefined && m.energy >= 4);
  if (lowE.length >= 3 && highE.length >= 3) {
    const lo = Math.round((lowE.filter((m) => m.won).length / lowE.length) * 100);
    const hi = Math.round((highE.filter((m) => m.won).length / highE.length) * 100);
    if (hi - lo >= 20) {
      out.push({ id: 'energy', kind: 'watch', score: 65,
        text: `Your win rate is ${lo}% when you logged energy 1–2 (${plural(lowE.length, 'match', 'matches')}) and ${hi}% at energy 4–5 (${plural(highE.length, 'match', 'matches')}).`,
        coachQuestion: 'How should I prepare on days my energy is low?' });
    }
  }

  // 6. Opponent strength.
  const byStr = { stronger: [] as Match[], equal: [] as Match[] };
  for (const m of matches) {
    const hist = m.type === 'singles' ? input.singles : input.doubles;
    const st = opponentStrength(m, ratingOn(hist, m.date) ?? hist[0]?.value);
    if (st === 'stronger' || st === 'equal') byStr[st].push(m);
  }
  if (byStr.stronger.length >= 4 && byStr.equal.length >= 4) {
    const a = Math.round((byStr.stronger.filter((m) => m.won).length / byStr.stronger.length) * 100);
    const b = Math.round((byStr.equal.filter((m) => m.won).length / byStr.equal.length) * 100);
    if (b - a >= 20) {
      out.push({ id: 'stronger', kind: 'watch', score: 60,
        text: `Against stronger opponents you've won ${a}% (${byStr.stronger.length} matches), against evenly matched ones ${b}%.`,
        coachQuestion: `Against stronger players I win ${a}%. Should I focus on tactics or technique first?` });
    }
  }

  // 7. Singles vs doubles.
  const sg = matches.filter((m) => m.type === 'singles');
  const db = matches.filter((m) => m.type !== 'singles');
  if (sg.length >= 4 && db.length >= 4) {
    const a = Math.round((sg.filter((m) => m.won).length / sg.length) * 100);
    const b = Math.round((db.filter((m) => m.won).length / db.length) * 100);
    if (Math.abs(a - b) >= 20) {
      out.push({ id: 'singles-doubles', kind: 'watch', score: 50,
        text: `You've won ${a}% of singles (${sg.length}) and ${b}% of doubles and mixed (${db.length}).` });
    }
  }

  // 8. Weakest measured drill in the last 30 days.
  const from = iso(new Date(today.getTime() - 30 * 86_400_000));
  const drills = drillStats(input.sessions, from).filter((d) => d.attempts >= 40);
  const weakest = [...drills].sort((a, b) => a.pct - b.pct)[0];
  if (weakest && weakest.pct < 65) {
    out.push({ id: `weak-drill-${weakest.category}`, kind: 'watch', score: 55,
      text: `${weakest.category} is your lowest measured drill in the last 30 days: ${weakest.pct}% (${weakest.made}/${weakest.attempts}).`,
      coachQuestion: `What should I change in my ${weakest.category.toLowerCase()}? I'm making ${weakest.pct}% in drills.` });
  }

  // 9. A shot that measures well in drills but you rate low in matches.
  for (const sa of shotAverages(matches)) {
    const drill = drills.find((d) => d.category === DRILL_FOR_SHOT[sa.shot]);
    if (drill && sa.average !== null && sa.n >= 3 && drill.pct >= 70 && sa.average <= 3) {
      out.push({ id: `drill-gap-${sa.shot}`, kind: 'watch', score: 58,
        text: `${drill.category} measure ${drill.pct}% in drills, but you rate your ${sa.shot.toLowerCase()} ${sa.average}/5 in matches (your estimate, ${sa.n} matches).`,
        coachQuestion: `My ${sa.shot.toLowerCase()} works in drills but not in matches. How do I practise it under pressure?` });
    }
  }

  // 10. Rating movement over 30 days.
  for (const [kind, hist] of [['singles', input.singles], ['doubles', input.doubles]] as const) {
    const cur = hist.at(-1);
    const then = ratingOn(hist, from);
    if (cur && then !== undefined) {
      const d = Math.round((cur.value - then) * 100) / 100;
      if (d >= 0.05) out.push({ id: `rating-${kind}`, kind: 'progress', score: 40, text: `Your ${kind} DUPR rose ${d.toFixed(2)} in the last 30 days, to ${cur.value.toFixed(2)}.` });
      if (d <= -0.05) out.push({ id: `rating-${kind}`, kind: 'watch', score: 45, text: `Your ${kind} DUPR fell ${Math.abs(d).toFixed(2)} in the last 30 days, to ${cur.value.toFixed(2)}.` });
    }
  }

  // 11. Weekly training goal.
  if (input.weeklyHoursGoal) {
    const hours = Math.round((weekTraining(input.sessions, today).reduce((n, d) => n + d.minutes, 0) / 60) * 10) / 10;
    if (hours >= input.weeklyHoursGoal) out.push({ id: 'week-goal', kind: 'progress', score: 35, text: `You've hit your ${input.weeklyHoursGoal}-hour training goal this week (${hours} h).` });
  }

  // One coach question per shot: a drill question repeats a tag question about the same shot.
  const tagShots = new Set(out.filter((i) => i.id.startsWith('tag-losses-')).map((i) => DRILL_FOR_SHOT[i.id.slice('tag-losses-'.length)]).filter(Boolean));
  for (const i of out) {
    if (i.id.startsWith('weak-drill-') && tagShots.has(i.id.slice('weak-drill-'.length))) delete i.coachQuestion;
  }
  return out.sort((a, b) => b.score - a.score);
}
