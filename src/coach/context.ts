import { fmtRating } from '../domain/record';
import { ratingOn } from '../db/ratings';
import { shotAverages, tagStats } from '../domain/insights';
import { scoreLine } from '../domain/scoring';
import { splits, summarize } from '../domain/stats';
import { eventMatches, placementLabel, standings, tournamentSummary, type Tournament } from '../domain/tournaments';
import { drillStats, goalTitle, iso } from '../domain/training';
import type { Goal, Match, RatingEntry, TrainingSession, WinLossLike } from './contextTypes';
import type { TaskId, TaskParams } from './tasks';

export interface CoachData {
  matches: Match[]; // active, newest first
  sessions: TrainingSession[];
  singles: RatingEntry[];
  doubles: RatingEntry[];
  goals: Goal[];
  tournaments: Tournament[];
}

const MAX_MATCHES = 120;
const DAY = 86_400_000;
const daysBack = (today: Date, n: number) => iso(new Date(today.getTime() - n * DAY));
const pct = (w: WinLossLike) => (w.wins + w.losses ? `${Math.round((w.wins / (w.wins + w.losses)) * 100)}%` : 'n/a');
const wl = (w: WinLossLike) => `${w.wins}–${w.losses} (${pct(w)})`;

export interface Period { label: string; from: string; to: string }

export function periodsFor(task: TaskId, params: TaskParams, today: Date): Period[] {
  const t = iso(today);
  if (task === 'weekly') return [{ label: 'Last 7 days', from: daysBack(today, 6), to: t }, { label: 'The 28 days before', from: daysBack(today, 34), to: daysBack(today, 7) }];
  if (task === 'compare') {
    if (params.compare === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const prevFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevLast = new Date(today.getFullYear(), today.getMonth(), 0);
      return [{ label: 'This month', from: iso(first), to: t }, { label: 'Last month', from: iso(prevFirst), to: iso(prevLast) }];
    }
    const n = params.compare === '90v90' ? 90 : 30;
    return [{ label: `Last ${n} days`, from: daysBack(today, n - 1), to: t }, { label: `The ${n} days before`, from: daysBack(today, 2 * n - 1), to: daysBack(today, n) }];
  }
  if (task === 'tournament') return [];
  return [{ label: task === 'plan' ? 'Last 30 days' : 'Last 90 days', from: daysBack(today, task === 'plan' ? 29 : 89), to: t }];
}

const inRange = (d: string, p: Period) => d >= p.from && d <= p.to;

function people(m: Match): string {
  const fmt = (p: Match['participants'][number]) => `${p.name || 'unnamed'}${p.rating !== undefined ? ` ${p.rating}` : p.strength ? ` (${p.strength})` : ''}`;
  const partner = m.participants.filter((p) => p.role === 'partner').map(fmt).join(', ');
  const opp = m.participants.filter((p) => p.role === 'opponent').map(fmt).join(' & ');
  return `${partner ? `partner ${partner} | ` : ''}vs ${opp || 'not recorded'}`;
}

function matchLine(m: Match, tournaments: Tournament[]): string {
  const mom = m.backfilled ? 'not tracked' : m.games.map((g) => g.momentum === 'came-back' ? `came back from ${g.fromYou}–${g.fromThem}` : g.momentum === 'lost-lead' ? `lost lead from ${g.fromYou}–${g.fromThem}` : g.momentum).join('; ');
  const tags = Object.entries(m.tags).map(([t, v]) => `${t}: ${v === 'needs-work' ? 'needs work' : 'went well'}`).join(', ');
  const shots = m.shotRatings ? Object.entries(m.shotRatings).map(([s, v]) => `${s} ${v}/5`).join(', ') : '';
  const t = m.tournament ? tournaments.find((x) => x.id === m.tournament!.tournamentId) : undefined;
  const ev = t?.events.find((e) => e.id === m.tournament?.eventId);
  const where = t ? ` | tournament ${t.name} / ${ev?.name ?? ''} / ${m.tournament!.stage === 'knockout' ? m.tournament!.round ?? 'knockout' : 'pool'}` : '';
  return [m.date, m.type, m.category, m.won ? 'WIN' : 'LOSS', scoreLine(m), people(m), `momentum: ${mom}`, tags && `tags: ${tags}`, shots && `shot estimates: ${shots}`,
    m.energy && `energy ${m.energy}/5`, m.venue && `venue ${m.venue}`, m.notes && `notes: "${m.notes.replace(/\s+/g, ' ').slice(0, 400)}"`, m.backfilled && 'backfilled (score only)', m.status === 'incomplete' && 'details not added']
    .filter(Boolean).join(' | ') + where;
}

function sessionLine(s: TrainingSession): string {
  return [s.date, s.type, s.type === 'rest' ? 'rest day' : `${s.minutes} min`, s.intensity && `intensity ${s.intensity}/5`, s.fatigue && `fatigue ${s.fatigue}/5`,
    s.drills.length && `drills: ${s.drills.map((d) => `${d.category} ${d.made}/${d.attempts}`).join(', ')}`, s.notes && `notes: "${s.notes.replace(/\s+/g, ' ').slice(0, 300)}"`].filter(Boolean).join(' | ');
}

