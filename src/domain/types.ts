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
