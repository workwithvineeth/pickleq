import type { Format, Match, MatchType, Momentum, RatingEntry, SessionType, Setting, Strength, TagMark, TrainingSession } from '../domain/types';
import { RATED_SHOTS } from '../domain/types';
import { byEnergy, filterMatches, form, headToHead, partners, pct, rollingWinPct, splits, summarize, type PersonRecord, type Range, type Splits, type Summary, type TypeFilter } from '../domain/stats';
import type { WinLoss } from '../domain/record';
import { insights, type Insight } from '../domain/insights';
import { drillStats, iso, streak, weekTraining, type DrillStat } from '../domain/training';
import { clubMatchToPersonal } from './domain/toPersonal';
import { STAGE_LABEL, type ClubMatch, type ClubPlayer, type Stage } from './types';

// ---------- Diary: casual and practice matches (never tournament: those only come from official results) ----------

export interface StudioLogInput {
  kind: 'practice' | 'casual';
  played_on: string;
  opponents: string;
  partner: string;
  location: string;
  score_for: number;
  score_against: number;
  reflection: string;
  tags: Record<string, TagMark>;
  /** Empty = worked out from the partner field. */
  match_type: MatchType | null;
  /** Game by game, from your side. One game: score_for/score_against are its points; several: games won. */
  games: { you: number; them: number }[];
  energy: number | null;
  shot_ratings: Record<string, number>;
  setting: Setting | null;
  opponent_strength: Strength | null;
}

export interface StudioLog extends StudioLogInput {
  id: string;
  created_at?: string;
}

export const blankLog = (today: string): StudioLogInput => ({
  kind: 'casual', played_on: today, opponents: '', partner: '', location: '', score_for: 0, score_against: 0, reflection: '', tags: {},
  match_type: null, games: [{ you: 0, them: 0 }], energy: null, shot_ratings: {}, setting: null, opponent_strength: null,
});

/** Problems with a match before it's saved; empty when fine. Fills score_for/score_against from the games. */
export function logProblem(l: StudioLogInput): string {
  if (!l.played_on) return 'Pick a date.';
  if (!l.opponents.trim()) return 'Enter who you played against.';
  if (!l.games.length) return 'Enter the score.';
  for (const [i, g] of l.games.entries()) {
    if (![g.you, g.them].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) return `Game ${i + 1}: scores are 0 to 99.`;
    if (g.you === g.them) return `Game ${i + 1}: a game can’t end level.`;
  }
  const t = logTotals(l.games);
  if (t.for === t.against) return 'The games are level: add the deciding game.';
  return '';
}

export function logTotals(games: { you: number; them: number }[]): { for: number; against: number } {
  if (games.length === 1) return { for: games[0].you, against: games[0].them };
  return { for: games.filter((g) => g.you > g.them).length, against: games.filter((g) => g.them > g.you).length };
}

/** What the database keeps for a match log (trimmed, totals filled in). */
export function cleanLog(l: StudioLogInput): StudioLogInput {
  const t = logTotals(l.games);
  return { ...l, opponents: l.opponents.trim(), partner: l.partner.trim(), location: l.location.trim(), reflection: l.reflection.trim(), score_for: t.for, score_against: t.against };
}

// ---------- DUPR ratings (typed by the player; DUPR is the source of truth) ----------

export type RatingKind = 'singles' | 'doubles';
export interface StudioRatingInput { kind: RatingKind; value: number; rated_on: string }
export interface StudioRating extends StudioRatingInput { id: string }
/** One point in the history: yours, or the organiser's number from an entry list (read-only). */
export interface RatingPoint { id: string; value: number; date: string; source: 'you' | 'organiser'; club?: string }

export function ratingProblem(r: StudioRatingInput, today = new Date()): string {
  if (!Number.isFinite(r.value) || r.value < 1 || r.value > 8) return 'A DUPR rating is between 1.000 and 8.000.';
  if (!r.rated_on) return 'Pick the date you read it on DUPR.';
  if (r.rated_on > iso(new Date(today.getTime() + 86_400_000))) return 'That date is in the future.';
  return '';
}

