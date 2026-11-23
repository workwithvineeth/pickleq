const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const EMBED_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const INVALID_LINK = "That isn't a YouTube video link. Paste the link from YouTube's Share button.";

export function isYouTubeVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

export function parseYouTubeLink(input: string): { ok: true; videoId: string } | { ok: false; reason: string } {
  const bad = { ok: false, reason: INVALID_LINK } as const;
  if (input.length > 500) return bad;
  let url: URL;
  try { url = new URL(input.trim()); } catch { return bad; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return bad;

  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  let videoId: string | null | undefined;
  if (host === 'youtu.be') videoId = /^\/([^/]+)$/.exec(path)?.[1];
  else if (YOUTUBE_HOSTS.has(host)) {
    videoId = path === '/watch' ? url.searchParams.get('v') : /^\/(?:live|embed)\/([^/]+)$/.exec(path)?.[1];
  } else if (EMBED_HOSTS.has(host)) {
    videoId = /^\/embed\/([^/]+)$/.exec(path)?.[1];
  }
  return videoId && isYouTubeVideoId(videoId) ? { ok: true, videoId } : bad;
}
