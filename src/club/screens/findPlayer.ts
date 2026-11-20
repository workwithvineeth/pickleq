/** Filter fixtures by either entry's player names, without changing their order or scores. */
export function matchesForPlayer<T extends { entryA?: string; entryB?: string }>(
  matches: T[], query: string, nameOf: (entryId: string) => string,
): T[] {
  const text = query.trim().toLowerCase();
  if (!text) return matches;
  return matches.filter((match) => [match.entryA, match.entryB].some(
    (id) => id !== undefined && nameOf(id).toLowerCase().includes(text),
  ));
}
