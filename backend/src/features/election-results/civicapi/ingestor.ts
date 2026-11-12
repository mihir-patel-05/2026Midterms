/**
 * The civicAPI polling loop (docs/plans/civicapi-results.md, "Tiers and cadence" and "Worker").
 *
 * Every cycle: take the `results-civicapi` lease, fetch the Senate and House aggregates, publish
 * the changed tier B races and every race's calls, then spend what is left of the cycle on
 * `/race/{id}` detail for tier A races that changed (at most once per race every
 * `detailMinIntervalSeconds`, and every `detailRefreshSeconds` regardless) and on call-time
 * lookups for newly called tier B races. Source health is written at the end of every cycle.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { acquireSyncLease, releaseSyncLease } from '../../../services/sync-lock.service.js';
import { CivicApiClient, sha256, type FetchedDocument } from './client.js';
import { civicSource, IngestMemory, ingestDocument, loadCycleContext, purgeTestData, recordIssues, type CycleContext, type IngestOutcome } from './ingest.js';
import { CIVICAPI_PARSER_VERSION, parseAggregateResults, parseDetailResults, raceSignature, type ParsedDocument, type RaceUpdate } from './parser.js';
import { chooseTierA } from './tiers.js';

export const LEASE_NAME = 'results-civicapi';
// A finals pass reads ~470 documents at 1 a second; the lease outlives the slowest pass.
const FINALS_LEASE_MS = 45 * 60 * 1000;
const FAILURES_UNTIL_UNAVAILABLE = 3;
const DETAIL_FAILURES_UNTIL_DEMOTED = 3;
const TEST_DATA_MESSAGE = 'civicAPI is serving test data. Results are held until it switches to live numbers.';

export interface IngestorOptions {
  cycle: number;
  senateAggregateId: string;
  houseAggregateId: string;
  intervalSeconds: number;
  acceptTestData: boolean;
  artifactDir: string;
  parserVersion: string;
  tierA: {
    enabled: boolean;
    max: number;
    override: string[];
    /** Kalshi prices as of this time choose tier A, so restarts agree; null takes the latest. */
    asOf?: Date | null;
    detailMinIntervalSeconds: number;
    detailRefreshSeconds: number;
    detailRps: number;
  };
  /** Writes every fetched document under `<dir>/<cycle>/race-<id>.json`, for a later `--replay`. */
  recordDir?: string;
  /** Where raw documents go; `artifactDir` on disk when absent. */
  artifactStore?: import('../artifact-store.js').ArtifactStore;
}

export interface FinalsFilter {
  /** Only these states (`WV`, `GA`); every state when absent. */
  states?: string[];
  /** Read races in states that have certified too. A pass for named states always does. */
  includeCertified?: boolean;
}

export interface FinalsReport extends CycleReport {
  /** Races read in this pass, and races skipped because their state certified. */
  races: number;
  certifiedSkipped: number;
  failures: Array<{ label: string; reason: string }>;
}

export interface CycleReport {
  status: 'skipped' | 'held' | 'failed' | 'ok';
  message: string;
  published: number;
  unchanged: number;
  rejected: number;
  calls: string[];
  details: number;
  durationMs: number;
}

interface DetailState {
  label: string;
  lastFetchedAt: number;
  aggregateSignature: string | null;
  changed: boolean;
  failures: number;
}

const unusable = (parsed: ParsedDocument) => parsed.issues.some((issue) => issue.code === 'NO_REGIONS');

export class CivicApiIngestor {
  readonly memory = new IngestMemory();
  private tierA: Map<string, DetailState> | null = null;
  private readonly callTimeQueue = new Set<string>();
  private failures = 0;
  private cycleNumber = 0;

  constructor(private readonly db: PrismaClient, private readonly client: CivicApiClient, private readonly options: IngestorOptions) {}

  /** Tier A races by civicAPI election_id, for logs and tests. */
  tierALabels(): string[] {
    return [...(this.tierA?.values() ?? [])].map((state) => state.label);
  }

