/**
 * The Google News feeds one news run reads, all in a single Apify actor run:
 * US top stories, the U.S. topic section ("NATION"), any configured Elections topic
 * IDs, and a fixed list of national election searches limited to the past day.
 *
 * Every article keeps the labels of the feeds that returned it (articles.found_by).
 * Changing a query or a feed bumps NEWS_QUERY_VERSION, which each run records.
 */
import { ELECTION_NIGHT_START, RESULTS_DAY_END } from './schedule.js';

export const NEWS_QUERY_VERSION = 'news-feeds-v1';

/** National election searches. The same list for every party and outlet. */
export const NATIONAL_QUERIES = [
  'midterm elections',
  'Senate race',
  'House race',
  'election poll',
  'early voting',
  'campaign ad',
  'voting rules',
] as const;
/** Added from 6 PM ET on Nov 3 to the end of Nov 4. */
export const RESULTS_QUERIES = ['election results'] as const;
export const TOPICS = ['NATION'] as const;
/** Google News search operator for the past day. */
export const SEARCH_WINDOW = 'when:1d';
export const ITEMS_PER_FEED = 20;

export interface FeedPlan {
  /** Searches, each ending in the past-day operator. */
  queries: string[];
  topics: string[];
  electionTopicIds: string[];
  topStories: boolean;
  itemsPerFeed: number;
}

export function buildFeedPlan(now: Date, electionTopicIds: readonly string[]): FeedPlan {
  const resultsWindow = now >= ELECTION_NIGHT_START && now < RESULTS_DAY_END;
  const searches = [...NATIONAL_QUERIES, ...(resultsWindow ? RESULTS_QUERIES : [])];
  return {
    queries: searches.map((query) => `${query} ${SEARCH_WINDOW}`),
    topics: [...TOPICS],
    electionTopicIds: [...electionTopicIds],
    topStories: true,
    itemsPerFeed: ITEMS_PER_FEED,
  };
}

export function feedCount(plan: FeedPlan): number {
  return plan.queries.length + plan.topics.length + plan.electionTopicIds.length + (plan.topStories ? 1 : 0);
}

/** A search's label drops the past-day operator: "search:Senate race". */
export function searchLabel(query: string): string {
  return `search:${query.replace(/\s*\bwhen:\S+/gi, '').trim()}`;
}
export const TOP_STORIES_LABEL = 'top';
export const topicLabel = (topic: string) => `topic:${topic}`;
export const electionTopicLabel = (topicId: string) => `elections:${topicId}`;

/** Every search is an election search, and so is a configured Elections topic. */
export function isElectionFeed(label: string): boolean {
  return label.startsWith('search:') || label.startsWith('elections:');
}

/** Feeds Google orders by prominence, so an article's rank there means something. Searches are ordered by relevance. */
export function isRankedFeed(label: string): boolean {
  return label === TOP_STORIES_LABEL || label.startsWith('topic:') || label.startsWith('elections:');
}
