import Dexie, { type EntityTable } from 'dexie';
import { channel, databaseName } from '../config';
import type { Clip } from '../domain/clips';
import type { Tournament } from '../domain/tournaments';
import type { Conversation, UsageRow } from './coach';
import type { DrillCategory, Goal, Match, Player, RatingEntry, TrainingSession } from '../domain/types';

export class PickleqDB extends Dexie {
  matches!: EntityTable<Match, 'id'>;
  players!: EntityTable<Player, 'id'>;
  ratings!: EntityTable<RatingEntry, 'id'>;
  sessions!: EntityTable<TrainingSession, 'id'>;
  drillCategories!: EntityTable<DrillCategory, 'id'>;
  goals!: EntityTable<Goal, 'id'>;
  clips!: EntityTable<Clip, 'id'>;
  tournaments!: EntityTable<Tournament, 'id'>;
  conversations!: EntityTable<Conversation, 'id'>;
  usage!: EntityTable<UsageRow, 'id'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      matches: 'id, date, status, type, category, createdAt',
      players: 'id, &nameKey, lastUsedAt',
    });
    this.version(2).stores({
      ratings: 'id, kind, date',
    });
    this.version(3).stores({
      sessions: 'id, date, type',
      drillCategories: 'id, &nameKey',
      goals: 'id, kind',
    });
    this.version(4).stores({
      clips: 'id, shot, videoId, status',
    });
    this.version(5).stores({
      tournaments: 'id, startDate',
    });
    this.version(6).stores({
      conversations: 'id, updatedAt, task',
      usage: 'id, at',
    });
  }
}

export const db = new PickleqDB(databaseName(channel));

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
