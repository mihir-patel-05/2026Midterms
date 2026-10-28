/**
 * VoteHub Polling API client and parser (https://votehub.com/polls/api/).
 *
 * The API is free, needs no key, and is licensed CC BY 4.0: every page that
 * shows these polls must credit VoteHub. It is a beta with no versioning, so
 * the parser accepts the small variations its docs and adapters show (a bare
 * list or a wrapped one, numbers sent as strings, sponsors as a string or a
 * list) and skips a record it cannot read instead of guessing at it.
 *
 * Requests, retries included, are spaced `minIntervalMs` apart; a sync makes
 * one request per poll type plus one for the list of types.
 */
import { createHash } from 'node:crypto';
import { stateNames } from '../kalshi/shared.js';

export const VOTEHUB_SOURCE = 'votehub';
/** Bump when the parser's output changes, so a sync rewrites every stored row. */
export const VOTEHUB_PARSER_VERSION = 'votehub-v1';
export const VOTEHUB_ATTRIBUTION = 'Polls via VoteHub, licensed CC BY 4.0';
export const VOTEHUB_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
export const VOTEHUB_HOMEPAGE_URL = 'https://votehub.com/polls/';
/** Used when /poll-types lists no Senate or House type: the names VoteHub's sample records use. */
export const FALLBACK_RACE_POLL_TYPES = ['us-senate', 'us-representative'] as const;

export type PollOfficeCode = 'SENATE' | 'HOUSE';
export type PollPopulationCode = 'LV' | 'RV' | 'A' | 'V' | 'UNKNOWN';

export interface ParsedAnswer {
  choice: string;
  pct: number;
  /** A party the source gave with the answer (normalized), if any. */
  party: string | null;
}

export interface ParsedPoll {
  externalId: string;
  pollType: string;
  office: PollOfficeCode;
  subject: string | null;
  pollster: string;
  sponsors: string[];
  /** YYYY-MM-DD */
  startDate: string | null;
  endDate: string;
  sampleSize: number | null;
  population: PollPopulationCode;
  isInternal: boolean;
  url: string | null;
  /** State and district when the record names them. The race matcher uses them only to break ties. */
  stateHint: string | null;
  districtHint: string | null;
  answers: ParsedAnswer[];
}

export type ParseResult = { ok: true; poll: ParsedPoll } | { ok: false; reason: string };

/** Senate or House for a VoteHub poll type, or null for one we don't ingest (approval, generic ballot, governor). */
export function classifyPollType(pollType: string): PollOfficeCode | null {
  const type = pollType.toLowerCase();
  if (/governor|gubernatorial|generic|approval|favorab|president/.test(type)) return null;
  if (/senat/.test(type)) return 'SENATE';
  if (/house|representative|congress/.test(type)) return 'HOUSE';
  return null;
}

const NAME_TO_STATE = new Map(Object.entries(stateNames).map(([code, name]) => [name.toLowerCase(), code]));

function stateCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed) && stateNames[trimmed.toUpperCase()]) return trimmed.toUpperCase();
  return NAME_TO_STATE.get(trimmed.toLowerCase()) ?? null;
}

/** State and district named in a subject such as "PA-07", "pa-sen", or "Pennsylvania Senate". */
export function raceHintFromText(text: string | null): { state: string | null; district: string | null } {
  if (!text) return { state: null, district: null };
  // A hyphen is required, so prose such as "in 5 counties" is not read as IN-05.
  const code = /\b([A-Za-z]{2})-(\d{1,2}|AL|SEN)\b/i.exec(text);
  if (code && stateNames[code[1].toUpperCase()]) {
    const tail = code[2].toUpperCase();
    return { state: code[1].toUpperCase(), district: tail === 'SEN' ? null : tail === 'AL' ? '00' : tail.padStart(2, '0') };
  }
  // Longest names first, so "West Virginia" wins over "Virginia".
  const lower = text.toLowerCase();
  const named = [...NAME_TO_STATE.entries()].sort((a, b) => b[0].length - a[0].length).find(([name]) => lower.includes(name));
  return { state: named?.[1] ?? null, district: null };
}

