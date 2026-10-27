/**
 * Adapters for the Google News actors on Apify that the news job can use.
 *
 * Actors from different developers take different inputs and name their output
 * fields differently, so each supported actor has an adapter that builds its input
 * from a FeedPlan and maps its items to one shape. Field reads are tolerant: a
 * missing field becomes null, never a guess. Supporting another actor means adding
 * an adapter here; choosing between supported ones is the APIFY_NEWS_ACTOR_ID setting.
 */
import { electionTopicLabel, isRankedFeed, searchLabel, TOP_STORIES_LABEL, topicLabel, type FeedPlan } from './feeds.js';

export interface RawRelated {
  headline: string | null;
  outlet: string | null;
  url: string | null;
}

/** One article as an actor returned it, before normalizing. */
export interface RawNewsItem {
  /** The label of the feed that returned it: "top", "topic:NATION", "search:Senate race". */
  feed: string;
  /** Rank within a ranked feed (top stories or a topic). Null for searches. */
  position: number | null;
  headline: string | null;
  /** The publisher's article URL, when the actor decoded it. */
  url: string | null;
  /** Google News's redirect link to the article. */
  googleUrl: string | null;
  outlet: string | null;
  outletHomeUrl: string | null;
  publishedAt: string | null;
  snippet: string | null;
  related: RawRelated[];
}

export interface ActorAdapter {
  id: string;
  buildInput(plan: FeedPlan, maxItems: number): Record<string, unknown>;
  parseItems(items: unknown[], plan: FeedPlan): RawNewsItem[];
}

type Raw = Record<string, unknown>;

/** A trimmed string with control characters removed (Postgres rejects NUL in text), or null. */
export const str = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return clean || null;
};
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null);

/** Text from an HTML snippet: tags dropped, common entities decoded, whitespace collapsed. */
export function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 500) : null;
}

/** Which feed returned an item, from the query, topic, or topic ID the actor echoes back. */
export function feedOf(raw: Raw, plan: FeedPlan): string {
  const query = str(raw.query);
  if (query) return searchLabel(query);
  for (const topic of [str(raw.topicId), str(raw.topic)]) {
    if (!topic) continue;
    return plan.electionTopicIds.includes(topic) ? electionTopicLabel(topic) : topicLabel(topic.toUpperCase());
  }
  return TOP_STORIES_LABEL;
}

function parseRelated(value: unknown): RawRelated[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((entry) => {
    const raw = (entry ?? {}) as Raw;
    return {
      headline: str(raw.title) ?? str(raw.headline),
      outlet: str(raw.publisher) ?? str(raw.publisherName) ?? str(raw.source),
      url: str(raw.link) ?? str(raw.url) ?? str(raw.publisherUrl) ?? str(raw.googleNewsUrl),
    };
  }).filter((entry) => entry.headline || entry.outlet || entry.url);
}

/**
 * Fill in ranks the actor didn't give. In a ranked feed, items arrive in Google's
 * order, so the nth item of a feed is rank n. Searches get no rank.
 */
function withPositions(items: Array<Omit<RawNewsItem, 'position'> & { position: number | null }>): RawNewsItem[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const index = (seen.get(item.feed) ?? 0) + 1;
    seen.set(item.feed, index);
    if (!isRankedFeed(item.feed)) return { ...item, position: null };
    return { ...item, position: item.position ?? index };
  });
}

/** tacps126/google-news: has `position` and `relatedArticles`, but no top stories feed. */
const tacps126: ActorAdapter = {
  id: 'tacps126/google-news',
  buildInput: (plan, maxItems) => ({
    queries: plan.queries,
    topics: [...plan.topics, ...plan.electionTopicIds],
    language: 'en',
    country: 'US',
    timeframe: '1d',
    resolveUrls: true,
    includeRelated: true,
    maxItems,
    maxItemsPerQuery: plan.itemsPerFeed,
    // Off, so a story keeps every feed it appears in and its rank refreshes each run.
    dedupe: false,
    onlyNew: false,
  }),
  parseItems: (items, plan) => withPositions(items.map((entry) => {
    const raw = (entry ?? {}) as Raw;
    return {
      feed: feedOf(raw, plan),
      position: num(raw.position),
      headline: str(raw.title),
      url: raw.urlResolved === false ? null : str(raw.url),
      googleUrl: str(raw.googleNewsUrl),
      outlet: str(raw.publisher),
      // This actor's publisherUrl is the outlet's homepage.
      outletHomeUrl: str(raw.publisherUrl),
      publishedAt: str(raw.publishedAt),
      snippet: stripHtml(str(raw.description) ?? str(raw.snippet)),
      related: parseRelated(raw.relatedArticles),
    };
  })),
};

/** cirkit/google-news-scraper: has top stories, topic IDs, and `relatedCoverage`, but no rank field. */
const cirkit: ActorAdapter = {
  id: 'cirkit/google-news-scraper',
  buildInput: (plan, maxItems) => ({
    queries: plan.queries,
    includeTopStories: plan.topStories,
    topics: plan.topics,
    topicIds: plan.electionTopicIds,
    locales: [{ hl: 'en-US', gl: 'US', ceid: 'US:en' }],
    resolvePublisherUrls: true,
    maxResultsPerTarget: plan.itemsPerFeed,
    maxResults: maxItems,
  }),
  parseItems: (items, plan) => withPositions(items.map((entry) => {
    const raw = (entry ?? {}) as Raw;
    return {
      feed: /top/i.test(str(raw.feedKind) ?? '') && !str(raw.query) ? TOP_STORIES_LABEL : feedOf(raw, plan),
      position: null,
      headline: str(raw.title),
      // This actor's publisherUrl is the decoded article URL.
      url: str(raw.publisherUrl),
      googleUrl: str(raw.googleNewsUrl),
      outlet: str(raw.publisherName),
      outletHomeUrl: str(raw.publisherHomeUrl),
      publishedAt: str(raw.publishedAt),
      snippet: stripHtml(str(raw.snippetHtml)),
      related: parseRelated(raw.relatedCoverage),
    };
  })),
};

export const ACTOR_ADAPTERS: Record<string, ActorAdapter> = {
  [tacps126.id]: tacps126,
  [cirkit.id]: cirkit,
};

export function adapterFor(actorId: string): ActorAdapter {
  const adapter = ACTOR_ADAPTERS[actorId.trim()];
  if (!adapter) {
    throw new Error(`No adapter for Apify actor "${actorId}". Supported: ${Object.keys(ACTOR_ADAPTERS).join(', ')}`);
  }
  return adapter;
}
