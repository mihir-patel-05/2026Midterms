/**
 * EIA Open Data API v2, through its series-id route (`/v2/seriesid/PET.<id>.W`), which returns one
 * weekly series as `response.data[]` rows of `{ period: 'YYYY-MM-DD', value }`. Free key (EIA_API_KEY),
 * public-domain data. Parsing is tolerant: a value that is not a number is skipped, never read as zero.
 */

export interface EiaPoint {
  /** Week date, YYYY-MM-DD (EIA's Monday price date). */
  date: string;
  value: number;
}

export type EiaFetch = (url: string) => Promise<unknown>;

export class EiaError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSeries(body: unknown): EiaPoint[] {
  const response = (body as { response?: { data?: unknown } } | null)?.response;
  if (!response || !Array.isArray(response.data)) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new EiaError(`EIA returned no data${message ? `: ${String(message).slice(0, 200)}` : ''}`);
  }
  const points = new Map<string, number>();
  for (const row of response.data as Array<Record<string, unknown>>) {
    const date = typeof row?.period === 'string' ? row.period.slice(0, 10) : '';
    const value = typeof row?.value === 'number' ? row.value : typeof row?.value === 'string' && row.value.trim() !== '' ? Number(row.value) : NaN;
    if (!DATE.test(date) || !Number.isFinite(value) || value <= 0) continue;
    points.set(date, value);
  }
  return [...points].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

export class EiaClient {
  constructor(
    private readonly options: { apiKey: string; baseUrl?: string; timeoutMs?: number; fetchJson?: EiaFetch },
  ) {}

  /** The request URL without the key, for logs and run metadata. */
  publicUrl(eiaId: string) {
    return `${(this.options.baseUrl ?? 'https://api.eia.gov/v2').replace(/\/+$/, '')}/seriesid/PET.${eiaId}.W`;
  }

  async weekly(eiaId: string): Promise<EiaPoint[]> {
    const url = `${this.publicUrl(eiaId)}?api_key=${encodeURIComponent(this.options.apiKey)}`;
    const body = this.options.fetchJson
      ? await this.options.fetchJson(url)
      : await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000), headers: { Accept: 'application/json' } }).then(async (response) => {
        if (!response.ok) throw new EiaError(`EIA ${eiaId} returned ${response.status}`);
        return response.json();
      });
    return parseSeries(body);
  }
}
