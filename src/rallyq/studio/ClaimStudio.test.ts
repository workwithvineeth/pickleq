import { describe, expect, it } from 'vitest';
import { claimCard } from './ClaimStudio';
import type { FoundPlayer } from '../../club/playerStudio';

const found = (over: Partial<FoundPlayer> = {}): FoundPlayer => ({ playerId: 'p1', name: 'Asha Sample', club: 'Sample Club', matches: 3, wins: 2, tournaments: [], ...over } as FoundPlayer);

describe('Claim my Studio card', () => {
  it('offers a claim button for each player found by your email', () => {
    const c = claimCard([found(), found({ playerId: 'p2', name: 'Asha S', matches: 1 })], 'asha@example.com', 0)!;
    expect(c.title).toBe('We found matches that may be yours');
    expect(c.found.map((f) => f.label)).toEqual(['Asha Sample · Sample Club · 3 matches', 'Asha S · Sample Club · 1 match']);
  });

  it('explains how to claim when nothing is found yet', () => {
    const c = claimCard([], 'asha@example.com', 0)!;
    expect(c.title).toBe('Claim my Studio');
    expect(c.found).toEqual([]);
    expect(c.lines.join(' ')).toContain('asha@example.com');
    expect(c.lines.join(' ')).toContain('claim link');
  });

  it('stays out of the way once you have claimed and nothing new is found', () => {
    expect(claimCard([], 'asha@example.com', 1)).toBeNull();
  });
});
