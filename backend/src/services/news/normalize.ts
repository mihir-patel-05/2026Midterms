/**
 * Turns Apify dataset items into clean articles from the past 24 hours. Pure
 * functions, so the rules are unit-tested without a network or a database.
 *
 * Google News actors name their fields differently, so each field is read from
 * the common names in order. A row without a decoded publisher URL, a headline,
 * or a publish time inside the window is rejected and counted by reason.
 */
import { createHash } from 'crypto';
import { isExcludedDomain } from './domain-rules.js';

export interface NormalizedArticle {
  /** SHA-256 of the canonical URL. */
  id: string;
  url: string;
  headline: string;
  snippet: string | null;
  outlet: string;
  outletDomain: string;
  publishedAt: Date;
  /** The searches that returned it. */
  queries: string[];
}

export type RejectReason =
  | 'not_an_object'
  | 'no_url'
  | 'google_redirect'
  | 'no_headline'
  | 'no_publish_time'
  | 'too_old'
  | 'in_future'
  | 'excluded_domain'
  | 'duplicate';

export interface NormalizeResult {
  articles: NormalizedArticle[];
  rejected: Partial<Record<RejectReason, number>>;
}

export interface NormalizeOptions {
  now?: Date;
  windowHours?: number;
}

const SNIPPET_MAX = 300;
const FUTURE_SLACK_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// Decoded publisher links first, then whatever link the actor returns.
const URL_FIELDS = ['decodedUrl', 'resolvedUrl', 'publisherUrl', 'articleUrl', 'url', 'link', 'sourceUrl'];
const HEADLINE_FIELDS = ['title', 'headline'];
const SNIPPET_FIELDS = ['description', 'snippet', 'summary', 'excerpt'];
const TIME_FIELDS = ['publishedAt', 'published_at', 'published', 'pubDate', 'publishDate', 'datePublished', 'date', 'time'];
const OUTLET_FIELDS = ['source', 'publisher', 'sourceName', 'outlet', 'site'];
const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|dclid|mc_cid|mc_eid|cmpid|ocid|taid|smid|ref|referrer|outputtype|amp)$/i;

/** Lowercase host without `www.`, no tracking parameters, fragment, or AMP suffix. */
export function canonicalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^amp\./, '');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/amp\/?$/i, '/').replace(/\.amp(\.html)?$/i, '$1').replace(/(.)\/+$/, '$1');
  return url.toString();
}

/**
 * The outlet's front page rather than an article, such as https://nytimes.com/.
 * Google News feeds put it in `sourceUrl` next to the undecoded article link.
 */
export function isHomepage(canonicalUrl: string): boolean {
  const { pathname, search } = new URL(canonicalUrl);
  return pathname === '/' && search === '';
}

