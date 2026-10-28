/** Shared builders for the news tests. Times are relative to a fixed `now`. */
import type { NormalizedArticle } from './normalize.js';
import { groupStories, type StoryCandidate } from './stories.js';

export const NEWS_NOW = new Date('2026-10-28T16:00:00Z');

export const hoursBefore = (hours: number, now: Date = NEWS_NOW) => new Date(now.getTime() - hours * 3_600_000);

export function article(outlet: string, headline: string, hours: number, options: { snippet?: string; query?: string; now?: Date } = {}): NormalizedArticle {
  const slug = headline.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    id: `${outlet}-${slug}`,
    url: `https://${outlet}.com/${slug}`,
    headline,
    snippet: options.snippet ?? null,
    outlet: outlet[0].toUpperCase() + outlet.slice(1),
    outletDomain: `${outlet}.com`,
    publishedAt: hoursBefore(hours, options.now),
    queries: [options.query ?? 'Congress when:1d'],
  };
}

/** Four political stories (one covered by three outlets) and one sports story. */
export function sampleCandidates(now: Date = NEWS_NOW): StoryCandidate[] {
  return groupStories([
    article('wireone', 'Supreme Court agrees to hear mail ballot deadline case', 6, { now }),
    article('dailytwo', 'Supreme Court will hear mail ballot deadline case', 5, { now }),
    article('postthree', 'Supreme Court to hear case on mail ballot deadline', 4, { now }),
    article('wireone', 'Senate passes stopgap funding bill to avert shutdown', 3, { now }),
    article('heraldfour', 'New poll shows tight Pennsylvania Senate race', 2, { now }),
    article('dailytwo', 'Governor signs election security law', 1, { now }),
    article('sportsfive', 'Local team wins the championship', 0.5, { now }),
  ]);
}

/** Apify dataset items in the shape most Google News actors return. */
export function apifyItems(now: Date = NEWS_NOW): unknown[] {
  return sampleCandidates(now).flatMap((story) => story.articles).map((item) => ({
    title: `${item.headline} - ${item.outlet}`,
    link: `https://news.google.com/rss/articles/${item.id}`,
    decodedUrl: `${item.url}?utm_source=google`,
    source: { name: item.outlet },
    publishedAt: item.publishedAt.toISOString(),
    description: item.snippet ?? undefined,
    query: item.queries[0],
  }));
}
