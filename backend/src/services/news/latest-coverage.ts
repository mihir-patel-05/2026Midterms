/**
 * "Latest coverage" for a race, a state, or the nation, from Google News RSS
 * search. Headline, outlet, link, and time only; no article text is fetched or
 * stored. This is the interim source for the News tab until Apify ingestion and
 * the top-stories agents (docs/plans/news-agents.md) replace it behind the same
 * response shape. Outlets are never filtered or ranked by ideology.
 */
import { stateNames } from '../kalshi/shared.js';

export interface NewsItem {
  headline: string;
  outlet: string | null;
  url: string;
  publishedAt: string | null;
}

export interface NewsResponse {
  /** "latest" is time-ordered search results; "top" is reserved for the AI picker. */
  mode: 'latest' | 'none';
  reason?: string;
  scope: { key: string; label: string; query: string };
  updatedAt: string;
  items: NewsItem[];
  source: { name: string; attribution: string };
}

export const NEWS_SOURCE = {
  name: 'Google News search',
  attribution: 'Headlines and links from Google News search results; each story belongs to its publisher.',
};

/** Hosts that are not news reporting: campaign sites, social and video platforms. Applied the same to every party. */
const EXCLUDED_OUTLET = /\b(youtube|facebook|instagram|tiktok|x\.com|twitter|reddit|winred|actblue)\b/i;

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/** A Kalshi-style race key: "PA-SEN", "PA-07", or "DE-00" for an at-large seat. */
export function parseRaceKey(key: string): { state: string; office: 'SENATE' | 'HOUSE'; district: string | null } | null {
  const match = /^([A-Z]{2})-(SEN|\d{2})$/.exec(key);
  if (!match || !Object.hasOwn(stateNames, match[1])) return null;
  return match[2] === 'SEN' ? { state: match[1], office: 'SENATE', district: null } : { state: match[1], office: 'HOUSE', district: match[2] };
}

const quote = (value: string) => `"${value.replace(/"/g, '')}"`;

/**
 * The search for one race. Candidate names, when the caller has them, find the
 * race's own coverage; the seat description alone catches the rest.
 */
export function raceQuery(key: string, names: string[]): { label: string; query: string } | null {
  const race = parseRaceKey(key);
  if (!race) return null;
  const stateName = stateNames[race.state];
  const seat = race.office === 'SENATE'
    ? `${quote(stateName)} Senate`
    : race.district === '00' ? `${quote(stateName)} at-large congressional` : quote(`${stateName}'s ${ordinal(Number(race.district))} congressional district`);
  const label = race.office === 'SENATE' ? `${stateName} Senate` : race.district === '00' ? `${race.state} at-large` : `${race.state}-${race.district}`;
  const people = names.slice(0, 4).map(quote);
  const query = people.length
    ? `(${[...people, seat].join(' OR ')}) ${race.office === 'SENATE' ? '(Senate OR election)' : '(Congress OR House OR election)'}`
    : `${seat} election`;
  return { label, query: `${query} when:7d` };
}

export function topQuery(state: string | null): { key: string; label: string; query: string } {
  if (state) return { key: state, label: stateNames[state], query: `${quote(stateNames[state])} (Senate OR congressional OR midterm) election when:3d` };
  return { key: 'US', label: 'United States', query: '(midterm elections OR "Senate race" OR "House race") 2026 when:2d' };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(text: string) {
  return text
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .trim();
}

const tag = (xml: string, name: string) => {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return match ? decode(match[1]) : null;
};

/** RSS items to news items, newest first, one per headline, links limited to http(s). */
export function parseRss(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (const [, body] of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const rawTitle = tag(body, 'title');
    const url = tag(body, 'link');
    if (!rawTitle || !url || !/^https?:\/\//i.test(url)) continue;
    const outlet = tag(body, 'source');
    if (outlet && EXCLUDED_OUTLET.test(outlet)) continue;
    // Google appends " - Outlet" to every title.
    const headline = outlet && rawTitle.endsWith(` - ${outlet}`) ? rawTitle.slice(0, -outlet.length - 3).trim() : rawTitle;
    const dedupeKey = headline.toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const date = tag(body, 'pubDate');
    const published = date ? new Date(date) : null;
    items.push({ headline, outlet, url, publishedAt: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null });
  }
  return items
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, limit);
}

interface CacheEntry { at: number; items: NewsItem[] }
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 600;
const cache = new Map<string, CacheEntry>();

/** One search, cached for ten minutes so map clicking never hammers the feed. */
export async function searchNews(
  baseUrl: string,
  query: string,
  limit: number,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<{ items: NewsItem[]; fetchedAt: number }> {
  const hit = cache.get(query);
  if (hit && now - hit.at < CACHE_MS) return { items: hit.items.slice(0, limit), fetchedAt: hit.at };
  const url = `${baseUrl}?${new URLSearchParams({ q: query, hl: 'en-US', gl: 'US', ceid: 'US:en' })}`;
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'VoteInformed/1.0 (+election news)' }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`News search returned HTTP ${response.status}`);
  const items = parseRss(await response.text(), 20);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(query, { at: now, items });
  return { items: items.slice(0, limit), fetchedAt: now };
}

export function clearNewsCache() {
  cache.clear();
}