/** Newest first: your readings, plus the organisers' numbers from your claimed entries (dated when you claimed). */
export function ratingHistory(kind: RatingKind, d: Pick<StudioData, 'ratings' | 'players'>): RatingPoint[] {
  const mine: RatingPoint[] = d.ratings.filter((r) => r.kind === kind).map((r) => ({ id: r.id, value: r.value, date: r.rated_on, source: 'you' }));
  const org: RatingPoint[] = d.players.flatMap((p) => {
    const v = kind === 'singles' ? p.duprSingles : p.duprDoubles;
    return v === undefined ? [] : [{ id: `org-${p.playerId}`, value: v, date: p.claimedAt.slice(0, 10), source: 'organiser' as const, club: p.club }];
  });
  return [...mine, ...org].sort((a, b) => b.date.localeCompare(a.date) || (a.source === 'you' ? -1 : 1));
}

/** The number to prefill a new reading with: your latest, else the organiser's. */
export const ratingPrefill = (kind: RatingKind, d: Pick<StudioData, 'ratings' | 'players'>) => ratingHistory(kind, d)[0]?.value;

/** Your readings as Phase 1 rating entries (newest first), for the coach and the stronger/weaker split. */
export function ratingEntries(kind: RatingKind, d: Pick<StudioData, 'ratings' | 'players'>): RatingEntry[] {
  return ratingHistory(kind, d).map((p) => ({ id: p.id, kind, value: p.value, date: p.date, source: 'dupr-manual', createdAt: 0 }));
}

// ---------- Diary: practice sessions (the Phase 1 diary) ----------

export interface StudioDrill { category: string; made: number; attempts: number }

export interface StudioSessionInput {
  session_on: string;
  kind: SessionType;
  /** 0 for a rest day */
  minutes: number;
  intensity: number | null;
  drills: StudioDrill[];
  /** Your own 1–5 estimates, never mixed with measured drills. */
  ratings: Record<string, number>;
  note: string;
}

export interface StudioSession extends StudioSessionInput {
  id: string;
  created_at: string;
}

/** Problems with a practice session before it's saved, in plain words; empty when it's fine. */
export function sessionProblem(s: StudioSessionInput, today = new Date()): string {
  if (!s.session_on) return 'Pick a date.';
  if (s.session_on > iso(new Date(today.getTime() + 86_400_000))) return 'That date is in the future.';
  if (s.kind === 'rest') return '';
  if (!Number.isFinite(s.minutes) || s.minutes < 1 || s.minutes > 600) return 'Enter how many minutes you practised (1 to 600).';
  for (const d of s.drills) {
    if (!d.category.trim()) return 'Give every drill a name.';
    if (!Number.isInteger(d.attempts) || d.attempts < 1) return `${d.category}: enter how many tries.`;
    if (!Number.isInteger(d.made) || d.made < 0 || d.made > d.attempts) return `${d.category}: made can’t be more than tries.`;
  }
  return '';
}

/** What the database keeps: a rest day has no minutes, drills or ratings. */
export function cleanSession(s: StudioSessionInput): StudioSessionInput {
  if (s.kind === 'rest') return { ...s, minutes: 0, intensity: null, drills: [], ratings: {} };
  return { ...s, drills: s.drills.map((d) => ({ ...d, category: d.category.trim() })), note: s.note.trim() };
}

// ---------- Official results (read-only, from RallyQ tournaments) ----------

export interface OfficialPlayer { id: string; name: string }
export interface OfficialMatch {
  id: string;
  club: string;
  tournament: string;
  tournamentId: string;
  division?: string;
  kind?: 'singles' | 'doubles';
  stage: Stage;
  playedOn: string;
  format: Partial<Format>;
  games: { a: number; b: number; points?: string }[];
  winner: 'A' | 'B';
  mySide: 'A' | 'B';
  me: string;
  sideA: OfficialPlayer[];
  sideB: OfficialPlayer[];
}

