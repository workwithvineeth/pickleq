import { describe, expect, it } from 'vitest';
import { builtInClips, CLIP_SHOTS, checkRange, clipLength, clipShotForInsight, fmtTime, parseLinkStart, parseTime, parseYouTubeId, shotFromSlug, shotSlug, sortClips, type Clip } from './clips';

describe('YouTube links', () => {
  it('reads the video id from every common link shape', () => {
    for (const l of ['https://www.youtube.com/watch?v=SXW0PK8VgJg', 'youtube.com/watch?v=SXW0PK8VgJg&t=40s', 'https://youtu.be/SXW0PK8VgJg?si=abc',
      'https://m.youtube.com/watch?v=SXW0PK8VgJg', 'https://www.youtube.com/shorts/SXW0PK8VgJg', 'https://www.youtube-nocookie.com/embed/SXW0PK8VgJg', 'SXW0PK8VgJg']) {
      expect(parseYouTubeId(l)).toBe('SXW0PK8VgJg');
    }
  });
  it('refuses links that are not YouTube videos', () => {
    for (const l of ['', 'hello', 'https://vimeo.com/123456', 'https://www.youtube.com/@selkirk', 'https://evil.com/watch?v=SXW0PK8VgJg', 'https://youtube.com/watch?v=short']) {
      expect(parseYouTubeId(l)).toBeNull();
    }
  });
  it('picks up a start time written in the link', () => {
    expect(parseLinkStart('https://youtu.be/SXW0PK8VgJg?t=95')).toBe(95);
    expect(parseLinkStart('https://www.youtube.com/watch?v=SXW0PK8VgJg&t=1m30s')).toBe(90);
    expect(parseLinkStart('https://www.youtube.com/watch?v=SXW0PK8VgJg')).toBe(0);
  });
});

describe('clip times', () => {
  it('formats and reads minutes:seconds', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(629)).toBe('10:29');
    expect(fmtTime(3725)).toBe('1:02:05');
    expect(parseTime('1:30')).toBe(90);
    expect(parseTime('90')).toBe(90);
    expect(parseTime('')).toBeNull();
    expect(parseTime('1:75')).toBeNaN();
    expect(parseTime('abc')).toBeNaN();
  });
  it('checks the range makes sense', () => {
    expect(checkRange(10, 70, 226)).toBeNull();
    expect(checkRange(10, null, 226)).toBeNull();
    expect(checkRange(70, 10)).toBe('The end has to be after the start');
    expect(checkRange(300, null, 226)).toBe('The video is only 3:46 long');
    expect(checkRange(NaN, null)).toMatch(/start/);
    expect(clipLength({ start: 15, end: 76 })).toBe(61);
    expect(clipLength({ start: 0, duration: 178 })).toBe(178);
  });
});

describe('suggested clips', () => {
  const list = builtInClips(new Date('2026-10-28T00:00:00Z'));
  it('covers every shot, starts unreviewed, and has valid ranges', () => {
    for (const s of CLIP_SHOTS) expect(list.filter((c) => c.shot === s).length).toBeGreaterThanOrEqual(2);
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
    for (const c of list) {
      expect(c.status).toBe('new');
      expect(parseYouTubeId(c.videoId)).toBe(c.videoId);
      expect(checkRange(c.start, c.end ?? null, c.duration)).toBeNull();
    }
  });
  it('round-trips shot slugs', () => {
    for (const s of CLIP_SHOTS) expect(shotFromSlug(shotSlug(s))).toBe(s);
    expect(shotFromSlug('nope')).toBeUndefined();
  });
  it('lists approved first, then unreviewed, hidden last', () => {
    const c = (id: string, status: Clip['status']): Clip => ({ ...list[0], id, status });
    expect(sortClips([c('h', 'hidden'), c('n', 'new'), c('a', 'approved')]).map((x) => x.id)).toEqual(['a', 'n', 'h']);
  });
  it('finds the shot an insight is about', () => {
    expect(clipShotForInsight('drill-gap-Dink')).toBe('Dink');
    expect(clipShotForInsight('weak-drill-Third-shot drops')).toBe('Third-shot drop');
    expect(clipShotForInsight('tag-losses-Backhand drive')).toBe('Backhand drive');
    expect(clipShotForInsight('tag-losses-Positioning')).toBeUndefined();
    expect(clipShotForInsight('rating-singles')).toBeUndefined();
  });
});
