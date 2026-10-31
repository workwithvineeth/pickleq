import type { NewMatchRow, NewTournamentInput } from './plan';
import type { DrawPlan } from './registration';
import type { Club, ClubMatch, ClubPlayer, ClubTournament, Division, DivisionKind, HostingStatus, DivisionRules, Entry, EntryMode, EntryPerson, Listing, ListingStatus, Member, Payment, Registration, RegistrationStatus, Role, ScorerLink, ScorerView, Share, SharedSummary, SummaryData } from './types';

export interface ClubUser { id: string; email: string }
export interface MyClub { club: Club; role: Role; myPlayerId?: string }

export interface ClubBundle {
  club: Club;
  role: Role;
  myPlayerId?: string;
  members: Member[];
  players: ClubPlayer[];
  tournaments: ClubTournament[];
  matches: ClubMatch[];
  /** Only filled for coaches and admins (and your own). */
  summaries: SharedSummary[];
}

export interface TournamentBundle {
  club: Club;
  role: Role;
  tournament: ClubTournament;
  divisions: Division[];
  entries: Entry[];
  matches: ClubMatch[];
  players: ClubPlayer[];
}

/** Everything about one of your clubs needed to add its matches to your personal history. */
export interface MyClubMatches { club: Club; playerId: string; players: ClubPlayer[]; tournaments: ClubTournament[]; matches: ClubMatch[] }

export interface PublicTournament {
  name: string;
  startDate: string;
  startTime: string;
  slotMinutes: number;
  status: ClubTournament['status'];
  club: string;
  divisions: Pick<Division, 'id' | 'name' | 'kind' | 'pools' | 'advance' | 'format' | 'koFormat' | 'shape' | 'extra' | 'stageFormats'>[];
  entries: { id: string; divisionId: string; seed?: number; pool?: number; names: string[] }[];
  matches: Pick<ClubMatch, 'id' | 'divisionId' | 'stage' | 'pool' | 'round' | 'bracketPos' | 'slot' | 'court' | 'entryA' | 'entryB' | 'games' | 'status' | 'winner'>[];
}

/** One match with what the scoring screen needs. */
export interface MatchBundle { club: Club; role: Role; match: ClubMatch; players: ClubPlayer[]; tournament?: ClubTournament; divisionName?: string }

export type PinSignIn = { mode: 'account'; email: string; pin: string } | { mode: 'helper'; slug: string; name: string; pin: string };

export interface ScorePatch { games: ClubMatch['games']; status: ClubMatch['status']; winner?: 'A' | 'B'; playedOn?: string }

/** Organiser changes to a match: cancel it, give a walkover, move it to another court or time, or change players. */
export interface MatchPatch { status?: ClubMatch['status']; winner?: 'A' | 'B' | null; games?: ClubMatch['games']; court?: number; slot?: number; sideA?: string[]; sideB?: string[] }
export interface EntryPatch { playerIds?: string[]; status?: Entry['status']; pool?: number }

