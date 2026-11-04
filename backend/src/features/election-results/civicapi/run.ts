/**
 * Starts the civicAPI loop with the environment's settings, in the results-ingestor service or
 * (Testing only) inside api. Each cycle starts `RESULTS_POLL_INTERVAL_SECONDS` after the last one
 * started, or right away when a cycle ran long. `stop()` finishes the current cycle and returns.
 */
import type { PrismaClient } from '@prisma/client';
import { env } from '../../../config/env.js';
import { CivicApiClient } from './client.js';
import { CivicApiIngestor, type IngestorOptions } from './ingestor.js';
import { CIVICAPI_PARSER_VERSION } from './parser.js';

export function ingestorOptionsFromEnv(overrides: Partial<IngestorOptions> = {}): IngestorOptions {
  return {
    cycle: 2026,
    senateAggregateId: env.CIVICAPI_SENATE_RACE_ID,
    houseAggregateId: env.CIVICAPI_HOUSE_RACE_ID,
    intervalSeconds: env.RESULTS_POLL_INTERVAL_SECONDS,
    acceptTestData: env.CIVICAPI_ACCEPT_TEST_DATA,
    artifactDir: env.RESULTS_RAW_ARTIFACT_DIR,
    parserVersion: env.RESULTS_PARSER_VERSION === 'unconfigured' ? CIVICAPI_PARSER_VERSION : env.RESULTS_PARSER_VERSION,
    tierA: {
      enabled: env.CIVICAPI_TIER_A_ENABLED,
      max: env.CIVICAPI_TIER_A_MAX,
      override: env.CIVICAPI_TIER_A_RACES,
      asOf: env.CIVICAPI_TIER_A_AS_OF,
      detailMinIntervalSeconds: env.CIVICAPI_DETAIL_MIN_INTERVAL_SECONDS,
      detailRefreshSeconds: env.CIVICAPI_DETAIL_REFRESH_SECONDS,
      detailRps: env.CIVICAPI_DETAIL_RPS,
    },
    ...overrides,
  };
}

export function civicClientFromEnv(fetchImpl?: typeof fetch) {
  return new CivicApiClient({
    baseUrl: env.CIVICAPI_BASE_URL,
    timeoutMs: env.CIVICAPI_TIMEOUT_MS,
    maxRps: env.CIVICAPI_MAX_RPS,
    // On Nov 3 civicAPI answered many requests with a 502 within a second and the next try often worked,
    // so fast failures get up to 4 tries; none starts after 25 s, so a slow request still ends near 45 s.
    attempts: 4,
    retryWindowMs: 25_000,
    userAgent: `VoteInformed results-ingestor (+https://civicapi.org attribution${env.CIVICAPI_CONTACT ? `; ${env.CIVICAPI_CONTACT}` : ''})`,
    fetchImpl,
  });
}

export function startIngestorLoop(db: PrismaClient, options: { fetchImpl?: typeof fetch; onCycle?: () => void; maxCycles?: number; overrides?: Partial<IngestorOptions> } = {}) {
  const settings = ingestorOptionsFromEnv(options.overrides);
  const ingestor = new CivicApiIngestor(db, civicClientFromEnv(options.fetchImpl), settings);
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let wake: (() => void) | null = null;
  let cycles = 0;
  const done = (async () => {
    console.log(`[civicapi] Results ingestor started: every ${settings.intervalSeconds}s, test data ${settings.acceptTestData ? 'ACCEPTED (rehearsal)' : 'held back'}`);
    while (!stopped) {
      const started = Date.now();
      try {
        const result = await ingestor.cycle();
        const calls = result.calls.length > 0 ? ` · calls: ${result.calls.join('; ')}` : '';
        console.log(`[civicapi] ${result.status}: ${result.message}${result.details ? ` · ${result.details} detail requests` : ''} · ${result.durationMs} ms${calls}`);
      } catch (error) {
        console.error('[civicapi] Cycle failed:', error);
      }
      options.onCycle?.();
      if (options.maxCycles && ++cycles >= options.maxCycles) break;
      const wait = Math.max(settings.intervalSeconds * 1000 - (Date.now() - started), 1000);
      await new Promise<void>((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, wait);
      });
    }
  })();
  return {
    ingestor,
    done,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      wake?.();
      await done;
    },
  };
}
