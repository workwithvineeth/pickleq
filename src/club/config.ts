/** Club mode only appears in builds that switch it on (the Club test site). Live and Preview stay as they are. */
export function isClubEnabled(): boolean {
  return import.meta.env.VITE_CLUB === 'on';
}

export function clubServerConfig(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_KEY;
  return url && key ? { url, key } : null;
}

export type ClubMode = 'demo' | 'server';
const MODE_KEY = 'pq-club-mode';

export function clubMode(): ClubMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'demo' || v === 'server' ? v : null;
  } catch { return null; }
}

export function setClubMode(m: ClubMode | null) {
  try { if (m) localStorage.setItem(MODE_KEY, m); else localStorage.removeItem(MODE_KEY); } catch { /* private mode */ }
}
