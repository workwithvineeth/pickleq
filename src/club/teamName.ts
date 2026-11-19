/**
 * Team-name entries: when an organiser only knows a team's name (e.g. "Rally House"), the entry is stored as two names,
 * "Rally House" and "Rally House (partner)", because a doubles entry needs two. Show just the team name everywhere.
 * Real partners are never touched: only a second name that is exactly "<first name> (partner)" is hidden.
 */
export function teamNames(names: string[]): string[] {
  if (names.length < 2) return names;
  const [first, ...rest] = names;
  const placeholder = `${first.trim().toLowerCase()} (partner)`;
  return rest.every((n) => n.trim().toLowerCase() === placeholder) ? [first] : names;
}
