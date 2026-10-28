import type { NewMatchRow, NewTournamentInput } from './plan';
import type { Club, ClubMatch, ClubPlayer, ClubTournament, Division, Entry, Member, Role, Share, SharedSummary, SummaryData } from './types';

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
  divisions: Pick<Division, 'id' | 'name' | 'kind' | 'pools' | 'advance' | 'format' | 'koFormat'>[];
  entries: { id: string; divisionId: string; seed?: number; pool?: number; names: string[] }[];
  matches: Pick<ClubMatch, 'id' | 'divisionId' | 'stage' | 'pool' | 'round' | 'bracketPos' | 'slot' | 'court' | 'entryA' | 'entryB' | 'games' | 'status' | 'winner'>[];
}

/** One match with what the scoring screen needs. */
export interface MatchBundle { club: Club; role: Role; match: ClubMatch; players: ClubPlayer[]; tournament?: ClubTournament; divisionName?: string }

export interface ScorePatch { games: ClubMatch['games']; status: ClubMatch['status']; winner?: 'A' | 'B'; playedOn?: string }

/** Where club data lives: the real club server, or a demo kept on this phone. Screens only talk to this. */
export interface ClubBackend {
  readonly kind: 'demo' | 'server';
  currentUser(): Promise<ClubUser | null>;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
  myClubs(): Promise<MyClub[]>;
  createClub(name: string, city: string, myName: string): Promise<string>;
  joinClub(code: string, claim: string | null, myName: string): Promise<string>;
  clubBundle(clubId: string): Promise<ClubBundle>;
  addPlayer(clubId: string, p: { name: string; duprSingles?: number; duprDoubles?: number }): Promise<ClubPlayer>;
  updatePlayer(id: string, patch: { name?: string; duprSingles?: number | null; duprDoubles?: number | null }): Promise<void>;
  setRole(clubId: string, userId: string, role: Role): Promise<void>;
  removeMember(clubId: string, userId: string): Promise<void>;
  leaveClub(clubId: string): Promise<void>;
  createTournament(input: NewTournamentInput): Promise<string>;
  tournamentBundle(id: string): Promise<TournamentBundle>;
  updateTournament(id: string, patch: Partial<Pick<ClubTournament, 'status' | 'isPublic'>>): Promise<void>;
  addMatches(rows: NewMatchRow[]): Promise<void>;
  matchBundle(matchId: string): Promise<MatchBundle>;
  saveScore(matchId: string, patch: ScorePatch): Promise<void>;
  setMySharing(playerId: string, share: Share): Promise<void>;
  shareMySummary(playerId: string, data: SummaryData): Promise<void>;
  publicTournament(slug: string): Promise<PublicTournament | null>;
  myClubMatches(): Promise<MyClubMatches[]>;
}

export class ClubError extends Error {}
