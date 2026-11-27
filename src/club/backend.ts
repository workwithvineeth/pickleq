import type { ConsentPurpose } from './privacy';
import type { NewMatchRow, NewTournamentInput } from './plan';
import type { DrawPlan } from './registration';
import type { CourtVideo } from './liveView';
import type { LiveScoreStream } from './live/scoreStream';
import type { Approval, Club, ClubMatch, Testimonial, TestimonialStatus, ClubPlayer, ClubTournament, Division, DivisionKind, HostingStatus, DivisionRules, Entry, EntryMode, EntryPerson, Listing, ListingStatus, Member, Payment, Registration, RegistrationStatus, Role, ScorerLink, ScorerView, Share, SharedSummary, SummaryData } from './types';

/** A late-entry player: the entry form's details plus the new roster id they get. */
export type LatePerson = EntryPerson & { id: string };
export type LatePayment = 'paid' | 'venue' | 'unpaid';

export interface ClubUser { id: string; email: string }
export interface SupportSession { clubId: string; club: string; until: string }
export interface AuditRow { at: string; action: string; detail: string; clubId?: string; tournamentId?: string }
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
  /** Opened with the desk link and desk PIN (no account): desk view, scores, moves, walkovers, late entries only. */
  desk?: boolean;
}

/** The two PINs of a tournament and its desk link. Organisers and RallyQ admins only. */
export interface TournamentAccess { refereePin: string; deskPin: string; deskToken: string }
export type PublicCourtStream = CourtVideo & { court: number };
export type CourtStream = PublicCourtStream & { visible: boolean };
/** What the desk sign-in page shows before the PIN: names only. */
export interface DeskLabel { club: string; logoUrl?: string; tournament: string }

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
  /** `duprs`: each player's DUPR for the event's kind, in the same order as `names` (undefined = unrated). */
  entries: { id: string; divisionId: string; seed?: number; pool?: number; status?: 'withdrawn'; names: string[]; duprs?: (number | undefined)[] }[];
  matches: Pick<ClubMatch, 'id' | 'divisionId' | 'stage' | 'pool' | 'round' | 'bracketPos' | 'slot' | 'court' | 'entryA' | 'entryB' | 'games' | 'status' | 'winner'>[];
}

/** One match with what the scoring screen needs. */
export interface MatchBundle { club: Club; role: Role; match: ClubMatch; players: ClubPlayer[]; tournament?: ClubTournament; divisionName?: string }