/** Where club data lives: the real club server, or a demo kept on this phone. Screens only talk to this. */
export interface ClubBackend extends EventsBackend {
  readonly kind: 'demo' | 'server';
  currentUser(): Promise<ClubUser | null>;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  /** Signs in with a PIN: an organiser's email + personal PIN, or a helper link's slug + the event PIN + a name.
   * Helpers come back with the tournament they help with. Club server only. */
  pinSignIn?(a: PinSignIn): Promise<{ tournamentId?: string }>;
  /** Accounts with a password (organisers and admins). New accounts confirm their email with a 6-digit code;
   * "forgot password" also works by code. Club server only. */
  passwordSignIn?(email: string, password: string): Promise<void>;
  /** Creates an account. Returns true when a code was emailed (the usual case), false when it signed straight in. */
  signUp?(email: string, password: string): Promise<boolean>;
  confirmEmail?(email: string, code: string): Promise<void>;
  resendConfirm?(email: string): Promise<void>;
  sendPasswordReset?(email: string): Promise<void>;
  resetPassword?(email: string, code: string, password: string): Promise<void>;
  setMyPassword?(password: string): Promise<void>;
  /** Whether the signed-in person has set a personal sign-in PIN, and setting it. Club server only. */
  hasMyPin?(): Promise<boolean>;
  setMyPin?(pin: string): Promise<void>;
  /** The tournament's event PIN: every court's scorer link uses it, and desk helpers sign in with it. Staff only. */
  eventPin(tournamentId: string): Promise<string | null>;
  /** A new event PIN (random when none is given) for every link of the tournament. Returns it. */
  setEventPin(tournamentId: string, pin?: string): Promise<string>;
  /** Sets the club's logo (an image the app has already shrunk). Returns its address. Coaches and admins. */
  setClubLogo(clubId: string, image: Blob): Promise<string>;
  /** Public: the club name and logo for a tournament's public link. */
  publicClubLogo(slug: string): Promise<{ club: string; logoUrl?: string } | null>;
  /** Finishes signing in when the app is opened from the email's sign-in link. True if that just happened. */
  finishLinkSignIn?(): Promise<boolean>;
  signOut(): Promise<void>;
  myClubs(): Promise<MyClub[]>;
  createClub(name: string, city: string, myName: string): Promise<string>;
  /** The club's owner or admin asks PaddleQ to let the club host tournaments (again, after a rejection). */
  requestHosting(clubId: string, phone: string, note: string): Promise<void>;
  joinClub(code: string, claim: string | null, myName: string): Promise<string>;
  clubBundle(clubId: string): Promise<ClubBundle>;
  addPlayer(clubId: string, p: { name: string; duprSingles?: number; duprDoubles?: number }): Promise<ClubPlayer>;
  updatePlayer(id: string, patch: { name?: string; duprSingles?: number | null; duprDoubles?: number | null; duprId?: string | null }): Promise<void>;
  setRole(clubId: string, userId: string, role: Role): Promise<void>;
  removeMember(clubId: string, userId: string): Promise<void>;
  leaveClub(clubId: string): Promise<void>;
  createTournament(input: NewTournamentInput): Promise<string>;
  tournamentBundle(id: string): Promise<TournamentBundle>;
  updateTournament(id: string, patch: Partial<Pick<ClubTournament, 'status' | 'isPublic'>>): Promise<void>;
  addMatches(rows: NewMatchRow[]): Promise<void>;
  matchBundle(matchId: string): Promise<MatchBundle>;
  saveScore(matchId: string, patch: ScorePatch): Promise<void>;
  /** Organiser edits to matches (coaches and admins). */
  patchMatches(changes: { id: string; patch: MatchPatch }[]): Promise<void>;
  addEntry(entry: Entry): Promise<void>;
  updateEntry(id: string, patch: EntryPatch): Promise<void>;
  /** Scorer links for an event (coaches and admins only). */
  scorerLinks(tournamentId: string): Promise<ScorerLink[]>;
  createScorerLinks(tournamentId: string, clubId: string, courts: (number | null)[]): Promise<ScorerLink[]>;
  updateScorerLink(id: string, patch: { revoked?: boolean; pin?: string }): Promise<void>;
  /** Used by someone with a scorer link and PIN, no account needed. */
  scorerOpen(token: string, pin: string): Promise<ScorerView>;
  scorerSave(token: string, pin: string, matchId: string, patch: ScorePatch): Promise<void>;
  setMySharing(playerId: string, share: Share): Promise<void>;
  shareMySummary(playerId: string, data: SummaryData): Promise<void>;
  publicTournament(slug: string): Promise<PublicTournament | null>;
  myClubMatches(): Promise<MyClubMatches[]>;
}

/** A tournament as anyone sees it on the events board or its own page (no login). Never players' details. */
export interface PublicEvent {
  slug: string;
  name: string;
  startDate: string;
  startTime: string;
  city?: string;
  venue?: string;
  club: string;
  listing: Listing;
  status: ClubTournament['status'];
  entryMode: EntryMode;
  registrationOpen: boolean;
  entriesClose?: string;
  /** The results link is on. */
  results: boolean;
  drawn: boolean;
  contact?: string;
  link?: string;
  about?: string;
  upiId?: string;
  posterUrl?: string;
  divisions: { id: string; name: string; kind: DivisionKind; rules: DivisionRules; taken: number }[];
}

/** One of your own entries, with its tournament. */
export interface MyEntry {
  id: string;
  status: RegistrationStatus;
  payment: Payment;
  paymentRef?: string;
  note?: string;
  players: EntryPerson[];
  division: string;
  kind: DivisionKind;
  fee?: number;
  slug: string;
  tournament: string;
  startDate: string;
  startTime: string;
  city?: string;
  venue?: string;
  club: string;
  upiId?: string;
  drawn: boolean;
  results: boolean;
}

/** A listing waiting for (or recently given) a PaddleQ admin's decision. */
export interface ListingReview {
  id: string;
  name: string;
  startDate: string;
  startTime: string;
  city?: string;
  venue?: string;
  about?: string;
  contact?: string;
  link?: string;
  listing: Listing;
  listingStatus: ListingStatus;
  rejectReason?: string;
  reviewedAt?: string;
  slug: string;
  club: string;
  verified: boolean;
  postedBy?: string;
  posterUrl?: string;
  divisions: { name: string; kind: DivisionKind; rules: DivisionRules }[];
}

export type TournamentDetails = Partial<Pick<ClubTournament, 'name' | 'startDate' | 'startTime' | 'city' | 'venue' | 'about' | 'contact' | 'link' | 'registrationOpen' | 'entriesClose' | 'upiId'>>;
export interface RegistrationPatch { status?: RegistrationStatus; payment?: Payment; note?: string | null; players?: EntryPerson[]; divisionId?: string }
export interface ImportEntryRow { divisionId: string; players: EntryPerson[]; status: 'accepted' | 'pending'; payment: 'unpaid' | 'venue' | 'paid' }
export interface ImportResult { added: number; waitlisted: number; skipped: number; problems: { row: number; error: string }[] }
export interface OfflineEntry { tournamentId: string; divisionId: string; clubId: string; players: EntryPerson[]; status: RegistrationStatus; payment: Payment }

