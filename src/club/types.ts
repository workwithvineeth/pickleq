import type { Format, Momentum } from '../domain/types';

export type Role = 'owner' | 'admin' | 'coach' | 'player';
export const STAFF_ROLES: Role[] = ['owner', 'admin', 'coach'];
export const isStaff = (r: Role | null | undefined) => !!r && STAFF_ROLES.includes(r);
export const isAdmin = (r: Role | null | undefined) => r === 'owner' || r === 'admin';
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', coach: 'Coach', player: 'Player' };

/** How big a lead counts for "came back" / "lost a lead", by game length. Clubs can change these. */
export interface Thresholds { lead11: number; lead15: number; lead21: number }
export const DEFAULT_THRESHOLDS: Thresholds = { lead11: 4, lead15: 5, lead21: 7 };

export interface ClubSettings { thresholds?: Thresholds }

export interface Club {
  id: string;
  name: string;
  city?: string;
  inviteCode: string;
  settings: ClubSettings;
}

export interface Member { userId: string; role: Role; name: string }

/** What a player chose to share from their personal PICKLEQ. Nothing is shared unless switched on. */
export interface Share { record?: boolean; tags?: boolean; training?: boolean }

export interface ClubPlayer {
  id: string;
  clubId: string;
  name: string;
  duprSingles?: number;
  duprDoubles?: number;
  /** The player's DUPR ID, needed to send results to DUPR. */
  duprId?: string;
  userId?: string;
  claimCode?: string;
  share: Share;
  sample?: boolean;
}

export type TournamentStatus = 'draft' | 'live' | 'done';
export interface ClubTournament {
  id: string;
  clubId: string;
  name: string;
  startDate: string;
  /** HH:MM */
  startTime: string;
  courts: number;
  slotMinutes: number;
  status: TournamentStatus;
  isPublic: boolean;
  publicSlug: string;
}

export type DivisionKind = 'singles' | 'doubles';
export interface Division {
  id: string;
  tournamentId: string;
  clubId: string;
  name: string;
  kind: DivisionKind;
  /** Pool games */
  format: Format;
  /** Knockout games (stored inside format JSON on the server) */
  koFormat: Format;
  pools: number;
  advance: number;
  sort: number;
}

export interface Entry {
  id: string;
  divisionId: string;
  clubId: string;
  playerIds: string[];
  seed?: number;
  pool?: number;
  /** Withdrawn entries keep their played results; their unplayed matches become void. */
  status?: 'active' | 'withdrawn';
}

/** A link that lets someone score without an account. Only coaches and admins see these. */
export interface ScorerLink {
  id: string;
  tournamentId: string;
  clubId: string;
  /** Empty = any court. */
  court?: number;
  token: string;
  pin: string;
  label?: string;
  revoked: boolean;
  lastUsedAt?: string;
}

/** What a scorer link opens: the event and the matches it may score. Names and scores only. */
export interface ScorerView {
  court?: number;
  label?: string;
  club: string;
  tournament: { name: string; startDate: string; startTime: string; slotMinutes: number; courts: number; status: TournamentStatus };
  matches: { id: string; stage: Stage; pool?: number; round?: number; slot?: number; court?: number; division?: string; format: Format; games: ClubGame[]; status: ClubMatchStatus; winner?: 'A' | 'B'; playedOn?: string; namesA: string[]; namesB: string[] }[];
}

export type Stage = 'pool' | 'qf' | 'sf' | 'final' | 'friendly';
export const STAGE_LABEL: Record<Stage, string> = { pool: 'Pool', qf: 'Quarter-final', sf: 'Semi-final', final: 'Final', friendly: 'Club match' };

/** One game. points is the order points were won: "A" for side A, "B" for side B. Empty if only the final score was entered. */
export interface ClubGame { points: string; a: number; b: number }

/** void: cancelled by the organiser (e.g. a team withdrew); not played and not counted. */
export type ClubMatchStatus = 'scheduled' | 'live' | 'done' | 'void';
export interface ClubMatch {
  id: string;
  clubId: string;
  tournamentId?: string;
  divisionId?: string;
  stage: Stage;
  pool?: number;
  round?: number;
  /** Position within a knockout round, from 0 at the top of the bracket. */
  bracketPos?: number;
  slot?: number;
  court?: number;
  entryA?: string;
  entryB?: string;
  sideA: string[];
  sideB: string[];
  format: Format;
  games: ClubGame[];
  status: ClubMatchStatus;
  winner?: 'A' | 'B';
  playedOn?: string;
  updatedAt: string;
}

/** Numbers a player shares from their personal app. Never raw matches or notes. */
export interface SummaryData {
  generatedAt: string;
  record?: { matches: number; wins: number; singles: [number, number]; doubles: [number, number]; closeWins: number; closeLosses: number };
  tags?: { tag: string; inLosses: number; losses: number; inWins: number; wins: number }[];
  training?: { hours30d: number; sessions30d: number; drills: { category: string; made: number; attempts: number }[] };
}
export interface SharedSummary { playerId: string; data: SummaryData; updatedAt: string }

export interface GameAnalysis {
  a: number;
  b: number;
  /** Momentum from side A's point of view. */
  momentumA: Momentum;
  momentumB: Momentum;
  /** Score (A–B) the comeback started from or the lead was lost from. */
  fromA?: number;
  fromB?: number;
  /** Whether each side ever stood one point from winning the game. */
  gamePointA: boolean;
  gamePointB: boolean;
  complete: boolean;
}
