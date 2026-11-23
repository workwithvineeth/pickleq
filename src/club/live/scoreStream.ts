import type { PublicTournament } from '../backend';

type Match = PublicTournament['matches'][number];
type Game = Match['games'][number];

export interface LiveScoreMessage {
  id: string;
  court?: number;
  slot?: number;
  status: Match['status'];
  winner?: 'A' | 'B';
  entryA?: string;
  entryB?: string;
  games: Match['games'];
  at: number;
}

export type StreamStatus = 'connecting' | 'live' | 'down';

export interface LiveScoreStream {
  subscribe(slug: string, onMessage: (m: LiveScoreMessage) => void, onStatus: (s: StreamStatus) => void): () => void;
}

export const LIVE_SCORE_POLL_MS = 60_000;
/** Let a healthy stream's minute poll finish before calling a quiet board stale. */
export const LIVE_SCORE_STALE_MS = LIVE_SCORE_POLL_MS + 15_000;

const side = (value: unknown) => value === 'A' || value === 'B' ? value : undefined;
const mode = (value: unknown) => value === 'sideout' || value === 'rally' ? value : undefined;

export function publicRallyKeys(g: Record<string, unknown>): Pick<Game, 'rallies' | 'mode' | 'serve'> {
  const scoring = mode(g.mode), serve = side(g.serve);
  return { ...(typeof g.rallies === 'string' && g.rallies ? { rallies: g.rallies } : {}), ...(scoring ? { mode: scoring } : {}), ...(serve ? { serve } : {}) };
}

export function publicScoreGame(g: Record<string, unknown>): Game {
  return { points: '', a: Number(g.a), b: Number(g.b), ...publicRallyKeys(g) };
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const game = (g: unknown): g is Record<string, unknown> => record(g) && integer(g.a) && integer(g.b) && g.a >= 0 && g.b >= 0
  && (g.rallies == null || (typeof g.rallies === 'string' && /^[AB]{0,600}$/.test(g.rallies)))
  && (g.serve == null || !!side(g.serve)) && (g.mode == null || !!mode(g.mode));

/** Normalise the public SQL payload, including nulls for removed assignments. */
export function readLiveScoreMessage(value: unknown): LiveScoreMessage | null {
  if (!record(value)) return null;
  const { id: matchId, court, slot, status, winner, entryA, entryB, games, at } = value;
  if (!id(matchId) || (status !== 'scheduled' && status !== 'live' && status !== 'done' && status !== 'void')
    || (court != null && !integer(court)) || (slot != null && !integer(slot)) || (winner != null && !side(winner))
    || (entryA != null && !id(entryA)) || (entryB != null && !id(entryB))
    || typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || !Array.isArray(games) || !games.every(game)) return null;
  return { id: matchId, court: court ?? undefined, slot: slot ?? undefined, status, winner: side(winner),
    entryA: entryA ?? undefined, entryB: entryB ?? undefined, games: games.map(publicScoreGame), at };
}

export function applyLiveMessage(data: PublicTournament, m: LiveScoreMessage): PublicTournament {
  const i = data.matches.findIndex(match => match.id === m.id);
  if (i === -1) return data;
  const matches = data.matches.slice();
  matches[i] = { ...matches[i], court: m.court, slot: m.slot, status: m.status, winner: m.winner,
    entryA: m.entryA, entryB: m.entryB, games: m.games.map(g => publicScoreGame({ ...g })) };
  return { ...data, matches };
}