const PARTY_CODES: Array<[RegExp, string]> = [
  [/^(d|dem|democrat|democratic|dfl)$/i, 'DEM'],
  [/^(r|rep|republican|gop)$/i, 'REP'],
  [/^(i|ind|independent|npa|nonpartisan|no party)$/i, 'IND'],
  [/^(l|lib|libertarian)$/i, 'LIB'],
  [/^(g|grn|gre|green)$/i, 'GRN'],
];

/** "Democratic" or "D" → "DEM"; FEC codes ("DEM", "REP", "DFL", "IND") too. Unknown parties are "OTH"; blank is null. */
export function normalizeParty(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  return PARTY_CODES.find(([pattern]) => pattern.test(trimmed))?.[1] ?? 'OTH';
}

function population(value: unknown): PollPopulationCode {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return code === 'lv' ? 'LV' : code === 'rv' ? 'RV' : code === 'a' ? 'A' : code === 'v' ? 'V' : 'UNKNOWN';
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`))) return null;
  return match[1];
}

function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(/[,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sponsors(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,]/) : [];
  return list.map(text).filter((name): name is string => Boolean(name));
}

function httpUrl(value: unknown): string | null {
  const candidate = text(value);
  return candidate && /^https?:\/\//i.test(candidate) ? candidate : null;
}

/** A stable ID for a record without one, from the fields that identify a poll. */
function derivedId(record: Record<string, unknown>): string {
  const key = [record.pollster, record.poll_type, record.subject, record.start_date, record.end_date, record.population, record.sample_size]
    .map((value) => String(value ?? '')).join('|');
  return `h:${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
}

/** Read one VoteHub record. Answers outside 0–100 or without a name are dropped; a poll needs two answers. */
export function parseVoteHubPoll(raw: unknown, fallbackPollType?: string): ParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not an object' };
  const record = raw as Record<string, unknown>;
  const pollType = text(record.poll_type) ?? fallbackPollType ?? null;
  if (!pollType) return { ok: false, reason: 'no poll_type' };
  const office = classifyPollType(pollType);
  if (!office) return { ok: false, reason: `poll type ${pollType} is not a Senate or House race` };
  const pollster = text(record.pollster);
  if (!pollster) return { ok: false, reason: 'no pollster' };
  const endDate = isoDate(record.end_date);
  if (!endDate) return { ok: false, reason: 'no end_date' };
  const startDate = isoDate(record.start_date);

  const answers: ParsedAnswer[] = [];
  const seen = new Set<string>();
  for (const answer of Array.isArray(record.answers) ? record.answers : []) {
    const item = (answer ?? {}) as Record<string, unknown>;
    const choice = text(item.choice) ?? text(item.answer) ?? text(item.name);
    const pct = number(item.pct ?? item.percent ?? item.value);
    if (!choice || pct === null || pct < 0 || pct > 100) continue;
    // Answer names are unique per poll in the database; keep the first.
    if (seen.has(choice.toLowerCase())) continue;
    seen.add(choice.toLowerCase());
    answers.push({ choice, pct: Math.round(pct * 100) / 100, party: normalizeParty(item.party) });
  }
  if (answers.length < 2) return { ok: false, reason: 'fewer than two answers' };

  const sample = number(record.sample_size);
  const subject = text(record.subject);
  const fromText = raceHintFromText(subject);
  const stateHint = stateCode(record.state) ?? fromText.state;
  const districtValue = number(record.district ?? record.seat_number);
  const districtHint = office === 'HOUSE'
    ? (districtValue !== null && Number.isInteger(districtValue) && districtValue >= 0 && districtValue < 100 ? String(districtValue).padStart(2, '0') : fromText.district)
    : null;

  const id = record.id ?? record.poll_id;
  return {
    ok: true,
    poll: {
      externalId: id !== undefined && id !== null && String(id).trim() ? String(id).trim() : derivedId(record),
      pollType,
      office,
      subject,
      pollster,
      sponsors: sponsors(record.sponsors ?? record.sponsor),
      startDate: startDate && startDate <= endDate ? startDate : null,
      endDate,
      sampleSize: sample !== null && Number.isInteger(sample) && sample > 0 ? sample : null,
      population: population(record.population),
      isInternal: record.internal === true || record.internal === 'true' || record.partisan === true,
      url: httpUrl(record.url ?? record.source_url ?? record.source),
      stateHint,
      districtHint,
      answers,
    },
  };
}

