/**
 * Address → 2026 congressional district lookup via Geocodio.
 *
 * Geocodio returns district assignments, not boundary shapes, so the map keeps
 * drawing Census 119th Congress outlines. This lookup answers "which 2026
 * district is this address in?" using Geocodio's `cd120` append, which tracks
 * the maps states adopted for the 2026 elections.
 *
 * Every request is billed (geocode + district = 2 lookups), so results are
 * cached and a daily cap refuses lookups before the plan's allowance runs out.
 */

import { env } from '../config/env.js';
import { houseDistrict } from './election.service.js';

const CACHE_LIMIT = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LOOKUPS_PER_REQUEST = 2;

export interface DistrictMatch {
  state: string;
  /** Two-digit district, "00" for at-large seats, matching race data. */
  district: string;
  /** Share of the matched area in this district (1 for a rooftop match). */
  proportion: number;
}

export interface DistrictLookupResult {
  formattedAddress: string;
  accuracyType: string | null;
  location: { lat: number; lng: number };
  congress: 120;
  districts: DistrictMatch[];
}

export class DistrictLookupError extends Error {
  constructor(readonly kind: 'unresolvable' | 'unavailable', message: string) {
    super(message);
    this.name = 'DistrictLookupError';
  }
}

interface GeocodioDistrict {
  district_number?: number;
  congress_number?: string;
  ocd_id?: string;
  proportion?: number;
}

interface GeocodioResult {
  formatted_address?: string;
  accuracy_type?: string;
  location?: { lat: number; lng: number };
  address_components?: { state?: string };
  fields?: { congressional_districts?: GeocodioDistrict[] };
}

/** Normalize one Geocodio geocode result. Returns null when it carries no usable district. */
export function parseGeocodioResult(result: GeocodioResult | undefined): DistrictLookupResult | null {
  if (!result?.location) return null;

  const fallbackState = result.address_components?.state?.toUpperCase();
  const byDistrict = new Map<string, DistrictMatch>();
  for (const entry of result.fields?.congressional_districts ?? []) {
    if (entry.congress_number && entry.congress_number !== '120th') continue;
    const state = (entry.ocd_id?.match(/\/(?:state|district):([a-z]{2})/)?.[1]?.toUpperCase()) ?? fallbackState;
    if (!state || entry.district_number === undefined) continue;
    const district = houseDistrict(state, String(entry.district_number));
    if (!district) continue;
    const key = `${state}-${district}`;
    const proportion = entry.proportion ?? 1;
    const existing = byDistrict.get(key);
    byDistrict.set(key, { state, district, proportion: (existing?.proportion ?? 0) + proportion });
  }

  const districts = [...byDistrict.values()].sort((a, b) => b.proportion - a.proportion);
  if (districts.length === 0) return null;

  return {
    formattedAddress: result.formatted_address ?? '',
    accuracyType: result.accuracy_type ?? null,
    location: result.location,
    congress: 120,
    districts,
  };
}

export interface DistrictLookupOptions {
  apiKey: string | undefined;
  baseUrl: string;
  dailyLookupLimit: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class DistrictLookupService {
  private readonly cache = new Map<string, { at: number; value: DistrictLookupResult }>();
  private usageDay = '';
  private usedLookups = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: DistrictLookupOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async lookupAddress(query: string): Promise<DistrictLookupResult> {
    const key = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < CACHE_TTL_MS) return cached.value;

    if (!this.options.apiKey) {
      throw new DistrictLookupError('unavailable', 'District lookup is not configured');
    }
    this.reserveLookups();

    const url = new URL(`${this.options.baseUrl}/geocode`);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('fields', 'cd120');
    url.searchParams.set('limit', '1');
    url.searchParams.set('api_key', this.options.apiKey);

    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    } catch {
      console.warn('⚠️  Geocodio lookup failed: network error');
      throw new DistrictLookupError('unavailable', 'District lookup is unavailable');
    }

    if (response.status === 422) {
      throw new DistrictLookupError('unresolvable', 'Address could not be found');
    }
    if (!response.ok) {
      console.warn(`⚠️  Geocodio lookup failed: HTTP ${response.status}`);
      throw new DistrictLookupError('unavailable', 'District lookup is unavailable');
    }

    const body = (await response.json()) as { results?: GeocodioResult[] };
    const value = parseGeocodioResult(body.results?.[0]);
    if (!value) throw new DistrictLookupError('unresolvable', 'No congressional district found for that address');

    if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: this.now(), value });
    return value;
  }

  /** Count a request against today's (UTC) allowance, refusing it once the cap would be passed. */
  private reserveLookups(): void {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (day !== this.usageDay) {
      this.usageDay = day;
      this.usedLookups = 0;
    }
    if (this.usedLookups + LOOKUPS_PER_REQUEST > this.options.dailyLookupLimit) {
      console.warn('⚠️  Geocodio daily lookup limit reached');
      throw new DistrictLookupError('unavailable', 'Daily district lookup limit reached');
    }
    this.usedLookups += LOOKUPS_PER_REQUEST;
  }
}

export const districtLookupService = new DistrictLookupService({
  apiKey: env.GEOCODIO_API_KEY,
  baseUrl: env.GEOCODIO_API_BASE_URL,
  dailyLookupLimit: env.GEOCODIO_DAILY_LOOKUP_LIMIT,
});
