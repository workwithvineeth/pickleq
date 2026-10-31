/** Friendly dates and times for every club screen: "Sat, 31 Oct" (with the year only when it isn't this year), "2:30 pm". */

const DAY = 864e5;

/** "Sat, 31 Oct", or "Sat, 31 Oct 2025" for another year. Accepts "2026-10-31" or a full timestamp. Empty input gives "–". */
export function friendlyDate(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return '–';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return d.getFullYear() === now.getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

/** "2:30 pm" from "14:30" (or "14:30:00"). */
export function friendlyTime(hhmm?: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  return new Date(2000, 0, 1, h, m || 0).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/** "Today", "Tomorrow", or the friendly date. */
export function relativeDate(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return '–';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((d - today) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return friendlyDate(iso, now);
}

/** "Sat, 31 Oct, 9:41 am" for a timestamp (year added when it isn't this year). */
export function friendlyDateTime(ts?: string | null, now: Date = new Date()): string {
  if (!ts) return '–';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${friendlyDate(local, now)}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`;
}
