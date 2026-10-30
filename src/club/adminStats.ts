/** Small helpers for the admin dashboard (shared by the demo and the screen). */

const DAY = 86_400_000;

/** The Monday (YYYY-MM-DD) of the week a date falls in. Weeks start on Monday, as on the server. */
export function weekStart(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10);
}

/** How many dates fall in each of the last `n` weeks up to `today`, oldest first. */
export function weeklyCounts(dates: string[], today: string, n = 8): { week: string; matches: number }[] {
  const last = weekStart(today);
  const weeks = Array.from({ length: n }, (_, i) => new Date(Date.parse(`${last}T00:00:00Z`) - (n - 1 - i) * 7 * DAY).toISOString().slice(0, 10));
  const counts = new Map(weeks.map((w) => [w, 0]));
  for (const d of dates) {
    const w = weekStart(d);
    if (counts.has(w)) counts.set(w, counts.get(w)! + 1);
  }
  return weeks.map((week) => ({ week, matches: counts.get(week)! }));
}

/** "26 Oct" for a week's Monday. */
export function weekLabel(week: string): string {
  return new Date(`${week}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Change from last week to this week, as a short phrase. */
export function trend(weeks: { matches: number }[]): string {
  if (weeks.length < 2) return '';
  const now = weeks[weeks.length - 1].matches;
  const before = weeks[weeks.length - 2].matches;
  if (now === before) return 'same as last week';
  return now > before ? `up ${now - before} on last week` : `down ${before - now} on last week`;
}
