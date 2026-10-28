/**
 * Groups articles about the same event into stories, and ranks them without AI.
 *
 * Grouping: two headlines belong to the same story when their content words
 * overlap enough (Jaccard similarity of 0.5 or more), checked against every
 * article already in the group. The lead is the earliest article, which is
 * most often the original report; the rest become "also covered by".
 *
 * Ranking (the fallback when Agent 10 is off or fails): how many outlets ran
 * the story, decayed with a 12-hour half-life, plus a little for each search
 * that found it. Which outlet published a story is never a factor.
 */
import type { NewsTopic } from '@prisma/client';
import type { NormalizedArticle } from './normalize.js';
import { headlineKey } from './normalize.js';

export interface StoryCandidate {
  /** Stable within one run: c1, c2, ... in time order. */
  id: string;
  lead: NormalizedArticle;
  /** Every article in the group, lead first. */
  articles: NormalizedArticle[];
  outletCount: number;
  latestAt: Date;
  queryHits: number;
}

const SIMILARITY = 0.5;
const HALF_LIFE_HOURS = 12;
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have', 'he', 'her', 'his', 'how', 'in',
  'is', 'it', 'its', 'new', 'of', 'on', 'or', 'over', 'says', 'she', 'that', 'the', 'their', 'they', 'this', 'to', 'up',
  'was', 'what', 'when', 'who', 'why', 'will', 'with', 'after', 'about', 'into', 'than', 'out', 'not', 'just', 'more',
]);

export function contentWords(headline: string): Set<string> {
  return new Set(headlineKey(headline).split(' ').filter((word) => word.length > 2 && !STOPWORDS.has(word)));
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function groupStories(articles: NormalizedArticle[]): StoryCandidate[] {
  const ordered = [...articles].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.url.localeCompare(b.url));
  const groups: Array<{ articles: NormalizedArticle[]; words: Array<Set<string>> }> = [];
  for (const article of ordered) {
    const words = contentWords(article.headline);
    let best: (typeof groups)[number] | null = null;
    let bestScore = 0;
    for (const group of groups) {
      const score = Math.max(...group.words.map((other) => similarity(words, other)));
      if (score >= SIMILARITY && score > bestScore) {
        best = group;
        bestScore = score;
      }
    }
    if (best) {
      best.articles.push(article);
      best.words.push(words);
    } else {
      groups.push({ articles: [article], words: [words] });
    }
  }
  return groups.map((group, index) => ({
    id: `c${index + 1}`,
    lead: group.articles[0],
    articles: group.articles,
    outletCount: new Set(group.articles.map((article) => article.outletDomain)).size,
    latestAt: new Date(Math.max(...group.articles.map((article) => article.publishedAt.getTime()))),
    queryHits: new Set(group.articles.flatMap((article) => article.queries)).size,
  }));
}

export function storyScore(story: StoryCandidate, now: Date): number {
  const ageHours = Math.max(0, (now.getTime() - story.latestAt.getTime()) / 3_600_000);
  return (1 + Math.log2(story.outletCount)) * 0.5 ** (ageHours / HALF_LIFE_HOURS) + 0.1 * story.queryHits;
}

/** Highest score first; ties go to the newer story, then the headline, so the order is stable. */
export function rankStories(stories: StoryCandidate[], now: Date): StoryCandidate[] {
  const scored = stories.map((story) => ({ story, score: storyScore(story, now) }));
  scored.sort((a, b) => b.score - a.score
    || b.story.latestAt.getTime() - a.story.latestAt.getTime()
    || a.story.lead.headline.localeCompare(b.story.lead.headline));
  return scored.map((entry) => entry.story);
}

// Generic political vocabulary for the fallback, so a sports "race" or a
// "house" listing does not make the list. No party, person, or outlet names.
const POLITICS = /\b(elections?|electoral|midterms?|senate|senators?|house|congress(ional)?|congressman|congresswoman|lawmakers?|legislat\w*|campaign\w*|candidates?|ballots?|voters?|voting|votes?|polls?|polling|governors?|gubernatorial|president\w*|white house|administration|cabinet|supreme court|justices?|federal judge|democrat\w*|republican\w*|gop|bipartisan|partisan|filibuster|speaker|impeach\w*|primary|caucus|redistricting|gerrymander\w*|super pac|fundrais\w*|endorse\w*|debates?)\b/i;

export function looksPolitical(story: StoryCandidate): boolean {
  return story.articles.some((article) => POLITICS.test(`${article.headline} ${article.snippet ?? ''}`));
}

const TOPIC_RULES: Array<[NewsTopic, RegExp]> = [
  ['RESULTS', /\b(concedes?|projected winner|race (is )?called|election results|recount|runoff)\b/i],
  ['POLLS', /\b(polls?|polling|survey|leads? by|points? ahead)\b/i],
  ['COURTS', /\b(court|judge|justices?|ruling|rules|lawsuit|sued|indict\w*|charged|investigation|probe|ethics)\b/i],
  ['VOTING', /\b(early voting|mail[- ]in|absentee|voter (id|rolls?|registration)|polling places?|ballot (access|counting)|turnout)\b/i],
  ['MONEY', /\b(fundrais\w*|raised|donors?|super pac|spending|ad buy|millions?)\b/i],
  ['CAMPAIGN', /\b(campaign\w*|debates?|rall(y|ies)|endorse\w*|ads?|candidates?|race)\b/i],
  ['WHITE_HOUSE', /\b(white house|president\w*|administration|executive order|cabinet)\b/i],
  ['CONGRESS', /\b(congress|senate|house|lawmakers?|bill|shutdown|speaker|filibuster)\b/i],
  ['POLICY', /\b(tax\w*|tariffs?|immigration|health care|economy|inflation|abortion|budget)\b/i],
];

/** A topic for code-ranked stories, from the lead headline. The agent picks its own. */
export function guessTopic(headline: string): NewsTopic {
  return TOPIC_RULES.find(([, pattern]) => pattern.test(headline))?.[0] ?? 'OTHER';
}