export interface ClaimPreview { playerId: string; name: string; club: string; matches: number; wins: number; tournaments: { name: string; date: string }[] }
export interface FoundPlayer extends Omit<ClaimPreview, 'playerId'> { playerId: string }
export interface MyPlayer { playerId: string; name: string; club: string; claimedAt: string; duprSingles?: number; duprDoubles?: number }

export type GoalKind = 'rating' | 'weekly-minutes' | 'drill-rate' | 'streak' | 'win-rate';
export interface StudioGoal { kind: GoalKind; target: number; drill?: string; rating?: RatingKind }
export interface StudioSettings { useOfficial: boolean; goals: StudioGoal[] }

export interface StudioData {
  players: MyPlayer[];
  official: OfficialMatch[];
  logs: StudioLog[];
  sessions: StudioSession[];
  ratings: StudioRating[];
  settings: StudioSettings;
}

const FULL_FORMAT: Format = { pointsTo: 11, bestOf: 1, scoring: 'sideout' };

/** An official match as a match in the Phase 1 sense, from your side of the net, with momentum when it was scored live. */
export function officialToMatch(o: OfficialMatch): Match {
  const names = new Map<string, ClubPlayer>([...o.sideA, ...o.sideB].map((p) => [p.id, { id: p.id, clubId: '', name: p.name, share: {} }]));
  const format = { ...FULL_FORMAT, ...o.format } as Format;
  const cm: ClubMatch = {
    id: o.id, clubId: '', tournamentId: o.tournamentId, stage: o.stage, sideA: o.sideA.map((p) => p.id), sideB: o.sideB.map((p) => p.id),
    format, games: o.games.map((g) => ({ a: g.a, b: g.b, points: g.points ?? '' })), status: 'done', winner: o.winner,
    playedOn: o.playedOn, updatedAt: o.playedOn,
  };
  const nm = clubMatchToPersonal(cm, o.me, names, o.club, o.tournament);
  const base: Match = nm
    ? { ...nm, id: o.id, createdAt: 0, updatedAt: 0, history: [], backfilled: !o.games.every((g) => g.points) }
    : { id: o.id, date: o.playedOn, type: 'singles', category: 'tournament', format, participants: [], outcome: 'played', games: [], won: o.winner === o.mySide,
      status: 'complete', backfilled: true, tags: {}, createdAt: 0, updatedAt: 0, history: [] };
  return base;
}

/** A casual or practice match from your diary, as a Phase 1 match (self-reported, no point-by-point momentum). */
export function logToMatch(l: StudioLog): Match {
  const partner = l.partner.trim();
  const games = l.games.length ? l.games : [{ you: l.score_for, them: l.score_against }];
  const strength = l.opponent_strength ?? undefined;
  return {
    id: l.id, date: l.played_on, type: l.match_type ?? (partner ? 'doubles' : 'singles'), category: l.kind, format: { ...FULL_FORMAT, bestOf: games.length > 1 ? 3 : 1 },
    participants: [...(partner ? [{ name: partner, role: 'partner' as const }] : []),
      ...l.opponents.split(/[,&]| and /).map((n) => n.trim()).filter(Boolean).map((name) => ({ name, role: 'opponent' as const, ...(strength ? { strength } : {}) }))],
    outcome: 'played', games: games.map((g) => ({ you: g.you, them: g.them, momentum: 'neither' as const })), won: l.score_for > l.score_against,
    status: 'complete', backfilled: true, tags: l.tags, venue: l.location || undefined, notes: l.reflection || undefined,
    energy: l.energy ?? undefined, setting: l.setting ?? undefined, shotRatings: Object.keys(l.shot_ratings).length ? l.shot_ratings : undefined,
    createdAt: Date.parse(l.created_at ?? '') || 0, updatedAt: 0, history: [],
  };
}

