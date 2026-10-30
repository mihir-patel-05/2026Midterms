/**
 * The national politics searches sent to Apify each run (docs/plans/news-agents.md,
 * "Scope change"). Every query is limited to the past day with Google News'
 * `when:1d` operator, so the actor never returns older articles whatever its own
 * date options are. Code drops anything older than 24 hours again after fetching.
 *
 * The list is the same for every party and names no candidate, outlet, or party.
 * Change it by pull request and bump NEWS_QUERY_VERSION.
 */
export const NEWS_QUERY_VERSION = 'news-q1';

const BASE_QUERIES = [
  'midterm elections',
  'Senate race',
  'House race',
  'Congress',
  'White House',
  'Supreme Court',
  'election poll',
  'early voting',
] as const;

/** Election night (Nov 3, 6 PM ET) onward, results coverage is the story. */
const RESULTS_FROM = Date.parse('2026-11-03T23:00:00Z');

export function buildNewsQueries(now: Date = new Date()): string[] {
  const queries: string[] = [...BASE_QUERIES];
  if (now.getTime() >= RESULTS_FROM) queries.push('election results');
  return queries.map((query) => `${query} when:1d`);
}

/** The query as a reader would type it, for logs and run metadata. */
export function plainQuery(query: string): string {
  return query.replace(/\s+when:\d+[hd]$/, '');
}