function statsBlock(label: string, ms: Match[], ss: TrainingSession[], d: CoachData): string[] {
  const s = summarize(ms);
  const sp = splits(ms, d.singles, d.doubles);
  const minutes = ss.reduce((n, x) => n + x.minutes, 0);
  const tags = tagStats(ms).filter((t) => t.needsWork + t.wentWell > 0).sort((a, b) => b.needsWork - a.needsWork);
  const shots = shotAverages(ms).filter((x) => x.n > 0);
  const drills = drillStats(ss);
  const out = [
    `[${label}] matches ${s.matches}; record ${wl(s.record)}; games ${wl(s.games)}`,
    `  singles ${wl(sp.byType.singles)}; doubles ${wl(sp.byType.doubles)}; mixed ${wl(sp.byType.mixed)}`,
    `  casual ${wl(sp.byCategory.casual)}; practice ${wl(sp.byCategory.practice)}; tournament ${wl(sp.byCategory.tournament)}`,
    `  vs stronger ${wl(sp.byStrength.stronger)}; vs equal ${wl(sp.byStrength.equal)}; vs weaker ${wl(sp.byStrength.weaker)}; strength unknown in ${sp.strengthUnknown} matches`,
    `  close games (margin ≤3) ${wl(s.closeGames)}; average points per game ${s.pointsFor ?? 'n/a'} for, ${s.pointsAgainst ?? 'n/a'} against`,
    `  momentum over ${s.trackedGames} tracked games: ${s.comebacks} comebacks, ${s.lostLeads} lost leads, ${s.dominated} dominated${s.biggestComeback ? `; biggest comeback from ${s.biggestComeback.from}` : ''}${s.biggestLostLead ? `; biggest lost lead from ${s.biggestLostLead.from}` : ''}`,
    `  training: ${ss.filter((x) => x.type !== 'rest').length} sessions, ${Math.round((minutes / 60) * 10) / 10} hours, ${ss.filter((x) => x.type === 'rest').length} rest days`,
  ];
  if (tags.length) out.push(`  tags (needs work in losses / in wins; went well in wins): ${tags.map((t) => `${t.tag} ${t.needsInLosses}/${t.needsInWins}; ${t.wellInWins}`).join(' · ')}`);
  if (shots.length) out.push(`  shot ESTIMATES by the player, 1–5 (average, n): ${shots.map((x) => `${x.shot} ${x.average} (${x.n})`).join(', ')}`);
  if (drills.length) out.push(`  MEASURED drill success: ${drills.map((x) => `${x.category} ${x.pct}% (${x.made}/${x.attempts})`).join(', ')}`);
  return out;
}

function ratingsBlock(d: CoachData, today: Date): string[] {
  const line = (name: string, h: RatingEntry[]) => {
    if (!h.length) return `${name} DUPR: not entered`;
    const cur = h.at(-1)!;
    const then = ratingOn(h, daysBack(today, 90));
    return `${name} DUPR: ${fmtRating(cur.value)} on ${cur.date}${then !== undefined ? ` (${fmtRating(then)} 90 days ago)` : ''}; history ${h.slice(-8).map((r) => `${r.date} ${fmtRating(r.value)}`).join(', ')}`;
  };
  return [line('Singles', d.singles), line('Doubles', d.doubles)];
}

function tournamentBlock(t: Tournament, d: CoachData, todayIso: string): string[] {
  const ms = eventMatches(d.matches, t);
  const sum = tournamentSummary(t, d.matches);
  const out = [`TOURNAMENT ${t.name}, ${t.startDate} to ${t.endDate}${t.venue ? `, ${t.venue}` : ''}${t.endDate < todayIso ? ' (finished)' : ' (not finished yet)'}`,
    `  overall ${sum.wins}–${sum.losses}; points ${sum.pointsFor}–${sum.pointsAgainst}; medals ${sum.medals}`];
  for (const ev of t.events) {
    const e = sum.events.find((x) => x.eventId === ev.id)!;
    const st = standings(ev, eventMatches(d.matches, t, ev.id));
    out.push(`  EVENT ${ev.name} (${ev.type}${ev.partnerName ? ` with ${ev.partnerName}` : ''}, ${ev.structure}): ${e.wins}–${e.losses}; games ${e.gamesWon}–${e.gamesLost}; points ${e.pointsFor}–${e.pointsAgainst}; close games ${e.close}; comebacks ${e.cameBack}; lost leads ${e.lostLead}; placement ${placementLabel(e.placement) ?? 'not entered'}${e.bestKo ? `; furthest knockout round ${e.bestKo}` : ''}`);
    if (ev.teams.length) out.push(`    pool table (${st.complete ? 'complete' : `partial, ${st.entered} of ${st.total} matches`}): ${st.rows.map((r) => `${r.rank}. ${r.name} ${r.won}–${r.lost} ${r.diff >= 0 ? '+' : ''}${r.diff}`).join('; ')}`);
    if (ev.poolPosition) out.push(`    player says final pool position: ${ev.poolPosition}`);
  }
  if (t.notes) out.push(`  player's reflections: "${t.notes}"`);
  out.push('  matches:', ...ms.map((m) => `    ${matchLine(m, d.tournaments)}`));
  return out;
}

