/**
 * Loads VoteHub Senate and House polls into the polls database.
 *
 * Each run fetches every poll of each race poll type (VoteHub has no paging or
 * "since" filter), matches each to a race (race-match.ts), and upserts it on
 * (source, external_id). A row is rewritten only when its content hash
 * changes; otherwise only last_seen_at moves, so a re-run is cheap.
 *
 * - An admin's accept or reject (reviewed_at) is never overridden by a sync.
 * - A poll that disappears from VoteHub (retracted, or found to be fake) is
 *   rejected with review_reason "removed_from_source", but only when its type
 *   came back with at least half the polls seen before, so a truncated
 *   response can't hide everything. It is restored if it comes back.
 * - One failing poll type is recorded and the run moves on (PARTIAL).
 */
import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient as PollsPrismaClient } from '@prisma-polls/client';
import { indexCandidates, matchRace, type RaceCandidate, type RaceMatch } from './race-match.js';
import {
  classifyPollType,
  FALLBACK_RACE_POLL_TYPES,
  parseVoteHubPoll,
  VOTEHUB_PARSER_VERSION,
  VOTEHUB_SOURCE,
  type ParsedPoll,
  type VoteHubClient,
} from './votehub-client.js';

/** Polls that ended before this are from an earlier cycle. */
export const CYCLE_START = '2025-01-01';
const FUTURE_SLACK_MS = 2 * 24 * 60 * 60 * 1000;
const SKIP_EXAMPLES = 20;
export const REMOVED_FROM_SOURCE = 'removed_from_source';

export interface PollTypeStats {
  pollType: string;
  url: string;
  fetched: number;
  error?: string;
}

export interface PollSyncStats {
  runId: string;
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  pollTypes: PollTypeStats[];
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  needsReview: number;
  skipped: number;
  removed: number;
  requests: number;
}

export interface PollSyncOptions {
  /** Tests use their own source so they never touch real rows. */
  source?: string;
  now?: Date;
  log?: (message: string) => void;
}

type Existing = { id: string; contentHash: string; reviewedAt: Date | null; status: string; raceCode: string | null };

function hashOf(poll: ParsedPoll, match: RaceMatch): string {
  return createHash('sha256').update(JSON.stringify({ v: VOTEHUB_PARSER_VERSION, poll, match })).digest('hex');
}

