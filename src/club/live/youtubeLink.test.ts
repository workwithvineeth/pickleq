import { expect, it } from 'vitest';
import { parseYouTubeLink } from './youtubeLink';

const id = 'Ab3dEfG_h-1';

it.each([
  `https://youtube.com/watch?v=${id}`,
  `https://www.youtube.com/watch?v=${id}&t=10s&list=PLabc`,
  `https://m.youtube.com/watch?si=share&v=${id}`,
  `https://youtu.be/${id}?si=share`,
  `https://www.youtube.com/live/${id}`,
  `https://www.youtube.com/embed/${id}`,
  `https://youtube-nocookie.com/embed/${id}`,
  `https://www.youtube-nocookie.com/embed/${id}`,
  ` \tHTTP://WWW.YOUTUBE.COM/watch?v=${id}\n`,
])('parses %s', url => {
  expect(parseYouTubeLink(url)).toEqual({ ok: true, videoId: id });
});

it.each([
  `https://youtube.com.evil.in/watch?v=${id}`,
  `https://evil.com/youtube.com/watch?v=${id}`,
  `https://youtube.co/watch?v=${id}`,
  `https://youtube.com@evil.in/watch?v=${id}`,
  'javascript:alert(1)',
  'data:text/html,hello',
  `ftp://youtube.com/watch?v=${id}`,
  `<iframe src="https://www.youtube.com/embed/${id}"></iframe>`,
  'https://youtube.com/playlist?list=PLabc',
  'https://youtube.com/watch?list=PLabc',
  'https://youtube.com/channel/channel-id',
  'https://youtube.com/@name',
  'https://youtube.com/c/name',
  'https://youtube.com/user/name',
  'https://youtube.com/results?search_query=pickleball',
  `https://youtube.com/shorts/${id}`,
  `https://youtu.be/${id}/extra`,
  'https://youtu.be/',
  'https://youtu.be/1234567890',
  'https://youtu.be/123456789012',
  'https://youtu.be/1234567890!',
  'https://youtube.com/watch?v=1234567890%2F',
  'https://youtube.com/watch?v=12345678901%0A',
  `youtube.com/watch?v=${id}`,
  '',
  '   ',
  `https://youtu.be/${id}?si=${'a'.repeat(500)}`,
])('rejects %s with a message', url => {
  expect(parseYouTubeLink(url)).toEqual({ ok: false, reason: expect.stringContaining("YouTube's Share button") });
});