/** A practice session as a Phase 1 training session. */
export function sessionToTraining(s: StudioSession): TrainingSession {
  const at = Date.parse(s.created_at) || 0;
  return { id: s.id, date: s.session_on, type: s.kind, minutes: s.minutes, intensity: s.intensity ?? undefined, drills: s.drills, notes: s.note || undefined, createdAt: at, updatedAt: at };
}

export const stageText = (o: Pick<OfficialMatch, 'stage'>) => STAGE_LABEL[o.stage] ?? 'Match';
export const opponentsOf = (o: OfficialMatch) => (o.mySide === 'A' ? o.sideB : o.sideA).map((p) => p.name).join(' & ');
export const partnerOf = (o: OfficialMatch) => (o.mySide === 'A' ? o.sideA : o.sideB).filter((p) => p.id !== o.me).map((p) => p.name).join(' & ');
/** The games from your side, e.g. "11–7, 9–11". */
export const scoreText = (o: OfficialMatch) => o.games.map((g) => (o.mySide === 'A' ? `${g.a}–${g.b}` : `${g.b}–${g.a}`)).join(', ');

export interface GameStory { you: number | null; them: number | null; momentum: Momentum; from?: string }
/** What happened in each game of an official match, from the point-by-point record when the court scored it live. */
export function matchStory(o: OfficialMatch): { tracked: boolean; games: GameStory[] } {
  const m = officialToMatch(o);
  return {
    tracked: !m.backfilled,
    games: m.games.map((g) => ({ you: g.you, them: g.them, momentum: m.backfilled ? 'neither' : g.momentum, ...(g.fromYou !== undefined && g.fromThem !== undefined ? { from: `${g.fromYou}–${g.fromThem}` } : {}) })),
  };
}

// ---------- Stats ----------

export type Source = 'all' | 'official' | 'diary';
export interface StudioFilter { source: Source; range: Range; type: TypeFilter }
export const ALL_TIME: StudioFilter = { source: 'all', range: 'all', type: 'all' };

export interface StudioStats {
  matches: Match[];
  summary: Summary;
  officialSummary: Summary;
  winPct: number | null;
  officialWinPct: number | null;
  form: ('W' | 'L')[];
  splits: Splits;
  energy: { level: number; record: WinLoss }[];
  opponents: PersonRecord[];
  partners: PersonRecord[];
  trend: { date: string; pct: number; n: number }[];
  week: { date: string; minutes: number; rest: boolean }[];
  weekMinutes: number;
  streak: number;
  drills: DrillStat[];
  sessions30: number;
  minutes30: number;
  ratings: { shot: string; average: number; n: number }[];
  singlesRating?: number;
  doublesRating?: number;
}

