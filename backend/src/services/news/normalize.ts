/**
 * Turns an actor's raw article into the row the news job stores, or a reason to drop it.
 *
 * Rules (the same for every outlet and party):
 * - A headline, a link, an outlet, and a publish time are required.
 * - The link is the publisher's URL when the actor decoded it, else Google News's link.
 * - The canonical URL drops tracking parameters, fragments, "www.", and AMP suffixes.
 *   Its SHA-256 is the article's external ID, so a repeat sighting matches the stored row.
 * - Articles older than 72 hours, or more than an hour in the future, are dropped.
 * - Social media, video sites, and press-release wires are not news and are dropped.
 *   Outlets are never filtered or ranked by ideology.
 */
import { createHash } from 'node:crypto';
import type { RawNewsItem, RawRelated } from './apify-actors.js';

export const MAX_AGE_HOURS = 72;
const HOUR_MS = 60 * 60 * 1000;

/** Not news: social and video platforms, and press-release distribution wires. */
export const EXCLUDED_DOMAINS = [
  'youtube.com', 'youtu.be', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'threads.net',
  'reddit.com', 'prnewswire.com', 'businesswire.com', 'globenewswire.com', 'accesswire.com', 'einpresswire.com', 'newswire.com',
] as const;

const TRACKING_PARAM = /^(utm_\w+|fbclid|gclid|dclid|mc_cid|mc_eid|ocid|cmpid|smid|smtyp|cid|ref|ref_src|ref_url|src|taid|guccounter|_ga|outputType)$/i;

export type Rejection = 'no_headline' | 'no_url' | 'no_outlet' | 'no_time' | 'too_old' | 'future' | 'excluded_domain';

export interface NormalizedArticle {
  externalId: string;
  url: string;
  canonicalUrl: string;
  headline: string;
  snippet: string | null;
  outlet: string;
  outletKey: string;
  outletDomain: string | null;
  publishedAt: Date;
  feed: string;
  position: number | null;
  related: RawRelated[];
}

export type NormalizeResult = { ok: true; article: NormalizedArticle } | { ok: false; rejection: Rejection };

export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  url.username = '';
  url.password = '';
  if (url.hostname === 'news.google.com') {
    // The article token is in the path; the query only carries edition settings.
    url.search = '';
  } else {
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
  }
  url.pathname = url.pathname.replace(/\/amp\/?$/i, '/').replace(/\.amp(\.html)?$/i, '$1').replace(/(.)\/+$/, '$1');
  return url.toString();
}

export function domainOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function isExcludedDomain(domain: string | null): boolean {
  if (!domain) return false;
  return EXCLUDED_DOMAINS.some((excluded) => domain === excluded || domain.endsWith(`.${excluded}`));
}

/** "The New York Times" and "New York Times" are one outlet: "newyorktimes". */
export function outletKey(name: string): string {
  return name.toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
}

/** Google News titles end in " - Outlet"; drop that suffix when it names the outlet. */
export function cleanHeadline(headline: string, outlet: string | null): string {
  const trimmed = headline.replace(/\s+/g, ' ').trim();
  if (!outlet) return trimmed;
  const match = trimmed.match(/^(.*\S)\s+[-–—|]\s+([^-–—|]+)$/);
  if (match && outletKey(match[2]) === outletKey(outlet)) return match[1];
  return trimmed;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeItem(item: RawNewsItem, now: Date): NormalizeResult {
  if (!item.headline) return { ok: false, rejection: 'no_headline' };
  const link = item.url ?? item.googleUrl;
  const canonical = link ? canonicalUrl(link) : null;
  if (!link || !canonical) return { ok: false, rejection: 'no_url' };
  const outletDomain = domainOf(item.url) ?? domainOf(item.outletHomeUrl);
  const outlet = item.outlet ?? outletDomain;
  if (!outlet || !outletKey(outlet)) return { ok: false, rejection: 'no_outlet' };
  if (isExcludedDomain(outletDomain)) return { ok: false, rejection: 'excluded_domain' };
  const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return { ok: false, rejection: 'no_time' };
  if (now.getTime() - publishedAt.getTime() > MAX_AGE_HOURS * HOUR_MS) return { ok: false, rejection: 'too_old' };
  if (publishedAt.getTime() - now.getTime() > HOUR_MS) return { ok: false, rejection: 'future' };
  return {
    ok: true,
    article: {
      externalId: sha256(canonical),
      url: link,
      canonicalUrl: canonical,
      headline: cleanHeadline(item.headline, outlet),
      snippet: item.snippet,
      outlet,
      outletKey: outletKey(outlet),
      outletDomain,
      publishedAt,
      feed: item.feed,
      position: item.position,
      // Related links are kept only if they are http(s), the same check as the article's own link.
      related: item.related
        .map((entry) => ({ ...entry, url: entry.url && canonicalUrl(entry.url) ? entry.url : null }))
        .filter((entry) => entry.outlet && !isExcludedDomain(domainOf(entry.url)))
        .slice(0, 15),
    },
  };
}
