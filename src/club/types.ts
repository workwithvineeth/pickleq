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
  /** Its first events-board listing was approved, so later ones go straight on. */
  verified?: boolean;
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
  /** Module 2: where it is, how players enter, and whether it's on the PICKLEQ events board. */
  city?: string;
  venue?: string;
  about?: string;
  /** Phone or WhatsApp number players contact (listed-only events). */
  contact?: string;
  /** Organiser's own sign-up page (listed-only events). */
  link?: string;
  entryMode?: EntryMode;
  registrationOpen?: boolean;
  /** Last day to enter, YYYY-MM-DD (India time). */
  entriesClose?: string;
  /** The organiser's UPI ID, for players paying entry fees straight to them. */
  upiId?: string;
  listing?: Listing;
  listingStatus?: ListingStatus;
  rejectReason?: string;
  reviewedAt?: string;
  drawnAt?: string;
}

/** roster: the organiser picks players (Module 1). registration: players sign up, then the organiser draws. */
export type EntryMode = 'roster' | 'registration';
/** none: not on the board. listed: on the board only, players contact the organiser. run: run on PICKLEQ. */
export type Listing = 'none' | 'listed' | 'run';
export type ListingStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type DivisionGender = 'open' | 'men' | 'women' | 'mixed';
export const GENDER_LABEL: Record<DivisionGender, string> = { open: 'Open', men: 'Men', women: 'Women', mixed: 'Mixed' };

/** Who may enter an event, and how many. */
export interface DivisionRules {
  /** DUPR cap: every player's rating must be this or under. */
  maxDupr?: number;
  gender?: DivisionGender;
  /** Age group, e.g. 35 for 35+. Everyone must be 18 or over in any case. */
  minAge?: number;
  /** Most entries accepted; more go on the waitlist. */
  cap?: number;
  /** Entry fee in rupees, per entry (team for doubles). */
  fee?: number;
}

export type PlayerGender = 'm' | 'f' | 'x';
/** One person on an entry form. Phone is needed for online entries; offline entries may leave it empty. */
export interface EntryPerson { name: string; phone: string; duprId?: string; dupr?: number; gender: PlayerGender | ''; age?: number }

export type RegistrationStatus = 'pending' | 'accepted' | 'waitlist' | 'rejected' | 'withdrawn';
export type Payment = 'unpaid' | 'venue' | 'claimed' | 'paid';
export const REG_STATUS_LABEL: Record<RegistrationStatus, string> = { pending: 'Waiting for the organiser', accepted: 'Accepted', waitlist: 'On the waitlist', rejected: 'Not accepted', withdrawn: 'Withdrawn' };
export const PAYMENT_LABEL: Record<Payment, string> = { unpaid: 'Not paid', venue: 'Paying at the venue', claimed: 'Paid by UPI (to confirm)', paid: 'Paid' };

export interface Registration {
  id: string;
  tournamentId: string;
  divisionId: string;
  clubId: string;
  userId?: string;
  source: 'online' | 'offline';
  players: EntryPerson[];
  status: RegistrationStatus;
  payment: Payment;
  paymentRef?: string;
  note?: string;
  entryId?: string;
  createdAt: string;
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
  rules?: DivisionRules;
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