/** Module 2: the events board, registration, the entries inbox and listing approval. */
export interface EventsBackend {
  updateTournamentDetails(id: string, patch: TournamentDetails): Promise<void>;
  /** Puts a tournament on the events board (or takes it off). Returns the listing's status: approved straight away for a verified club. */
  submitListing(id: string, listing: Listing): Promise<ListingStatus>;
  publicEvents(includeTest?: boolean): Promise<PublicEvent[]>;
  publicEvent(slug: string): Promise<PublicEvent | null>;
  /** Board tournaments finished in the last 30 days, newest first. */
  recentResults(includeTest?: boolean): Promise<PublicEvent[]>;
  /** Sets the tournament's poster (an image the app has already shrunk). Returns its address. Coaches and admins. */
  setPoster(t: ClubTournament, image: Blob): Promise<string>;
  registerEntry(divisionId: string, players: EntryPerson[], payment: 'unpaid' | 'venue' | 'claimed', paymentRef?: string): Promise<{ id: string; status: RegistrationStatus }>;
  myEntries(): Promise<MyEntry[]>;
  withdrawMyEntry(id: string): Promise<void>;
  /** Every entry for a tournament (coaches and admins). */
  registrations(tournamentId: string): Promise<Registration[]>;
  updateRegistration(id: string, patch: RegistrationPatch): Promise<void>;
  addOfflineEntry(e: OfflineEntry): Promise<void>;
  /**
   * Adds entries imported from a sheet. Anyone already entered in that event (same phone, else name) is skipped, so
   * importing the same sheet again adds only new rows. Full events put new entries on the waitlist.
   */
  importEntries(tournamentId: string, rows: ImportEntryRow[]): Promise<ImportResult>;
  /** The server's eligibility check, for an entry the organiser is adding or changing. Null if it's fine. */
  checkEntry(divisionId: string, players: EntryPerson[], exceptId?: string): Promise<string | null>;
  /** Makes the draw: roster players, entries, matches; links each registration to its entry and closes entries. */
  applyDraw(tournamentId: string, plan: DrawPlan): Promise<void>;
  isPlatformAdmin(): Promise<boolean>;
  listingQueue(): Promise<ListingReview[]>;
  reviewListing(id: string, approve: boolean, reason?: string): Promise<void>;
  addPlatformAdmin(email: string): Promise<void>;
  platformAdmins(): Promise<{ email: string; addedAt: string }[]>;
  /** The admin dashboard (PaddleQ admins only). The robot's test club is left out of the counts. */
  adminOverview(): Promise<AdminOverview>;
  adminClubs(): Promise<AdminClub[]>;
  adminClub(id: string): Promise<AdminClubDetail>;
  setClubVerified(id: string, verified: boolean): Promise<void>;
  /** Approve a club to host tournaments, or reject its request with a reason the organiser sees. */
  setClubHosting(id: string, approve: boolean, reason?: string): Promise<void>;
  adminTournaments(): Promise<AdminTournament[]>;
  /** Reopens a finished tournament ('live') or marks it finished ('done'), for support. */
  adminSetTournamentStatus(id: string, status: 'live' | 'done'): Promise<void>;
  /** Removes a PaddleQ admin; never the last one. */
  removePlatformAdmin(email: string): Promise<void>;
}

export interface AdminOverview {
  clubs: number; verifiedClubs: number; upcoming: number; live: number; finished: number; toReview: number;
  entriesWeek: number; matchesWeek: number; accounts: number; accountsWeek: number;
  /** Matches scored in each of the last 8 weeks (weeks start Monday), oldest first. */
  weeks: { week: string; matches: number }[];
}
export interface AdminClub { id: string; name: string; city?: string; logoUrl?: string; verified: boolean; isTest: boolean; hosting: HostingStatus; hostingPhone?: string; hostingNote?: string; hostingReason?: string; hostingRequestedAt?: string; owners: string[]; members: number; tournaments: number; lastEvent?: string }
export interface AdminClubDetail {
  id: string; name: string; city?: string; logoUrl?: string; verified: boolean; isTest: boolean; hosting: HostingStatus; hostingPhone?: string; hostingNote?: string; hostingReason?: string;  hostingRequestedAt?: string;
  people: { name: string; email?: string; role: Role; helper: boolean }[];
  tournaments: { id: string; name: string; startDate: string; status: ClubTournament['status'] }[];
}
export interface AdminTournament {
  id: string; name: string; club: string; clubId: string; isTest: boolean; startDate: string; startTime: string; status: ClubTournament['status'];
  listing: Listing; listingStatus: ListingStatus; slug: string; results: boolean; registrations: number; matches: number; matchesDone: number;
  eventPin?: string; helpers: { name: string; addedAt: string }[];
}

export class ClubError extends Error {}