export type PinSignIn = { mode: 'account'; email: string; pin: string };

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
  /** Signs in with an organiser's email + personal PIN. Club server only. */
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
  /** The tournament's referee PIN: every court's referee link uses it. It never opens the desk. Staff only. */
  eventPin(tournamentId: string): Promise<string | null>;
  /** Sets the referee PIN (random when none is given) for every court link of the tournament. Returns it.
   * 4 to 6 digits, not easy to guess, never the desk PIN. Organisers and RallyQ admins. */
  setEventPin(tournamentId: string, pin?: string): Promise<string>;
  /** Both PINs and the desk link. Organisers and RallyQ admins. */
  tournamentAccess(tournamentId: string): Promise<TournamentAccess>;
  /** Sets the desk PIN (random 6 digits when none is given): never the referee PIN. Returns it. */
  setDeskPin(tournamentId: string, pin?: string): Promise<string>;
  /** A new desk link; the old one stops working. Returns the new token. */
  newDeskLink(tournamentId: string): Promise<string>;
  /** Public: the club and tournament names for a desk link's sign-in page, or null for an unknown link. */
  deskLabel(token: string): Promise<DeskLabel | null>;
  /** The desk, with its link and desk PIN (no account): this one tournament, names and ratings only, never phone numbers. */
  deskOpen(token: string, pin: string): Promise<TournamentBundle>;
  deskSaveScore(token: string, pin: string, matchId: string, patch: ScorePatch): Promise<void>;
  deskPatchMatches(token: string, pin: string, changes: { id: string; patch: MatchPatch }[]): Promise<void>;
  deskAddLatePoolEntry(token: string, pin: string, entry: Entry, matches: NewMatchRow[]): Promise<void>;
  deskAddLateTeam(token: string, pin: string, people: LatePerson[], payment: LatePayment, entry: Entry, matches: NewMatchRow[]): Promise<void>;
  deskAddEntry(token: string, pin: string, entry: Entry): Promise<void>;
  deskUpdateEntry(token: string, pin: string, id: string, patch: EntryPatch): Promise<void>;
  deskAddMatches(token: string, pin: string, rows: NewMatchRow[]): Promise<void>;
  deskAddPlayer(token: string, pin: string, p: { name: string; dupr?: number }): Promise<ClubPlayer>;
  /** Starts a tournament that hasn't started (the desk can't finish or reopen one). */
  deskStart(token: string, pin: string): Promise<void>;
  /** Sets the club's logo (an image the app has already shrunk). Returns its address. Coaches and admins. */
  setClubLogo(clubId: string, image: Blob): Promise<string>;
  /** Public: the club name and logo for a tournament's public link. */
  publicClubLogo(slug: string): Promise<{ club: string; logoUrl?: string } | null>;
  /** Finishes signing in when the app is opened from the email's sign-in link. True if that just happened. */
  finishLinkSignIn?(): Promise<boolean>;
  signOut(): Promise<void>;
  myClubs(): Promise<MyClub[]>;
  createClub(name: string, city: string, myName: string): Promise<string>;
  /** Legacy method name: stores the owner's private contact details; no hosting approval is required after 0018. */
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
  /** Results-only projection. Platform admins may read other clubs; no additional write permission. */
  resultsBundle(id: string): Promise<TournamentBundle>;
  /** Platform-admin-only DUPR edits, restricted to participants of this tournament. */
  adminUpdateTournamentDupr(tournamentId: string, playerId: string, patch: { duprSingles?: number; duprDoubles?: number; duprId?: string }): Promise<void>;
  updateTournament(id: string, patch: Partial<Pick<ClubTournament, 'status' | 'isPublic'>>): Promise<void>;
  addMatches(rows: NewMatchRow[]): Promise<void>;
  matchBundle(matchId: string): Promise<MatchBundle>;
  correctMatch(match: ClubMatch, games: ClubMatch['games'], reason: string): Promise<void>;
  saveScore(matchId: string, patch: ScorePatch): Promise<void>;
  /** Organiser edits to matches (coaches and admins). */
  patchMatches(changes: { id: string; patch: MatchPatch }[]): Promise<void>;
  addLatePoolEntry(entry: Entry, matches: NewMatchRow[]): Promise<void>;
  /** A new team after the draw, with each player's details (checked like any entry) and the payment. */
  addLateTeam(people: LatePerson[], payment: LatePayment, entry: Entry, matches: NewMatchRow[]): Promise<void>;
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
  courtStreams(tournamentId: string): Promise<CourtStream[]>;
  setCourtStream(tournamentId: string, court: number, videoId: string): Promise<CourtStream>;
  setCourtStreamVisible(tournamentId: string, court: number, visible: boolean): Promise<CourtStream>;
  clearCourtStream(tournamentId: string, court: number): Promise<void>;
  publicCourtStreams(slug: string): Promise<PublicCourtStream[]>;
  publicTournament(slug: string): Promise<PublicTournament | null>;
  liveScores?(): LiveScoreStream;
  /** A short fingerprint that changes whenever the public tournament does, so live pages fetch it only when needed. */
  publicTournamentRev(slug: string): Promise<string | null>;
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
/** Module 4: what Results & DUPR shows next to each player for claim links. */
export type ClaimEmailStatus = 'queued' | 'sent' | 'failed' | 'test';
export interface ClaimStatus { emails: Record<string, string>; emailed: Record<string, { status: ClaimEmailStatus; sentTo: string; at: string }> }
export interface ClaimEmailOutcome { sent: number; failed: number; skipped: number; limited: boolean; test: boolean }

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