/** Newest first, with official results left out when you chose that. */
export function studioMatches(d: Pick<StudioData, 'official' | 'logs' | 'settings'>, source: Source = 'all'): Match[] {
  const off = source === 'diary' || (source === 'all' && !d.settings.useOfficial) ? [] : d.official.map(officialToMatch);
  const mine = source === 'official' ? [] : d.logs.map(logToMatch);
  return [...off, ...mine].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function studioStats(d: StudioData, f: StudioFilter = ALL_TIME, today = new Date()): StudioStats {
  const matches = filterMatches(studioMatches(d, f.source), { range: f.range, type: f.type }, today);
  const sessions = d.sessions.map(sessionToTraining);
  const from30 = iso(new Date(today.getTime() - 30 * 86_400_000));
  const recent = sessions.filter((s) => s.date >= from30);
  const week = weekTraining(sessions, today);
  const summary = summarize(matches);
  const officialSummary = summarize(d.official.map(officialToMatch));
  const singles = ratingEntries('singles', d), doubles = ratingEntries('doubles', d);
  // Shot ratings: from practice sessions and logged matches alike (all your own estimates).
  const ratingMap = new Map<string, number[]>();
  for (const r of [...d.sessions.map((x) => x.ratings), ...d.logs.map((x) => x.shot_ratings)]) for (const [shot, v] of Object.entries(r)) ratingMap.set(shot, [...(ratingMap.get(shot) ?? []), v]);
  return {
    matches, summary, officialSummary, winPct: pct(summary.record), officialWinPct: pct(officialSummary.record),
    form: form(matches), splits: splits(matches, singles, doubles), energy: byEnergy(matches),
    opponents: headToHead(matches).slice(0, 8), partners: partners(matches).slice(0, 8), trend: rollingWinPct(matches),
    week, weekMinutes: week.reduce((n, x) => n + x.minutes, 0), streak: streak(sessions, today), drills: drillStats(sessions),
    sessions30: recent.filter((s) => s.type !== 'rest').length, minutes30: recent.reduce((n, s) => n + s.minutes, 0),
    ratings: [...RATED_SHOTS, ...[...ratingMap.keys()].filter((k) => !(RATED_SHOTS as readonly string[]).includes(k))]
      .filter((shot) => ratingMap.has(shot))
      .map((shot) => { const v = ratingMap.get(shot)!; return { shot, n: v.length, average: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 }; }),
    singlesRating: singles[0]?.value, doublesRating: doubles[0]?.value,
  };
}

// ---------- Coach: what's measured vs what's only your own estimate ----------

export interface CoachCard { id: string; evidence: 'measured' | 'self-reported'; kind: Insight['kind']; text: string; question?: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Coach cards. "Measured" cards come only from official results and drill counts; "self-reported" cards come from your
 * diary (casual and practice scores, tags, 1–5 ratings) and are never presented as proven. Each needs enough data first.
 */
export function studioCoach(d: StudioData, today = new Date()): CoachCard[] {
  const out: CoachCard[] = [];
  const off = d.settings.useOfficial ? d.official.map(officialToMatch) : [];
  if (off.length >= 3) {
    const s = summarize(off);
    const all = pct(s.record);
    const closeN = s.closeGames.wins + s.closeGames.losses;
    const close = pct(s.closeGames);
    if (closeN >= 3 && close !== null && all !== null) {
      out.push({ id: 'official-close', evidence: 'measured', kind: close < all - 10 ? 'watch' : 'strength',
        text: `In official matches you've won ${s.closeGames.wins} of ${closeN} close games (3 points or fewer), and ${s.record.wins} of ${s.matches} matches.`,
        question: close < all - 10 ? 'What should I change at the end of tight games?' : undefined });
    }
    if (s.trackedGames >= 3 && (s.comebacks || s.lostLeads)) {
      out.push({ id: 'official-momentum', evidence: 'measured', kind: s.lostLeads > s.comebacks ? 'watch' : 'strength',
        text: `From point-by-point scoring: ${plural(s.comebacks, 'comeback')}${s.biggestComeback ? ` (biggest from ${s.biggestComeback.from})` : ''} and ${plural(s.lostLeads, 'lost lead')}${s.biggestLostLead ? ` (biggest from ${s.biggestLostLead.from} up)` : ''} in ${plural(s.trackedGames, 'tracked game')}.`,
        question: s.lostLeads > s.comebacks ? 'How do I keep control when I’m ahead?' : undefined });
    }
  }
  const sessions = d.sessions.map(sessionToTraining);
  const from = iso(new Date(today.getTime() - 28 * 86_400_000));
  for (const ds of drillStats(sessions).filter((x) => x.attempts >= 40).slice(0, 3)) {
    const recent = drillStats(sessions, from).find((x) => x.category.toLowerCase() === ds.category.toLowerCase());
    const earlierMade = ds.made - (recent?.made ?? 0), earlierTries = ds.attempts - (recent?.attempts ?? 0);
    const before = earlierTries >= 20 ? Math.round((earlierMade / earlierTries) * 100) : null;
    const now = recent && recent.attempts >= 20 ? recent.pct : null;
    const trend = before !== null && now !== null ? ` Last 4 weeks ${now}%, before that ${before}%.` : '';
    out.push({ id: `drill-${ds.category}`, evidence: 'measured', kind: before !== null && now !== null && now >= before + 5 ? 'progress' : ds.pct < 60 ? 'watch' : 'strength',
      text: `${ds.category}: ${ds.made} made of ${ds.attempts} tries (${ds.pct}%) over ${plural(ds.sessions, 'session')}.${trend}` });
  }
  // Diary patterns use the Phase 1 rules, on self-reported matches only.
  const weekly = d.settings.goals.find((g) => g.kind === 'weekly-minutes');
  for (const x of insights({ matches: d.logs.map(logToMatch).sort((a, b) => b.date.localeCompare(a.date)), sessions, singles: ratingEntries('singles', d), doubles: ratingEntries('doubles', d), weeklyHoursGoal: weekly ? weekly.target / 60 : undefined, today })) {
    out.push({ id: `diary-${x.id}`, evidence: 'self-reported', kind: x.kind, text: x.text, question: x.coachQuestion });
  }
  const st = studioStats(d, ALL_TIME, today);
  const low = st.ratings.filter((r) => r.n >= 3).sort((a, b) => a.average - b.average)[0];
  if (low && low.average < 3.5) {
    out.push({ id: `rating-${low.shot}`, evidence: 'self-reported', kind: 'watch', text: `You rate your ${low.shot.toLowerCase()} ${low.average} out of 5 on average (${plural(low.n, 'rating')}). That's your estimate, not a measurement: a drill with counted tries would show it.` });
  }
  const order = { watch: 0, progress: 1, strength: 2 } as const;
  return out.sort((a, b) => (a.evidence === b.evidence ? order[a.kind] - order[b.kind] : a.evidence === 'measured' ? -1 : 1));
}

// ---------- Goals ----------

export const GOAL_LABEL: Record<GoalKind, string> = {
  rating: 'DUPR rating', 'weekly-minutes': 'Practice minutes this week', 'drill-rate': 'Drill success', streak: 'Days in a row', 'win-rate': 'Official win rate',
};

export function goalProgress(g: StudioGoal, st: StudioStats): { current: number; target: number; fraction: number; text: string } {
  if (g.kind === 'rating') {
    const now = g.rating === 'doubles' ? st.doublesRating : st.singlesRating;
    const label = `${g.rating === 'doubles' ? 'Doubles' : 'Singles'} DUPR`;
    return { current: now ?? 0, target: g.target, fraction: now ? Math.min(1, now / g.target) : 0, text: now ? `${label}: ${now.toFixed(3)} of ${g.target.toFixed(3)}` : `${label}: add a reading to track ${g.target.toFixed(3)}` };
  }
  let current = 0;
  if (g.kind === 'weekly-minutes') current = st.weekMinutes;
  else if (g.kind === 'streak') current = st.streak;
  else if (g.kind === 'win-rate') current = st.officialWinPct ?? 0;
  else current = st.drills.find((x) => x.category.toLowerCase() === (g.drill ?? '').toLowerCase())?.pct ?? 0;
  const unit = g.kind === 'weekly-minutes' ? ' min' : g.kind === 'streak' ? ' days' : '%';
  const label = g.kind === 'drill-rate' ? `${g.drill ?? 'Drill'} success` : GOAL_LABEL[g.kind];
  return { current, target: g.target, fraction: g.target > 0 ? Math.min(1, current / g.target) : 0, text: `${label}: ${current}${unit} of ${g.target}${unit}` };
}

/** The one-line story on Home: your latest official result, or a nudge to claim or log. */
export function homeStory(d: StudioData): string {
  const last = d.official[0];
  if (last) {
    const won = last.winner === last.mySide;
    const story = matchStory(last).games.find((g) => g.momentum === 'came-back');
    if (won && story?.from) return `Came back from ${story.from} to win in ${last.tournament} (${stageText(last)}).`;
    return `${won ? 'Won' : 'Lost'} ${scoreText(last)} against ${opponentsOf(last)} in ${last.tournament} (${stageText(last)}).`;
  }
  if (d.logs.length || d.sessions.length) return 'Your diary is going. Claim your tournament results to see them here too.';
  return 'Claim your tournament results, then log practice and casual games here.';
}
