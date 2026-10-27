import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { activeMatches } from '../db/matches';
import { ratingHistory } from '../db/ratings';
import { activeSessions } from '../db/training';
import { insights, type Insight } from '../domain/insights';

/** Built-in insights from everything on this phone. Works offline. */
export function useInsights(): Insight[] | undefined {
  return useLiveQuery(async () => {
    const [matches, sessions, singles, doubles, goals] = await Promise.all([
      activeMatches(), activeSessions(), ratingHistory('singles'), ratingHistory('doubles'), db.goals.toArray(),
    ]);
    // Patterns use the last 90 days so old habits don't drown out recent play.
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    return insights({
      matches: matches.filter((m) => m.date >= from), sessions, singles, doubles,
      weeklyHoursGoal: goals.find((g) => g.kind === 'weekly-hours')?.target,
    });
  }, []);
}