/** Everything Claude gets to see for one task, as plain text. Only real records go in. */
export function buildContext(task: TaskId, params: TaskParams, d: CoachData, today = new Date()): string {
  const todayIso = iso(today);
  const out: string[] = [`TODAY: ${todayIso}`, 'RATINGS', ...ratingsBlock(d, today)];
  const goals = d.goals.map((g) => `${goalTitle(g)}${g.achieved ? ' (achieved)' : ''}`);
  out.push(`GOALS: ${goals.length ? goals.join('; ') : 'none set'}`);
  const upcoming = d.tournaments.filter((t) => t.deletedAt === undefined && t.endDate >= todayIso).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (upcoming && task !== 'tournament') out.push(`NEXT TOURNAMENT: ${upcoming.name} on ${upcoming.startDate} (${upcoming.events.map((e) => e.name).join(', ')})`);

  if (task === 'tournament') {
    const t = d.tournaments.find((x) => x.id === params.tournamentId);
    if (!t) return out.concat('TOURNAMENT: not found').join('\n');
    out.push('', ...tournamentBlock(t, d, todayIso));
    const before: Period = { label: '30 days before the tournament', from: daysBack(new Date(`${t.startDate}T12:00:00`), 30), to: daysBack(new Date(`${t.startDate}T12:00:00`), 1) };
    out.push('', 'COMPUTED STATS (calculated by the app — use these numbers)', ...statsBlock(before.label, d.matches.filter((m) => inRange(m.date, before)), d.sessions.filter((s) => inRange(s.date, before)), d));
    return out.join('\n');
  }

  const periods = periodsFor(task, params, today);
  out.push('', 'COMPUTED STATS (calculated by the app — use these numbers, do not recount)');
  for (const p of periods) out.push(...statsBlock(`${p.label}: ${p.from} to ${p.to}`, d.matches.filter((m) => inRange(m.date, p)), d.sessions.filter((s) => inRange(s.date, p)), d));
  if (task === 'plan' || task === 'chat' || task === 'questions') {
    const p90: Period = { label: 'Last 90 days', from: daysBack(today, 89), to: todayIso };
    if (!periods.some((p) => p.from === p90.from)) out.push(...statsBlock(`${p90.label}: ${p90.from} to ${p90.to}`, d.matches.filter((m) => inRange(m.date, p90)), d.sessions.filter((s) => inRange(s.date, p90)), d));
    out.push(...statsBlock('All time', d.matches, d.sessions, d));
  }

  const span: Period = { label: 'all', from: periods.reduce((a, p) => (p.from < a ? p.from : a), todayIso), to: todayIso };
  const ms = d.matches.filter((m) => inRange(m.date, span));
  const ss = d.sessions.filter((s) => inRange(s.date, span));
  if (task === 'notes') {
    const withNotes = ms.filter((m) => m.notes?.trim());
    const sNotes = ss.filter((s) => s.notes?.trim());
    out.push('', `MATCHES WITH NOTES (${withNotes.length} of ${ms.length} matches in the period):`, ...withNotes.slice(0, MAX_MATCHES).map((m) => `- ${matchLine(m, d.tournaments)}`));
    out.push('', `TRAINING NOTES (${sNotes.length} of ${ss.length} sessions):`, ...sNotes.map((s) => `- ${sessionLine(s)}`));
    return out.join('\n');
  }
  out.push('', `MATCHES (${ms.length} in the period${ms.length > MAX_MATCHES ? `, newest ${MAX_MATCHES} listed` : ''}; newest first):`, ...ms.slice(0, MAX_MATCHES).map((m) => `- ${matchLine(m, d.tournaments)}`));
  out.push('', `TRAINING SESSIONS (${ss.length}):`, ...ss.slice(0, 80).map((s) => `- ${sessionLine(s)}`));
  return out.join('\n');
}

export const hasEnoughData = (task: TaskId, params: TaskParams, d: CoachData, today = new Date()): string | null => {
  if (task === 'tournament') {
    const t = d.tournaments.find((x) => x.id === params.tournamentId);
    if (!t) return 'Pick a tournament';
    return eventMatches(d.matches, t).length ? null : 'Log at least one match in this tournament first';
  }
  if (task === 'chat' && !params.question?.trim()) return 'Type your question';
  const ps = periodsFor(task, params, today);
  const n = d.matches.filter((m) => ps.some((p) => inRange(m.date, p))).length + d.sessions.filter((s) => ps.some((p) => inRange(s.date, p))).length;
  if (task === 'notes' && !d.matches.some((m) => m.notes?.trim()) && !d.sessions.some((s) => s.notes?.trim())) return 'Add some notes to matches or training first';
  return n === 0 ? 'There are no matches or training sessions in this period yet' : null;
};
