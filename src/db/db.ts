import Dexie, { type EntityTable } from 'dexie';
import { channel, databaseName } from '../config';
import type { DrillCategory, Goal, Match, Player, RatingEntry, TrainingSession } from '../domain/types';

export class PickleqDB extends Dexie {
  matches!: EntityTable<Match, 'id'>;
  players!: EntityTable<Player, 'id'>;
  ratings!: EntityTable<RatingEntry, 'id'>;
  sessions!: EntityTable<TrainingSession, 'id'>;
  drillCategories!: EntityTable<DrillCategory, 'id'>;
  goals!: EntityTable<Goal, 'id'>;

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
  }
}

export const db = new PickleqDB(databaseName(channel));

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
