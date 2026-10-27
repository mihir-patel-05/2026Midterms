/**
 * Groups stored articles into stories and ranks them by a published trending score.
 * Deterministic code, no AI (PLAN.md §1: numbers come from code).
 *
 * A story is one Google News cluster, meaning an article and the other outlets Google
 * lists as related coverage, merged with articles we stored under the same link or
 * the same headline. For each story:
 *
 *   score = (ln(1 + outlets) + positionBonus) × 0.5^(hoursSinceLatestArticle / 12)
 *
 * - outlets: distinct outlets covering the story, including Google's related coverage.
 * - positionBonus: 1 if Google ranked it 5th or higher in US top stories or a topic
 *   section in the past 6 hours, 0.5 if 15th or higher, else 0.
 * - The half-life keeps a story that is still drawing new coverage near the top.
 *
 * A story counts as election news if a national election search or an Elections topic
 * returned it, or if a headline or snippet uses an election term. The term list is
 * the same for every party.
 */
import { isElectionFeed, isRankedFeed } from './feeds.js';
import { canonicalUrl, outletKey } from './normalize.js';

export const TRENDING_VERSION = 1;
/** Articles last seen within this window are grouped into stories. */
export const STORY_WINDOW_HOURS = 48;
export const POSITION_FRESH_HOURS = 6;
export const HALF_LIFE_HOURS = 12;
const HOUR_MS = 60 * 60 * 1000;

export const ELECTION_TERMS = /\b(midterms?|elections?|electoral|senate|senators?|congress|congressional|congressman|congresswoman|house (race|races|seat|seats|majority|control|republicans|democrats|gop)|ballots?|voters?|voting|votes?|polls?|polling|pollsters?|campaigns?|candidates?|gop|republicans?|democrats?|democratic|primary|primaries|absentee|redistricting|gerrymander\w*|swing states?|battleground|governor's race)\b/i;

export interface RelatedCoverage {
  headline: string | null;
  outlet: string | null;
  url: string | null;
}

export interface StoryArticle {
  id: string;
  headline: string;
  snippet: string | null;
  outlet: string;
  outletKey: string;
  url: string;
  publishedAt: Date;
  foundBy: string[];
  feedPosition: number | null;
  feedPositionAt: Date | null;
  related: RelatedCoverage[];
}

export interface TrendingStory {
  /** The lead article's ID. */
  id: string;
  lead: StoryArticle;
  members: StoryArticle[];
  outletCount: number;
  /** Google's best rank for the story in the past 6 hours, if any. */
  bestPosition: number | null;
  latestPublishedAt: Date;
  ageHours: number;
  isElection: boolean;
  score: number;
  /** Other outlets with a link, lead outlet excluded. */
  alsoCoveredBy: Array<{ outlet: string; url: string }>;
}

export function isElectionText(text: string | null | undefined): boolean {
  return !!text && ELECTION_TERMS.test(text);
}

/** Headlines that are equal once case and punctuation are ignored. Short ones ("Live updates") never match. */
export function headlineKey(headline: string | null): string | null {
  if (!headline) return null;
  const words = headline.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  return words.length >= 5 ? words.join(' ') : null;
}

function freshPosition(article: StoryArticle, now: Date): number | null {
  if (article.feedPosition === null || !article.feedPositionAt) return null;
  if (now.getTime() - article.feedPositionAt.getTime() > POSITION_FRESH_HOURS * HOUR_MS) return null;
  if (!article.foundBy.some(isRankedFeed)) return null;
  return article.feedPosition;
}

/** Union-find over shared links and headlines. */
export function clusterArticles(articles: StoryArticle[]): StoryArticle[][] {
  const parent = articles.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const owner = new Map<string, number>();
  const claim = (key: string | null, index: number) => {
    if (!key) return;
    const existing = owner.get(key);
    if (existing === undefined) owner.set(key, index);
    else parent[find(index)] = find(existing);
  };
  articles.forEach((article, index) => {
    claim(`u:${canonicalUrl(article.url) ?? article.url}`, index);
    claim(headlineKey(article.headline) && `h:${headlineKey(article.headline)}`, index);
    for (const related of article.related) {
      if (related.url) claim(`u:${canonicalUrl(related.url) ?? related.url}`, index);
      const key = headlineKey(related.headline);
      if (key) claim(`h:${key}`, index);
    }
  });
  const groups = new Map<number, StoryArticle[]>();
  articles.forEach((article, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), article]);
  });
  return [...groups.values()];
}

export function scoreStory(members: StoryArticle[], now: Date): TrendingStory {
  const ranked = [...members].sort((a, b) =>
    (freshPosition(a, now) ?? Infinity) - (freshPosition(b, now) ?? Infinity)
    || a.publishedAt.getTime() - b.publishedAt.getTime()
    || a.id.localeCompare(b.id));
  const lead = ranked[0];
  const outlets = new Set<string>();
  const alsoCoveredBy: Array<{ outlet: string; url: string }> = [];
  const listed = new Set([lead.outletKey]);
  for (const article of ranked) {
    outlets.add(article.outletKey);
    if (!listed.has(article.outletKey)) {
      listed.add(article.outletKey);
      alsoCoveredBy.push({ outlet: article.outlet, url: article.url });
    }
  }
  for (const article of ranked) {
    for (const related of article.related) {
      if (!related.outlet) continue;
      const key = outletKey(related.outlet);
      if (!key) continue;
      outlets.add(key);
      if (related.url && !listed.has(key)) {
        listed.add(key);
        alsoCoveredBy.push({ outlet: related.outlet, url: related.url });
      }
    }
  }
  const positions = members.map((article) => freshPosition(article, now)).filter((value): value is number => value !== null);
  const bestPosition = positions.length ? Math.min(...positions) : null;
  const positionBonus = bestPosition === null ? 0 : bestPosition <= 5 ? 1 : bestPosition <= 15 ? 0.5 : 0;
  const latestPublishedAt = new Date(Math.max(...members.map((article) => article.publishedAt.getTime())));
  const ageHours = Math.max(0, (now.getTime() - latestPublishedAt.getTime()) / HOUR_MS);
  const score = (Math.log(1 + outlets.size) + positionBonus) * 0.5 ** (ageHours / HALF_LIFE_HOURS);
  const isElection = members.some((article) =>
    article.foundBy.some(isElectionFeed) || isElectionText(article.headline) || isElectionText(article.snippet));
  return {
    id: lead.id,
    lead,
    members: ranked,
    outletCount: outlets.size,
    bestPosition,
    latestPublishedAt,
    ageHours: Math.round(ageHours * 10) / 10,
    isElection,
    score: Math.round(score * 10_000) / 10_000,
    alsoCoveredBy: alsoCoveredBy.slice(0, 5),
  };
}

/** Stories by score, highest first. Ties go to the newer story, then the lead article's ID. */
export function rankStories(articles: StoryArticle[], now: Date, options: { electionOnly?: boolean; limit?: number } = {}): TrendingStory[] {
  const { electionOnly = true, limit = 10 } = options;
  return clusterArticles(articles)
    .map((members) => scoreStory(members, now))
    .filter((story) => !electionOnly || story.isElection)
    .sort((a, b) => b.score - a.score || b.latestPublishedAt.getTime() - a.latestPublishedAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, limit);
}
