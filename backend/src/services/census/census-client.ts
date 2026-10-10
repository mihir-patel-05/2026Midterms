/**
 * Census Data API client for ACS 5-year detailed tables.
 *
 * The API answers with a JSON array of rows whose first row is the header. A
 * request may name at most 50 variables, so the variable list is split into
 * chunks and the chunks are joined back together by geography.
 *
 * The API key is a query parameter, so request URLs are never logged or stored;
 * `redactedUrl` gives the same URL without it.
 */

export type AcsGeoType = 'NATION' | 'STATE' | 'COUNTY' | 'CONGRESSIONAL_DISTRICT' | 'COUNTY_DISTRICT_PART';

export interface AcsGeographyQuery {
  geoType: AcsGeoType;
  for: string;
  in?: string;
}

export interface AcsAreaRow {
  geoType: AcsGeoType;
  /** Census GEOID: "1" (US), "48" (state), "48201" (county), "4807" (district), "4807201" (county part in district). */
  geoid: string;
  name: string;
  stateFips: string | null;
  stateCode: string | null;
  countyFips: string | null;
  /** Two-digit district as the rest of the app uses it: "00" for at-large seats and delegates. */
  districtCode: string | null;
  estimates: Record<string, number | null>;
  moes: Record<string, number | null>;
}

export const STATE_FIPS_TO_POSTAL: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR',
};

/** Census geography columns, as they appear in the response header. */
const STATE_COL = 'state';
const COUNTY_COL = 'county';
const DISTRICT_COL = 'congressional district';
const COUNTY_PART_COL = 'county (or part)';
const GEO_COLUMNS = ['us', STATE_COL, COUNTY_COL, DISTRICT_COL, COUNTY_PART_COL];

/** "The estimate is controlled": the value is exact, so its margin of error is zero. */
const MOE_CONTROLLED = -555555555;

/**
 * ACS estimates use large negative sentinels (-666666666, -999999999, ...) for
 * values that could not be computed or are not available. They become null,
 * never 0, so missing data stays visibly missing.
 */
