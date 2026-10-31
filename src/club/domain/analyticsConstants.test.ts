import { describe, expect, it } from 'vitest';
import * as personal from '../../domain/stats';
import { CLOSE_MARGIN, EVEN_GAP } from './analytics';

describe('club analytics constants', () => {
  it('match the personal app’s (copied so PaddleQ stays free of the on-phone database)', () => {
    expect(CLOSE_MARGIN).toBe(personal.CLOSE_MARGIN);
    expect(EVEN_GAP).toBe(personal.EVEN_GAP);
  });
});