/** A news.google.com or google.com/url redirect rather than the publisher's own page. */
export function isGoogleNewsLink(url: string): boolean {
  try {
    return /(^|\.)google\.[a-z.]+$/.test(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
  return clean || null;
}

function first(item: Record<string, unknown>, fields: string[]): unknown {
  for (const field of fields) {
    const value = item[field];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function outletName(item: Record<string, unknown>): string | null {
  const value = first(item, OUTLET_FIELDS);
  if (typeof value === 'string') return text(value);
  if (value && typeof value === 'object') {
    const named = value as Record<string, unknown>;
    return text(named.name) ?? text(named.title);
  }
  return null;
}

const RELATIVE = /^(\d+)\s*(minute|min|hour|hr|day)s?\s+ago$/i;

/** ISO strings, RSS dates, epoch numbers, and "3 hours ago". */
export function parsePublishedAt(value: unknown, now: Date): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  if (typeof value !== 'string') return null;
  const relative = value.trim().match(RELATIVE);
  if (relative) {
    const unit = relative[2].toLowerCase();
    const ms = unit.startsWith('d') ? 24 * HOUR_MS : unit.startsWith('h') ? HOUR_MS : 60_000;
    return new Date(now.getTime() - Number(relative[1]) * ms);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/** Google News titles end in " - Outlet"; the outlet is shown separately. */
export function cleanHeadline(headline: string, outlet: string | null): string {
  if (outlet) {
    const suffix = ` - ${outlet}`;
    if (headline.endsWith(suffix) && headline.length > suffix.length) return headline.slice(0, -suffix.length).trim();
  }
  return headline;
}

/** Lowercase words without punctuation, for "same story at another link" checks. */
export function headlineKey(headline: string): string {
  return headline.toLowerCase().replace(/[‘’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function prettyDomain(domain: string): string {
  return domain.replace(/^www\./, '');
}

/** Rejection counts for logs, largest first: "google_redirect 8, too_old 2". */
export function describeRejected(rejected: NormalizeResult['rejected']): string {
  return Object.entries(rejected)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ');
}

/**
 * One raw result's shape for logs when a run has nothing usable: its field
 * names, the host each link field points at, and its publish time. That is
 * enough to tell an actor that ignored the input or returned undecoded Google
 * links from one whose fields we don't read.
 */
export function describeItemShape(item: unknown): string {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return `not an object (${Array.isArray(item) ? 'array' : typeof item})`;
  const record = item as Record<string, unknown>;
  const links = URL_FIELDS.flatMap((field) => {
    const value = record[field];
    if (typeof value !== 'string' || value.trim() === '') return [];
    const canonical = canonicalizeUrl(value);
    if (!canonical) return [`${field}=unparseable`];
    const note = isGoogleNewsLink(canonical) ? ' (Google link)' : isHomepage(canonical) ? ' (homepage)' : '';
    return [`${field}=${new URL(canonical).hostname}${note}`];
  });
  const timeField = TIME_FIELDS.find((field) => record[field] !== undefined && record[field] !== null && record[field] !== '');
  const time = timeField ? `${timeField}=${JSON.stringify(record[timeField]).slice(0, 40)}` : '(none)';
  return `fields ${Object.keys(record).join(', ') || '(none)'}; links ${links.join(', ') || '(none)'}; time ${time}`;
}

export function normalizeItems(items: unknown[], options: NormalizeOptions = {}): NormalizeResult {
  const now = options.now ?? new Date();
  const oldest = now.getTime() - (options.windowHours ?? 24) * HOUR_MS;
  const rejected: NormalizeResult['rejected'] = {};
  const reject = (reason: RejectReason) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };
  const byUrl = new Map<string, NormalizedArticle>();
  const byOutletHeadline = new Map<string, NormalizedArticle>();

  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      reject('not_an_object');
      continue;
    }
    const item = raw as Record<string, unknown>;
    const links = URL_FIELDS.map((field) => item[field]).filter((value): value is string => typeof value === 'string' && value.trim() !== '');
    if (links.length === 0) {
      reject('no_url');
      continue;
    }
    // The first link to an article on the publisher's site. Without one, an
    // undecoded Google link counts as a redirect, not as the outlet's homepage.
    const canonical = links
      .filter((link) => !isGoogleNewsLink(link))
      .map((link) => canonicalizeUrl(link))
      .find((url): url is string => url !== null && !isHomepage(url));
    if (!canonical) {
      reject(links.some(isGoogleNewsLink) ? 'google_redirect' : 'no_url');
      continue;
    }
    const domain = prettyDomain(new URL(canonical).hostname);
    if (isExcludedDomain(domain)) {
      reject('excluded_domain');
      continue;
    }
    const outlet = outletName(item) ?? domain;
    const rawHeadline = text(first(item, HEADLINE_FIELDS));
    if (!rawHeadline) {
      reject('no_headline');
      continue;
    }
    const publishedAt = parsePublishedAt(first(item, TIME_FIELDS), now);
    if (!publishedAt) {
      reject('no_publish_time');
      continue;
    }
    if (publishedAt.getTime() < oldest) {
      reject('too_old');
      continue;
    }
    if (publishedAt.getTime() > now.getTime() + FUTURE_SLACK_MS) {
      reject('in_future');
      continue;
    }
    const headline = cleanHeadline(rawHeadline, outlet);
    const snippetText = text(first(item, SNIPPET_FIELDS));
    // Some actors repeat the headline as the description; that adds nothing.
    const snippet = snippetText && headlineKey(snippetText) !== headlineKey(headline) ? snippetText.slice(0, SNIPPET_MAX) : null;
    const query = typeof item.query === 'string' ? item.query : typeof item.searchQuery === 'string' ? item.searchQuery : null;

    // The same story at the same link, or at another link on the same outlet.
    const outletKey = `${domain}|${headlineKey(headline)}`;
    const existing = byUrl.get(canonical) ?? byOutletHeadline.get(outletKey);
    if (existing) {
      if (query && !existing.queries.includes(query)) existing.queries.push(query);
      if (!existing.snippet && snippet) existing.snippet = snippet;
      reject('duplicate');
      continue;
    }
    const article: NormalizedArticle = {
      id: createHash('sha256').update(canonical).digest('hex'),
      url: canonical,
      headline,
      snippet,
      outlet,
      outletDomain: domain,
      publishedAt,
      queries: query ? [query] : [],
    };
    byUrl.set(canonical, article);
    byOutletHeadline.set(outletKey, article);
  }

  return { articles: [...byUrl.values()], rejected };
}
