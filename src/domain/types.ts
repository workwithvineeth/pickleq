import type { TournamentLink } from './tournaments';
export type MatchType = 'singles' | 'doubles' | 'mixed';
export type Category = 'casual' | 'practice' | 'tournament';
export type Scoring = 'sideout' | 'rally';
export type PointsTo = 11 | 15 | 21;
export type BestOf = 1 | 3;

export interface Format {
  pointsTo: PointsTo;
  bestOf: BestOf;
  scoring: Scoring;
}

export type Momentum = 'came-back' | 'lost-lead' | 'dominated' | 'neither';

export interface Game {
  you: number | null;
  them: number | null;
  momentum: Momentum;
  /** The score the comeback started from, or the lead was lost from. */
  fromYou?: number;
  fromThem?: number;
}

/** played = normal match; walkover = no play; retired = someone stopped part-way. */
export type Outcome = 'played' | 'walkover' | 'retired';
export type Strength = 'stronger' | 'equal' | 'weaker';

export interface Participant {
  playerId?: string;
  name: string;
  role: 'partner' | 'opponent';
  /** DUPR rating at the time of the match, if known. */
  rating?: number;
  /** Used only when the rating is unknown. */
  strength?: Strength;
}

export type TagMark = 'needs-work' | 'went-well';
export type Setting = 'indoor' | 'outdoor';

export interface HistoryChange {
  field: string;
  from: string;
  to: string;
}
export interface HistoryEntry {
  at: number;
  changes: HistoryChange[];
}

/** Where a match imported from Club mode came from. */
export interface ClubLink { matchId: string; clubName: string }

export interface Match {
  id: string;
  /** yyyy-mm-dd */
  date: string;
  type: MatchType;
  category: Category;
  format: Format;
  participants: Participant[];
  outcome: Outcome;
  games: Game[];
  won: boolean;
  status: 'complete' | 'incomplete';
  backfilled: boolean;
  tags: Record<string, TagMark>;
  energy?: number;
  venue?: string;
  setting?: Setting;
  notes?: string;
  /** Your own 1–5 estimates after the match. Never mixed with measured drill results. */
  shotRatings?: Record<string, number>;
  /** Set when the match was played in a tournament you've entered in PICKLEQ. */
  tournament?: TournamentLink;
  /** Set when the match came from your club (Club mode). Used to avoid adding it twice. */
  club?: ClubLink;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  history: HistoryEntry[];
}

export interface Player {
  id: string;
  name: string;
  nameKey: string;
  lastRating?: number;
  lastStrength?: Strength;
  lastUsedAt: number;
}

export const TAGS = [
  'Unforced errors',
  'Third-shot drop',
  'Backhand drive',
  'Serve',
  'Return',
  'Dinking',
  'Defending power',
  'Positioning',
  'Shot selection',
  'Focus when leading',
  'Composure when behind',
  'Partner communication',
] as const;

export const DEFAULT_FORMAT: Format = { pointsTo: 11, bestOf: 1, scoring: 'sideout' };

export function emptyGame(): Game {
  return { you: null, them: null, momentum: 'neither' };
}

export type RatingKind = 'singles' | 'doubles';
export type RatingSource = 'dupr-manual';

/** One DUPR rating reading. DUPR is the source of truth; PICKLEQ never calculates ratings. */
export interface RatingEntry {
  id: string;
  kind: RatingKind;
  value: number;
  /** yyyy-mm-dd the rating was read from DUPR */
  date: string;
  source: RatingSource;
  createdAt: number;
}

/** Shots you can rate 1–5 after a match (your estimate). */
export const RATED_SHOTS = ['Serve', 'Return', 'Third-shot drop', 'Dink', 'Forehand drive', 'Backhand drive'] as const;

export type SessionType = 'solo' | 'partner' | 'coaching' | 'clinic' | 'fitness' | 'rest';
export const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: 'solo', label: 'Solo drills' }, { value: 'partner', label: 'Partner drills' }, { value: 'coaching', label: 'Coaching' },
  { value: 'clinic', label: 'Group clinic' }, { value: 'fitness', label: 'Fitness' }, { value: 'rest', label: 'Rest day' },
];

export const STARTER_DRILLS = [
  'Dinks', 'Third-shot drops', 'Forehand drives', 'Backhand drives', 'Serves', 'Returns',
  'Volleys', 'Resets', 'Lobs and overheads', 'Footwork',
] as const;

/** A measured drill result, e.g. 18 made out of 25. */
export interface DrillResult { category: string; made: number; attempts: number }

export interface TrainingSession {
  id: string;
  date: string;
  type: SessionType;
  /** 0 for a rest day */
  minutes: number;
  intensity?: number;
  fatigue?: number;
  drills: DrillResult[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface DrillCategory { id: string; name: string; nameKey: string; createdAt: number }

export type GoalKind = 'rating' | 'weekly-hours' | 'drill-rate' | 'streak' | 'tournament';
export interface Goal {
  id: string;
  kind: GoalKind;
  /** rating: DUPR value; weekly-hours: hours; drill-rate: percent; streak: days. Unused for tournament. */
  target: number;
  ratingKind?: RatingKind;
  drillCategory?: string;
  /** tournament goals: what you're aiming for, e.g. "Medal at Bengaluru Open" */
  text?: string;
  achieved?: boolean;
  createdAt: number;
}