export function acsEstimate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function acsMoe(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (value === MOE_CONTROLLED) return 0;
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Census uses "98" for DC's and Puerto Rico's delegate seat; the app uses "00" like at-large seats. */
export function normalizeDistrict(cd: string): string | null {
  if (!/^\d{2}$/.test(cd)) return null;
  return cd === '98' ? '00' : cd;
}

/** Parse one Census API response into rows keyed by geography. */
export function parseAcsTable(body: unknown): Array<Record<string, string | null>> {
  if (!Array.isArray(body) || body.length === 0 || !Array.isArray(body[0])) {
    throw new Error('Census API returned an unexpected payload');
  }
  const [header, ...rows] = body as Array<Array<string | null>>;
  return rows.map((row) => Object.fromEntries(header.map((column, i) => [column, row[i] ?? null])));
}

/** Combine the parsed chunks for one geography query into area rows. */
export function toAreaRows(
  geoType: AcsGeoType,
  tables: Array<Array<Record<string, string | null>>>,
  variables: string[],
): AcsAreaRow[] {
  const byGeo = new Map<string, Record<string, string | null>>();
  for (const table of tables) {
    for (const row of table) {
      const key = GEO_COLUMNS.map((column) => row[column] ?? '').join('|');
      byGeo.set(key, { ...byGeo.get(key), ...row });
    }
  }

  const areas: AcsAreaRow[] = [];
  for (const row of byGeo.values()) {
    const stateFips = row[STATE_COL] ?? null;
    const cd = row[DISTRICT_COL] ?? null;
    const county = row[COUNTY_COL] ?? row[COUNTY_PART_COL] ?? null;
    const countyFips = stateFips && county ? `${stateFips}${county}` : null;
    const districtCode = cd ? normalizeDistrict(cd) : null;

    let geoid: string;
    switch (geoType) {
      case 'NATION': geoid = '1'; break;
      case 'STATE': geoid = stateFips ?? ''; break;
      case 'COUNTY': geoid = countyFips ?? ''; break;
      case 'CONGRESSIONAL_DISTRICT': geoid = stateFips && cd ? `${stateFips}${cd}` : ''; break;
      case 'COUNTY_DISTRICT_PART': geoid = stateFips && cd && county ? `${stateFips}${cd}${county}` : ''; break;
    }
    // "ZZ" districts are water or undefined areas; skip anything without a usable code.
    if (!geoid) continue;
    if ((geoType === 'CONGRESSIONAL_DISTRICT' || geoType === 'COUNTY_DISTRICT_PART') && !districtCode) continue;

    const estimates: Record<string, number | null> = {};
    const moes: Record<string, number | null> = {};
    for (const variable of variables) {
      if (!(`${variable}E` in row)) throw new Error(`Census response is missing ${variable}E for ${geoid}`);
      estimates[variable] = acsEstimate(row[`${variable}E`]);
      moes[variable] = acsMoe(row[`${variable}M`]);
    }

    areas.push({
      geoType,
      geoid,
      name: row.NAME ?? geoid,
      stateFips,
      stateCode: stateFips ? STATE_FIPS_TO_POSTAL[stateFips] ?? null : null,
      countyFips: geoType === 'COUNTY' || geoType === 'COUNTY_DISTRICT_PART' ? countyFips : null,
      districtCode: geoType === 'CONGRESSIONAL_DISTRICT' || geoType === 'COUNTY_DISTRICT_PART' ? districtCode : null,
      estimates,
      moes,
    });
  }
  return areas.sort((a, b) => a.geoid.localeCompare(b.geoid));
}

export interface CensusClientOptions {
  apiKey?: string;
  baseUrl: string;
  year: number;
  fetchImpl?: typeof fetch;
  /** Census allows 50 variables per request, NAME included. */
  maxVariablesPerRequest?: number;
  retries?: number;
  retryDelayMs?: number;
}

export class CensusClient {
  readonly datasetUrl: string;
  requestCount = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly chunkSize: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(private readonly options: CensusClientOptions) {
    this.datasetUrl = `${options.baseUrl.replace(/\/$/, '')}/${options.year}/acs/acs5`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.chunkSize = (options.maxVariablesPerRequest ?? 50) - 1;
    this.retries = options.retries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 2000;
  }

  /** The request URL without the API key, safe to log or store. */
  redactedUrl(query: AcsGeographyQuery, columns: string[]): string {
    const params = [`get=${columns.map(encodeURIComponent).join(',')}`, `for=${encodeURIComponent(query.for)}`];
    if (query.in) params.push(`in=${encodeURIComponent(query.in)}`);
    return `${this.datasetUrl}?${params.join('&')}`;
  }

  /** Fetch every variable (estimate and margin of error) for one geography query. */
  async fetchAreas(query: AcsGeographyQuery, variables: string[]): Promise<AcsAreaRow[]> {
    const columns = variables.flatMap((variable) => [`${variable}E`, `${variable}M`]);
    const tables: Array<Array<Record<string, string | null>>> = [];
    for (let i = 0; i < columns.length; i += this.chunkSize) {
      tables.push(await this.request(query, ['NAME', ...columns.slice(i, i + this.chunkSize)]));
    }
    return toAreaRows(query.geoType, tables, variables);
  }

  private async request(query: AcsGeographyQuery, columns: string[]) {
    const safeUrl = this.redactedUrl(query, columns);
    const url = this.options.apiKey ? `${safeUrl}&key=${encodeURIComponent(this.options.apiKey)}` : safeUrl;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)));
      this.requestCount++;
      try {
        const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
        // 204: the geography exists but has no rows (for example, no counties in a query).
        if (response.status === 204) return [];
        const text = await response.text();
        if (response.ok) {
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            // An invalid key gets an HTML page with a 200 status rather than an error code.
            throw new CensusRequestError(`Census API returned a non-JSON page for ${query.geoType}; check CENSUS_API_KEY`);
          }
          return parseAcsTable(body);
        }
        const message = `Census API ${response.status} for ${query.geoType} (${query.for}${query.in ? ` in ${query.in}` : ''}): ${text.slice(0, 200)}`;
        // Client errors (bad variable, bad geography, bad key) will not succeed on retry.
        if (response.status < 500 && response.status !== 429) throw new CensusRequestError(message);
        lastError = new Error(message);
      } catch (error) {
        if (error instanceof CensusRequestError) throw error;
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

export class CensusRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CensusRequestError';
  }
}