/** The poll list from a /polls response: a bare list, or one wrapped in `polls` or `data`. */
export function pollList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const wrapped = body && typeof body === 'object' ? (body as Record<string, unknown>).polls ?? (body as Record<string, unknown>).data : undefined;
  if (Array.isArray(wrapped)) return wrapped;
  throw new VoteHubRequestError('VoteHub response has no list of polls');
}

/** The type names from /poll-types: a list of strings, or of objects with a name. */
export function pollTypeList(body: unknown): string[] {
  const list = Array.isArray(body) ? body : pollList(body);
  return list
    .map((item) => (typeof item === 'string' ? item : text((item as Record<string, unknown> | null)?.name) ?? text((item as Record<string, unknown> | null)?.poll_type)))
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => name.trim());
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface VoteHubClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  retries?: number;
  retryDelayMs?: number;
  /** The least time between the starts of two requests. Defaults to 1 second. */
  minIntervalMs?: number;
  clock?: Clock;
}

export class VoteHubClient {
  requestCount = 0;
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly minIntervalMs: number;
  private readonly clock: Clock;
  private nextRequestAt = 0;

  constructor(options: VoteHubClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retries = options.retries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 2000;
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.clock = options.clock ?? realClock;
  }

  pollsUrl(pollType: string): string {
    return `${this.baseUrl}/polls?${new URLSearchParams({ poll_type: pollType }).toString()}`;
  }

  async getPollTypes(): Promise<string[]> {
    return pollTypeList(await this.getJson(`${this.baseUrl}/poll-types`));
  }

  /** Every poll of one type, as raw records (parse each with `parseVoteHubPoll`). */
  async getPolls(pollType: string): Promise<unknown[]> {
    return pollList(await this.getJson(this.pollsUrl(pollType)));
  }

  private async getJson(url: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await this.clock.sleep(this.retryDelayMs * 2 ** (attempt - 1));
      await this.pace();
      this.requestCount++;
      try {
        const response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: 'application/json', 'User-Agent': 'VoteInformed-polls-sync/1.0 (+https://github.com/mihir-patel-05/2026Midterms)' },
        });
        const body = await response.text();
        if (response.ok) {
          try {
            return JSON.parse(body);
          } catch {
            throw new VoteHubRequestError(`VoteHub returned a non-JSON response for ${url} (HTTP ${response.status})`);
          }
        }
        const message = `VoteHub API ${response.status} for ${url}: ${body.slice(0, 200)}`;
        // Client errors (an unknown poll type, a moved endpoint) will not succeed on retry.
        if (response.status < 500 && response.status !== 429) throw new VoteHubRequestError(message);
        lastError = new Error(message);
      } catch (error) {
        if (error instanceof VoteHubRequestError) throw error;
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /** Wait for this request's slot. The slot is reserved before waiting, so concurrent callers queue too. */
  private async pace(): Promise<void> {
    const now = this.clock.now();
    const startAt = Math.max(now, this.nextRequestAt);
    this.nextRequestAt = startAt + this.minIntervalMs;
    if (startAt > now) await this.clock.sleep(startAt - now);
  }
}

export class VoteHubRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoteHubRequestError';
  }
}
