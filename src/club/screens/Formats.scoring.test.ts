import { describe, expect, it } from 'vitest';
import { defaultFormatDraft, divisionToDraft, draftToDivision, scoringOf, withScoring } from './Formats';
import { KNOCKOUT_STAGES, type Division } from '../types';

describe('creation-time scoring defaults', () => {
  it('starts as side-out, golden point, games to 11', () => {
    expect(scoringOf(defaultFormatDraft())).toEqual({ scoring: 'sideout', golden: true, pointsTo: 11 });
  });
  it('sets rally, win by 2 and games to 21 for pools and every knockout round', () => {
    const d = withScoring(defaultFormatDraft(), { scoring: 'rally', golden: false, pointsTo: 21 });
    expect(scoringOf(d)).toEqual({ scoring: 'rally', golden: false, pointsTo: 21 });
    expect(d.koGolden).toBe(false);
    for (const s of KNOCKOUT_STAGES) expect(d.stages[s].pointsTo).toBe(21);
  });
  it('leaves what was not changed alone (knockout golden stays off when only the games-to changes)', () => {
    const d = withScoring(defaultFormatDraft(), { pointsTo: 15 });
    expect(d.golden).toBe(true);
    expect(d.koGolden).toBe(false);
    expect(d.pool.pointsTo).toBe(15);
  });
  it('is what the draw step starts from: the saved division reads back the same choices', () => {
    const chosen = withScoring(defaultFormatDraft(), { scoring: 'rally', golden: false, pointsTo: 15 });
    // Players who register: creation forces round robin, the draw picks the shape later.
    const saved = draftToDivision({ ...chosen, shape: 'rr' });
    const back = divisionToDraft({ name: 'x', kind: 'doubles', ...saved } as unknown as Division);
    expect(scoringOf(back)).toEqual({ scoring: 'rally', golden: false, pointsTo: 15 });
    expect(saved.koFormat.pointsTo).toBe(15);
  });
});