  private async record(doc: FetchedDocument, id: string) {
    if (!this.options.recordDir || doc.notModified) return;
    const dir = join(this.options.recordDir, String(this.cycleNumber).padStart(4, '0'));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `race-${id}.json`), doc.bytes);
  }

  private async chooseTiers(ctx: CycleContext) {
    if (this.tierA) return;
    this.tierA = new Map();
    if (!this.options.tierA.enabled) {
      console.log('[civicapi] County detail is off (CIVICAPI_TIER_A_ENABLED=false); every race takes totals from the aggregates');
      return;
    }
    const choice = await chooseTierA(this.db, { max: this.options.tierA.max, override: this.options.tierA.override, asOf: this.options.tierA.asOf });
    const byLabel = new Map([...ctx.contests].map(([id, contest]) => [contest.label, id]));
    for (const label of choice.labels) {
      const id = byLabel.get(label);
      if (id) this.tierA.set(id, { label, lastFetchedAt: 0, aggregateSignature: null, changed: true, failures: 0 });
    }
    console.log(`[civicapi] County detail for ${this.tierA.size} races (${choice.reason}): ${this.tierALabels().join(', ') || 'none'}`);
  }

  private async health(sourceId: string, status: 'ok' | 'degraded' | 'failed' | 'held', now: Date) {
    if (status === 'failed') this.failures++;
    else this.failures = 0;
    const healthStatus = status === 'held' ? 'NOT_CONFIGURED'
      : status === 'failed' ? (this.failures >= FAILURES_UNTIL_UNAVAILABLE ? 'UNAVAILABLE' : 'DEGRADED')
        : status === 'degraded' ? 'DEGRADED' : 'CURRENT';
    await this.db.dataSource.update({
      where: { id: sourceId },
      data: {
        healthStatus,
        lastCheckedAt: now,
        ...(status === 'ok' || status === 'degraded' ? { lastSuccessfulAt: now } : {}),
        coverageDescription: status === 'held' ? TEST_DATA_MESSAGE : null,
      },
    });
  }

  private merge(total: IngestOutcome, next: IngestOutcome) {
    total.published.push(...next.published);
    total.unchanged += next.unchanged;
    total.rejected.push(...next.rejected);
    total.callsMade.push(...next.callsMade);
    total.callsRetracted.push(...next.callsRetracted);
    total.needCallTime.push(...next.needCallTime);
    total.warnings.push(...next.warnings);
  }

  /** One polling cycle. Never throws for a civicAPI problem; the report says what happened. */
  async cycle(now = new Date()): Promise<CycleReport> {
    const started = Date.now();
    this.cycleNumber++;
    const report = (status: CycleReport['status'], message: string, outcome?: IngestOutcome, details = 0): CycleReport => ({
      status, message, published: outcome?.published.length ?? 0, unchanged: outcome?.unchanged ?? 0, rejected: outcome?.rejected.length ?? 0,
      calls: [...(outcome?.callsMade ?? []), ...(outcome?.callsRetracted ?? [])], details, durationMs: Date.now() - started,
    });
    const leaseToken = await acquireSyncLease(LEASE_NAME, Math.max(3 * this.options.intervalSeconds, 60) * 1000, this.db);
    if (!leaseToken) return report('skipped', 'another ingestor holds the results-civicapi lease');
    try {
      const source = await civicSource(this.db);
      if (!source) return report('skipped', 'no civicapi data source yet; run the ballot sync first (npm run sync:ballot -- --apply)');
      const run = await this.db.ingestionRun.create({
        data: { sourceId: source.id, status: 'RUNNING', parserVersion: this.options.parserVersion, startedAt: now, metadata: { cycle: this.cycleNumber } },
        select: { id: true },
      });
      const finish = (status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'CANCELLED', counts: { fetched: number; accepted: number; rejected: number }, summary?: string, metadata?: object) =>
        this.db.ingestionRun.update({
          where: { id: run.id },
          data: { status, completedAt: new Date(), recordsFetched: counts.fetched, recordsAccepted: counts.accepted, recordsRejected: counts.rejected, errorSummary: summary ?? null, ...(metadata ? { metadata: { cycle: this.cycleNumber, ...metadata } } : {}) },
        });

      // Each chamber stands alone: on Nov 3 civicAPI failed about half of all requests, and one failed
      // aggregate threw away the other. The cycle fails only when both do.
      const aggregates = [
        { id: this.options.senateAggregateId, chamber: 'SENATE' as const, label: 'Senate' },
        { id: this.options.houseAggregateId, chamber: 'HOUSE' as const, label: 'House' },
      ];
      const settled = await Promise.allSettled(aggregates.map((aggregate) => this.client.get(`race/${aggregate.id}`)));
      const docs: Array<{ doc: FetchedDocument; parsed: ParsedDocument }> = [];
      const fetchFailures: string[] = [];
      for (const [index, result] of settled.entries()) {
        const aggregate = aggregates[index];
        if (result.status === 'rejected') {
          fetchFailures.push(`${aggregate.label} aggregate: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
          continue;
        }
        await this.record(result.value, aggregate.id);
        docs.push({ doc: result.value, parsed: result.value.notModified ? emptyDoc() : parseAggregateResults(result.value.payload, aggregate.chamber, this.options.cycle) });
      }
      if (docs.length === 0) {
        const message = fetchFailures.join('; ');
        await finish('FAILED', { fetched: 0, accepted: 0, rejected: 0 }, message);
        await this.health(source.id, 'failed', now);
        return report('failed', message);
      }
      const issues = docs.flatMap(({ parsed }) => parsed.issues);
      if (docs.some(({ parsed }) => unusable(parsed))) {
        await recordIssues(this.db, run.id, issues, null, null);
        await finish('FAILED', { fetched: docs.length, accepted: 0, rejected: docs.length }, 'An aggregate has no region_results');
        await this.health(source.id, 'failed', now);
        return report('failed', 'an aggregate has no region_results');
      }

      const testData = docs.some(({ parsed }) => parsed.testData);
      if (testData && !this.options.acceptTestData) {
        await finish('CANCELLED', { fetched: docs.length, accepted: 0, rejected: 0 }, TEST_DATA_MESSAGE, { testData: true });
        await this.health(source.id, 'held', now);
        return report('held', TEST_DATA_MESSAGE);
      }
      if (!testData && !this.memory.testDataPurged) {
        const purged = await purgeTestData(this.db, source.id);
        this.memory.testDataPurged = true;
        if (purged.snapshots + purged.calls > 0) console.log(`[civicapi] Live numbers: removed ${purged.snapshots} test-data snapshots and ${purged.calls} test calls`);
      }

      const ctx = await loadCycleContext(this.db, source.id);
      await this.chooseTiers(ctx);
      const tierA = this.tierA!;
      const total: IngestOutcome = { published: [], unchanged: 0, rejected: [], callsMade: [], callsRetracted: [], needCallTime: [], warnings: [] };
      for (const { doc, parsed } of docs) {
        if (doc.notModified) continue;
        for (const update of parsed.races) {
          const state = tierA.get(update.sourceContestId);
          if (!state) continue;
          const signature = raceSignature(update);
          if (signature !== state.aggregateSignature) state.changed = true;
          state.aggregateSignature = signature;
        }
        this.merge(total, await ingestDocument(this.db, this.memory, ctx, doc, parsed, {
          ...this.options, runId: run.id, now, snapshotRaces: (update) => !tierA.has(update.sourceContestId),
        }));
      }
      for (const id of total.needCallTime) if (!tierA.has(id)) this.callTimeQueue.add(id);

      const details = await this.detailPhase(ctx, run.id, now, total, started);
      total.warnings.push(...fetchFailures.map((failure) => `${failure}; that chamber keeps its last numbers this cycle`));
      await recordIssues(this.db, run.id, issues, total, ctx);
      const degraded = total.rejected.length > 0 || fetchFailures.length > 0;
      const summary = [...fetchFailures, ...total.rejected.slice(0, 5).map((item) => `${item.label}: ${item.reason}`)].join('; ');
      await finish(degraded ? 'PARTIAL' : 'SUCCEEDED', { fetched: docs.length + details, accepted: total.published.length, rejected: total.rejected.length }, degraded ? summary : undefined, { testData });
      await this.health(source.id, degraded ? 'degraded' : 'ok', now);
      return report('ok', `${total.published.length} published, ${total.unchanged} unchanged, ${total.rejected.length} rejected${fetchFailures.length > 0 ? ` · ${fetchFailures.join('; ')}` : ''}`, total, details);
    } finally {
      await releaseSyncLease(LEASE_NAME, leaseToken, this.db).catch(() => {});
    }
  }

  /**
   * One finals pass (#136): the detail document of every race, counties included, at most `detailRps` a second.
   * Every race takes its snapshots from detail from now on, stamped with the time its document was fetched,
   * because civicAPI's `last_updated` now changes on every request. Unchanged numbers write nothing; a race that
   * fails keeps its current snapshot and is listed. Races in a state whose certification is recorded are skipped,
   * unless the pass names states or `includeCertified` is set.
   */
  async finalsPass(filter: FinalsFilter = {}, now = new Date()): Promise<FinalsReport> {
    const started = Date.now();
    this.cycleNumber++;
    const failures: FinalsReport['failures'] = [];
    const report = (status: CycleReport['status'], message: string, outcome?: IngestOutcome, races = 0, certifiedSkipped = 0): FinalsReport => ({
      status, message, published: outcome?.published.length ?? 0, unchanged: outcome?.unchanged ?? 0, rejected: outcome?.rejected.length ?? 0,
      calls: [...(outcome?.callsMade ?? []), ...(outcome?.callsRetracted ?? [])], details: races, durationMs: Date.now() - started,
      races, certifiedSkipped, failures,
    });
    const leaseToken = await acquireSyncLease(LEASE_NAME, FINALS_LEASE_MS, this.db);
    if (!leaseToken) return report('skipped', 'another ingestor holds the results-civicapi lease');
    try {
      const source = await civicSource(this.db);
      if (!source) return report('skipped', 'no civicapi data source yet; run the ballot sync first (npm run sync:ballot -- --apply)');
      const states = filter.states?.map((state) => state.toUpperCase());
      const run = await this.db.ingestionRun.create({
        data: { sourceId: source.id, status: 'RUNNING', parserVersion: this.options.parserVersion, startedAt: now, metadata: { mode: 'finals', states: states ?? 'all' } },
        select: { id: true },
      });
      const ctx = await loadCycleContext(this.db, source.id);
      const certified = filter.includeCertified || states ? new Set<string>() : await certifiedContestIds(this.db, source.id);
      const races = [...ctx.contests]
        .filter(([, contest]) => !states || (contest.stateCode !== null && states.includes(contest.stateCode)))
        .sort((a, b) => a[1].label.localeCompare(b[1].label));
      const due = races.filter(([, contest]) => !certified.has(contest.id));
      const total: IngestOutcome = { published: [], unchanged: 0, rejected: [], callsMade: [], callsRetracted: [], needCallTime: [], warnings: [] };
      const { detailRps } = this.options.tierA;
      let fetched = 0;
      for (const [id, contest] of due) {
        if (fetched > 0) await new Promise((resolve) => setTimeout(resolve, 1000 / Math.max(detailRps, 0.1)));
        fetched++;
        try {
          const doc = await this.client.get(`race/${id}`);
          await this.record(doc, id);
          if (doc.notModified) {
            total.unchanged++;
            continue;
          }
          const race = { state: contest.stateCode!, officeType: contest.officeType, district: contest.officeType === 'SENATE' ? null : contest.label.slice(3) };
          const parsed = parseDetailResults(doc.payload, race, id);
          if (parsed.races.length === 0) {
            failures.push({ label: contest.label, reason: parsed.issues.map((issue) => issue.message).join('; ') || 'the document has no usable race' });
            await recordIssues(this.db, run.id, parsed.issues, null, null);
            continue;
          }
          if (parsed.testData && !this.options.acceptTestData) {
            failures.push({ label: contest.label, reason: 'civicAPI marked this document test data; held back' });
            continue;
          }
          this.merge(total, await ingestDocument(this.db, this.memory, ctx, doc, parsed, {
            ...this.options, runId: run.id, now: new Date(), snapshotRaces: () => true, stampWithFetchTime: true,
          }));
          await recordIssues(this.db, run.id, parsed.issues.filter((issue) => issue.severity === 'ERROR'), null, null);
        } catch (error) {
          failures.push({ label: contest.label, reason: error instanceof Error ? error.message : String(error) });
        }
      }
      failures.push(...total.rejected);
      total.warnings.push(...failures.filter((failure) => !total.rejected.includes(failure)).map((failure) => `${failure.label}: ${failure.reason}; keeps its current numbers`));
      await recordIssues(this.db, run.id, [], total, ctx);
      const degraded = failures.length > 0;
      const allFailed = fetched > 0 && failures.length >= fetched;
      await this.db.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: allFailed ? 'FAILED' : degraded ? 'PARTIAL' : 'SUCCEEDED', completedAt: new Date(), recordsFetched: fetched,
          recordsAccepted: total.published.length, recordsRejected: failures.length,
          errorSummary: degraded ? failures.slice(0, 5).map((failure) => `${failure.label}: ${failure.reason}`).join('; ') : null,
          metadata: { mode: 'finals', states: states ?? 'all', races: races.length, certifiedSkipped: races.length - due.length },
        },
      });
      await this.health(source.id, allFailed ? 'failed' : degraded ? 'degraded' : 'ok', now);
      const skipped = races.length - due.length;
      const message = `finals: ${due.length} races read, ${total.published.length} published, ${total.unchanged} unchanged, ${failures.length} failed`
        + (skipped > 0 ? `, ${skipped} skipped (state certified)` : '')
        + (failures.length > 0 ? ` · ${failures.slice(0, 5).map((failure) => `${failure.label}: ${failure.reason}`).join('; ')}` : '');
      return report(allFailed ? 'failed' : 'ok', message, total, due.length, skipped);
    } finally {
      await releaseSyncLease(LEASE_NAME, leaseToken, this.db).catch(() => {});
    }
  }

  /** Tier A detail and call-time lookups, paced at `detailRps`, within the time left in the cycle. */
  private async detailPhase(ctx: CycleContext, runId: string, now: Date, total: IngestOutcome, started: number): Promise<number> {
    const tierA = this.tierA!;
    const { detailMinIntervalSeconds, detailRefreshSeconds, detailRps } = this.options.tierA;
    const deadline = started + Math.max(this.options.intervalSeconds - 5, 5) * 1000;
    const clock = now.getTime();
    const due = [...tierA].filter(([, state]) =>
      (state.changed && clock - state.lastFetchedAt >= detailMinIntervalSeconds * 1000) || clock - state.lastFetchedAt >= detailRefreshSeconds * 1000);
    due.sort((a, b) => Number(b[1].changed) - Number(a[1].changed) || a[1].lastFetchedAt - b[1].lastFetchedAt);
    const queue: Array<{ id: string; owned: boolean }> = [
      ...due.map(([id]) => ({ id, owned: true })),
      ...[...this.callTimeQueue].map((id) => ({ id, owned: false })),
    ];
    let fetched = 0;
    for (const item of queue) {
      if (Date.now() >= deadline) break;
      const contest = ctx.contests.get(item.id);
      if (!contest) {
        this.callTimeQueue.delete(item.id);
        continue;
      }
      if (fetched > 0) await new Promise((resolve) => setTimeout(resolve, 1000 / Math.max(detailRps, 0.1)));
      fetched++;
      const state = tierA.get(item.id);
      try {
        const doc = await this.client.get(`race/${item.id}`);
        await this.record(doc, item.id);
        if (doc.notModified) continue;
        const race = { state: contest.stateCode!, officeType: contest.officeType, district: contest.officeType === 'SENATE' ? null : contest.label.slice(3) };
        const parsed = parseDetailResults(doc.payload, race, item.id);
        if (parsed.testData && !this.options.acceptTestData) continue;
        this.merge(total, await ingestDocument(this.db, this.memory, ctx, doc, parsed, {
          ...this.options, runId, now, snapshotRaces: () => item.owned && tierA.has(item.id),
        }));
        await recordIssues(this.db, runId, parsed.issues.filter((issue) => issue.severity === 'ERROR'), null, null);
        if (state) {
          state.lastFetchedAt = Date.now();
          state.changed = false;
          state.failures = 0;
        }
        this.callTimeQueue.delete(item.id);
      } catch (error) {
        total.warnings.push(`${contest.label} detail: ${error instanceof Error ? error.message : error}`);
        if (state && ++state.failures >= DETAIL_FAILURES_UNTIL_DEMOTED) {
          // Aggregate snapshots carry the cycle time, newer than any detail's, so this race publishes from the aggregate at its next change.
          tierA.delete(item.id);
          total.warnings.push(`${contest.label}: ${DETAIL_FAILURES_UNTIL_DEMOTED} detail failures in a row; totals now come from the aggregate`);
        }
        if (!state) this.callTimeQueue.delete(item.id);
      }
    }
    return fetched;
  }
}

/** Contests whose latest certification event says CERTIFIED (#136). */
export async function certifiedContestIds(db: PrismaClient, sourceId: string): Promise<Set<string>> {
  const events = await db.certificationEvent.findMany({
    where: { contest: { sourceId } },
    orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
    select: { contestId: true, certification: true },
  });
  const latest = new Map<string, string>();
  for (const event of events) if (!latest.has(event.contestId)) latest.set(event.contestId, event.certification);
  return new Set([...latest].filter(([, certification]) => certification === 'CERTIFIED').map(([contestId]) => contestId));
}

function emptyDoc(): ParsedDocument {
  return { kind: 'aggregate', testData: false, lastUpdated: null, races: [], issues: [] };
}

/**
 * A fetch that serves recorded documents: `<dir>/<step>/race-<id>.json`, one step per cycle, the
 * last step repeating. A document missing from a step answers 404.
 */
export async function replayFetch(dir: string): Promise<{ fetchImpl: typeof fetch; advance: () => void; steps: number }> {
  const { readdir } = await import('node:fs/promises');
  const steps = (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (steps.length === 0) throw new Error(`No recorded steps in ${dir}`);
  let step = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const id = /\/race\/(\d+)$/.exec(url.pathname)?.[1];
    try {
      const body = await readFile(join(dir, steps[Math.min(step, steps.length - 1)], `race-${id}.json`));
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json', etag: `"${sha256(body).slice(0, 16)}"` } });
    } catch {
      return new Response('{"error":"not recorded"}', { status: 404 });
    }
  }) as typeof fetch;
  return { fetchImpl, advance: () => { step++; }, steps: steps.length };
}

export type { RaceUpdate };