/** A listing waiting for (or recently given) a RallyQ admin's decision. */
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
  /** DPDP: store that the signed-in person agreed to the privacy notice (version in privacy.ts) for this purpose. */
  recordConsent(purpose: ConsentPurpose): Promise<void>;
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
  /** A round-robin-only event whose games are all played gets knockouts: the top `advance` from the table go through (2 = final, 4 = semi-finals). */
  addKnockoutStage(division: Division, advance: number): Promise<void>;
  /** RallyQ admins: join a club as a 4-hour, logged support admin (normal club permissions; never owner). Returns when it ends (null if already a member). */
  startSupport(clubId: string, reason: string): Promise<string | null>;
  endSupport(clubId: string): Promise<void>;
  supportSessions(): Promise<SupportSession[]>;
  /** Lifecycle: delete only before anyone enters (type the name); cancel keeps everything; archive hides finished or cancelled ones. */
  deleteTournament(id: string, confirmName: string): Promise<void>;
  cancelTournament(id: string, reason: string): Promise<void>;
  archiveTournament(id: string, archive: boolean): Promise<void>;
  platformAudit(): Promise<AuditRow[]>;
  isPlatformAdmin(): Promise<boolean>;
  listingQueue(): Promise<ListingReview[]>;
  reviewListing(id: string, approve: boolean, reason?: string): Promise<void>;
  addPlatformAdmin(email: string): Promise<void>;
  platformAdmins(): Promise<{ email: string; addedAt: string }[]>;
  /** The admin dashboard (RallyQ admins only). The robot's test club is left out of the counts. */
  adminOverview(): Promise<AdminOverview>;
  adminClubs(): Promise<AdminClub[]>;
  adminClub(id: string): Promise<AdminClubDetail>;
  setClubVerified(id: string, verified: boolean): Promise<void>;
  /** Approve a club to host tournaments, or reject its request with a reason the organiser sees. */
  setClubHosting(id: string, approve: boolean, reason?: string): Promise<void>;
  adminTournaments(): Promise<AdminTournament[]>;
  /** Reopens a finished tournament ('live') or marks it finished ('done'), for support. */
  adminSetTournamentStatus(id: string, status: 'live' | 'done'): Promise<void>;
  /** Removes a RallyQ admin; never the last one. */
  removePlatformAdmin(email: string): Promise<void>;

  // ---------- Admin command centre: delete, edit results, club roles (RallyQ admins only) ----------
  /** Deletes a club and everything in it for good. Type the club's name to confirm. Refused while one of its tournaments is live. One audit-log row. */
  adminDeleteClub(clubId: string, confirmName: string): Promise<void>;
  /** Deletes a tournament for good, even after people entered or scores were saved. Type its name to confirm. Refused while live. One audit-log row. */
  adminDeleteTournament(tournamentId: string, confirmName: string): Promise<void>;
  /** Fixes a finished match's score. Unlike an organiser's correction it also works after pools are complete; a knockout winner still can't change. */
  adminEditMatchResult(match: ClubMatch, games: ClubMatch['games'], reason: string): Promise<void>;
  /** The club's people with their ids (the plain club page doesn't carry them). */
  adminClubMembers(clubId: string): Promise<AdminMember[]>;
  adminSetMemberRole(clubId: string, userId: string, role: Role): Promise<void>;
  /** Adds someone by email: an existing account joins at once ('added'); otherwise the role waits for their sign-up ('invited'). */
  adminAddClubMember(clubId: string, email: string, role: Role): Promise<'added' | 'invited'>;
  /** Never the club's last owner. */
  adminRemoveClubMember(clubId: string, userId: string): Promise<void>;

  // ---------- Tournament approval ("create freely, go live with approval") ----------
  /** The club's organisers send the tournament to RallyQ. A trusted club's is approved straight away. Returns the new status. */
  submitTournament(id: string, expectedPlayers?: number): Promise<Approval>;
  /** RallyQ admins: tournaments waiting (and decided in the last 30 days). */
  approvalQueue(): Promise<ApprovalRequest[]>;
  /** Approve, or reject with a reason the club sees. Never a tournament of a club you organise. */
  decideTournament(id: string, approve: boolean, reason?: string): Promise<void>;
  /** The trusted switch (RallyQ admins only). */
  setClubTrusted(id: string, trusted: boolean): Promise<void>;

  // ---------- Testimonials ----------
  /** The club's own testimonials (owner and admins), newest first. */
  clubTestimonials(clubId: string): Promise<Testimonial[]>;
  submitTestimonial(input: NewTestimonial): Promise<void>;
  /** The club takes it back: the words and photo are removed. */
  withdrawTestimonial(id: string): Promise<void>;
  /** RallyQ admins: every club's (not withdrawn). */
  adminTestimonials(): Promise<Testimonial[]>;
  setTestimonial(id: string, status: Exclude<TestimonialStatus, 'pending' | 'withdrawn'>, featured: boolean): Promise<void>;

}

export interface NewTestimonial { clubId: string; rating: number; quote: string; personName: string; personRole: string; consent: boolean; photo?: Blob }

/** A tournament waiting for (or recently given) RallyQ's approval. */
export interface ApprovalRequest {
  id: string; name: string; startDate: string; startTime: string; city?: string; venue?: string; club: string; clubId: string; trusted: boolean;
  upiId?: string; entryMode: EntryMode; listing: Listing; approval: Approval; reason?: string; expected?: number; requestedAt?: string; decidedAt?: string;
  courts: number; entries: number; mine: boolean;
  divisions: { name: string; kind: DivisionKind; fee?: number; cap?: number }[];
}

export interface AdminOverview {
  clubs: number; verifiedClubs: number; upcoming: number; live: number; finished: number; toReview: number;
  entriesWeek: number; matchesWeek: number; accounts: number; accountsWeek: number;
  /** Matches scored in each of the last 8 weeks (weeks start Monday), oldest first. */
  weeks: { week: string; matches: number }[];
}
export interface AdminClub { id: string; name: string; city?: string; logoUrl?: string; verified: boolean; isTest: boolean; trusted: boolean; hosting: HostingStatus; hostingPhone?: string; hostingNote?: string; hostingReason?: string; hostingRequestedAt?: string; owners: string[]; members: number; tournaments: number; lastEvent?: string }
export interface AdminClubDetail {
  id: string; name: string; city?: string; logoUrl?: string; verified: boolean; isTest: boolean; hosting: HostingStatus; hostingPhone?: string; hostingNote?: string; hostingReason?: string;  hostingRequestedAt?: string;
  people: { name: string; email?: string; role: Role; helper: boolean }[];
  tournaments: { id: string; name: string; startDate: string; status: ClubTournament['status'] }[];
}
export interface AdminMember { userId: string; email?: string; name?: string; role: Role; helper: boolean }
export interface AdminTournament {
  id: string; name: string; club: string; clubId: string; isTest: boolean; startDate: string; startTime: string; status: ClubTournament['status'];
  listing: Listing; listingStatus: ListingStatus; slug: string; results: boolean; registrations: number; matches: number; matchesDone: number;
  eventPin?: string; deskPin?: string; deskToken?: string; deskUsedAt?: string;
}

export class ClubError extends Error {}
