import type { TagMark } from '../domain/types';

export interface StudioLogInput {
  kind: 'practice' | 'casual';
  played_on: string;
  opponents: string;
  partner: string;
  location: string;
  score_for: number;
  score_against: number;
  reflection: string;
  tags: Record<string, TagMark>;
}

export interface StudioLog extends StudioLogInput {
  id: string;
}