function day(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** The race poll types to fetch: from /poll-types, or the known names if it fails or lists none. */
async function racePollTypes(client: VoteHubClient, log: (message: string) => void): Promise<{ types: string[]; error?: string }> {
  try {
    const listed = await client.getPollTypes();
    const types = listed.filter((type) => classifyPollType(type) !== null);
    if (types.length > 0) return { types };
    log(`  /poll-types listed no Senate or House type (${listed.join(', ') || 'none'}); trying ${FALLBACK_RACE_POLL_TYPES.join(', ')}`);
    return { types: [...FALLBACK_RACE_POLL_TYPES], error: `no race types in /poll-types: ${listed.join(', ')}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`  /poll-types failed (${message}); trying ${FALLBACK_RACE_POLL_TYPES.join(', ')}`);
    return { types: [...FALLBACK_RACE_POLL_TYPES], error: message };
  }
}

export async function syncPolls(
  db: PollsPrismaClient,
  client: VoteHubClient,
  candidates: RaceCandidate[],
  options: PollSyncOptions = {},
): Promise<PollSyncStats> {
  const { source = VOTEHUB_SOURCE, now = new Date(), log = console.log } = options;
  const run = await db.pollSyncRun.create({ data: { source, status: 'RUNNING', parserVersion: VOTEHUB_PARSER_VERSION, startedAt: now } });
  const races = indexCandidates(candidates);
  const latestEnd = new Date(now.getTime() + FUTURE_SLACK_MS).toISOString().slice(0, 10);

  const { types, error: typesError } = await racePollTypes(client, log);
  const typeStats: PollTypeStats[] = [];
  const parsed = new Map<string, ParsedPoll>();
  const rawRecords = new Map<string, unknown>();
  const skipped: string[] = [];
  let skippedCount = 0;
  const skip = (reason: string) => {
    skippedCount++;
    if (skipped.length < SKIP_EXAMPLES) skipped.push(reason);
  };

  for (const pollType of types) {
    const stats: PollTypeStats = { pollType, url: client.pollsUrl(pollType), fetched: 0 };
    try {
      const records = await client.getPolls(pollType);
      stats.fetched = records.length;
      for (const record of records) {
        const result = parseVoteHubPoll(record, pollType);
        if (!result.ok) skip(result.reason);
        else if (result.poll.endDate < CYCLE_START) skip(`ended ${result.poll.endDate}, before the 2026 cycle`);
        else if (result.poll.endDate > latestEnd) skip(`ends in the future (${result.poll.endDate})`);
        else {
          parsed.set(result.poll.externalId, result.poll);
          rawRecords.set(result.poll.externalId, record);
        }
      }
      log(`  ${pollType}: ${records.length} fetched`);
    } catch (error) {
      stats.error = error instanceof Error ? error.message : String(error);
      log(`  ${pollType}: failed, ${stats.error}`);
    }
    typeStats.push(stats);
  }

  const polls = [...parsed.values()];
  const existingRows = polls.length === 0 ? [] : await db.poll.findMany({
    where: { source, externalId: { in: polls.map((poll) => poll.externalId) } },
    select: { id: true, externalId: true, contentHash: true, reviewedAt: true, status: true, raceCode: true },
  });
  const existing = new Map<string, Existing>(existingRows.map((row) => [row.externalId, row]));

  let inserted = 0;
  let updated = 0;
  let needsReview = 0;
  const unchangedIds: string[] = [];
  for (const poll of polls) {
    const match = matchRace(poll, races);
    const contentHash = hashOf(poll, match);
    const row = existing.get(poll.externalId);
    // A removed poll that comes back is rewritten even though its content is the same.
    if (row && row.contentHash === contentHash && !(row.status === 'REJECTED' && !row.reviewedAt)) {
      unchangedIds.push(row.id);
      continue;
    }
    // An admin's decision stands: keep their race and status, and link answers only if the matcher agrees on the race.
    const reviewed = row?.reviewedAt ? row : null;
    const sameRace = !reviewed || reviewed.raceCode === match.raceCode;
    const decision = reviewed
      ? {}
      : { raceCode: match.raceCode, office: match.office, state: match.state, district: match.district, status: match.status, reviewReason: match.reviewReason };
    const fields = {
      pollType: poll.pollType,
      subject: poll.subject,
      pollster: poll.pollster,
      sponsors: poll.sponsors,
      startDate: poll.startDate ? day(poll.startDate) : null,
      endDate: day(poll.endDate),
      sampleSize: poll.sampleSize,
      population: poll.population,
      isInternal: poll.isInternal,
      url: poll.url,
      raw: (rawRecords.get(poll.externalId) ?? {}) as Prisma.InputJsonValue,
      contentHash,
      lastSeenAt: now,
      lastSyncRunId: run.id,
    };
    const answers = match.answers.map((answer, index) => ({
      choice: answer.choice,
      pct: new Prisma.Decimal(answer.pct),
      party: sameRace ? answer.party : poll.answers[index].party,
      candidateFecId: sameRace ? answer.candidateFecId : null,
      sortOrder: index,
    }));
    if (!reviewed && match.status === 'NEEDS_REVIEW' && row?.status !== 'NEEDS_REVIEW') needsReview++;

    if (row) {
      await db.$transaction([
        db.pollAnswer.deleteMany({ where: { pollId: row.id } }),
        db.poll.update({ where: { id: row.id }, data: { ...fields, ...decision, answers: { create: answers } } }),
      ]);
      updated++;
    } else {
      await db.poll.create({
        data: {
          source,
          externalId: poll.externalId,
          ...fields,
          raceCode: match.raceCode,
          office: match.office,
          state: match.state,
          district: match.district,
          status: match.status,
          reviewReason: match.reviewReason,
          firstSeenAt: now,
          answers: { create: answers },
        },
      });
      inserted++;
    }
  }
  if (unchangedIds.length > 0) await db.poll.updateMany({ where: { id: { in: unchangedIds } }, data: { lastSeenAt: now, lastSyncRunId: run.id } });

  const removed = await rejectRemoved(db, source, typeStats, parsed, now, log);
  const failedTypes = typeStats.filter((stats) => stats.error);
  const status: PollSyncStats['status'] = failedTypes.length === typeStats.length ? 'FAILED' : failedTypes.length > 0 ? 'PARTIAL' : 'SUCCEEDED';
  const errors = [typesError && `poll-types: ${typesError}`, ...failedTypes.map((stats) => `${stats.pollType}: ${stats.error}`)].filter(Boolean);
  await db.pollSyncRun.update({
    where: { id: run.id },
    data: {
      status,
      completedAt: new Date(),
      requestCount: client.requestCount,
      fetched: typeStats.reduce((total, stats) => total + stats.fetched, 0),
      inserted,
      updated,
      unchanged: unchangedIds.length,
      needsReview,
      skipped: skippedCount,
      errorSummary: errors.length ? errors.join('; ').slice(0, 2000) : null,
      metadata: { pollTypes: typeStats, skippedExamples: skipped, removed } as unknown as Prisma.InputJsonValue,
    },
  });
  return {
    runId: run.id,
    status,
    pollTypes: typeStats,
    fetched: typeStats.reduce((total, stats) => total + stats.fetched, 0),
    inserted,
    updated,
    unchanged: unchangedIds.length,
    needsReview,
    skipped: skippedCount,
    removed,
    requests: client.requestCount,
  };
}

/** Reject unreviewed polls of a fully fetched type that this run no longer saw. */
async function rejectRemoved(
  db: PollsPrismaClient,
  source: string,
  typeStats: PollTypeStats[],
  seen: Map<string, ParsedPoll>,
  now: Date,
  log: (message: string) => void,
): Promise<number> {
  let removed = 0;
  for (const stats of typeStats) {
    if (stats.error) continue;
    const where = { source, pollType: stats.pollType, reviewedAt: null, lastSeenAt: { lt: now }, status: { not: 'REJECTED' as const } };
    const missing = await db.poll.count({ where });
    if (missing === 0) continue;
    const before = await db.poll.count({ where: { source, pollType: stats.pollType, status: { not: 'REJECTED' } } });
    const seenNow = [...seen.values()].filter((poll) => poll.pollType === stats.pollType).length;
    if (seenNow < before / 2) {
      log(`  ${stats.pollType}: ${missing} stored polls missing, but only ${seenNow} of ${before} came back; keeping them`);
      continue;
    }
    removed += (await db.poll.updateMany({ where, data: { status: 'REJECTED', reviewReason: REMOVED_FROM_SOURCE } })).count;
  }
  if (removed > 0) log(`  ${removed} polls no longer on VoteHub were hidden`);
  return removed;
}
