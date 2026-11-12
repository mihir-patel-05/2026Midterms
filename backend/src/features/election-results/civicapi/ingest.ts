/**
 * Storing and publishing civicAPI results (docs/plans/civicapi-results.md, "Store and publish").
 *
 * For each race whose numbers changed: a `ResultSnapshot` with one `CandidateVote` per candidacy and
 * unit and one `ContestMetric` per unit, published with `publishSnapshot()` in the same Serializable
 * transaction. An unchanged race writes nothing. One bad race is logged as an `IngestionError` and
 * keeps its current snapshot; the others still publish.
 *
 * Race calls come from civicAPI's own decision desk (its `winner` and `advanced` flags) and go to
 * `race_calls`, append-only: a call that disappears is retracted, never deleted.
 *
 * Contests and candidacies come from the ballot sync (services/ballot), which uses the same
 * civicAPI ids. A candidate who first appears mid-count gets an UNCONFIRMED candidacy.
 */
import { gzipSync } from 'node:zlib';
import { Prisma, type PrismaClient } from '@prisma/client';
import { STATE_FIPS_TO_POSTAL } from '../../../services/census/census-client.js';
import { CIVICAPI_SOURCE_KEY } from '../../../services/ballot/ballot-sync.js';
import { nameParts } from '../../../utils/person-name.js';
import { publishSnapshot } from '../publication.js';
import type { ResultsParseIssue } from '../parser.js';
import { diskArtifactStore, type ArtifactStore } from '../artifact-store.js';
import { sha256, type FetchedDocument } from './client.js';
import { calledCandidates, raceSignature, totalVotes, type CandidateTally, type ParsedDocument, type RaceUpdate } from './parser.js';

export const COUNTY_GEOGRAPHY_VERSION = 'counties-fips';
const COUNTY_GEOGRAPHY_SOURCE = 'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html';
// A call must be missing from this many documents in a row before it is retracted, so one odd poll never shows as a retraction.
const RETRACT_AFTER_MISSES = 2;

export interface IngestOptions {
  /** Keep civicAPI's rehearsal numbers (`test_data: true`). Testing only; never in production. */
  acceptTestData: boolean;
  /** Where gzipped payloads go on disk, when no `artifactStore` is given. */
  artifactDir: string;
  /** Where gzipped payloads go (the bucket, when configured); `artifactDir` on disk otherwise. */
  artifactStore?: ArtifactStore;
  parserVersion: string;
  /**
   * Stamp every snapshot with the time its document was fetched, as aggregates already are. Finals passes set it:
   * after election night civicAPI's `last_updated` changes on every request, so it says nothing about the count.
   */
  stampWithFetchTime?: boolean;
}

interface ContestState {
  id: string;
  label: string;
  officeType: 'SENATE' | 'HOUSE';
  stateCode: string | null;
  candidacies: Map<string, string>;
  currentSignature: string | null;
  currentSnapshotIsTest: boolean;
  /** The current snapshot's "as of" time: a detail document's `last_updated`, or the cycle time for an aggregate. */
  currentSourceUpdatedAt: Date | null;
  /** civicAPI's own `last_updated` on the document behind the current snapshot. */
  currentDocumentTime: Date | null;
  /** The document kind the current snapshot came from (each race takes snapshots from one kind; see the tiers). */
  currentKind: ParsedDocument['kind'] | null;
  activeCalls: Array<{ id: string; candidacyId: string; kind: 'WINNER' | 'ADVANCED'; calledAtSource: boolean; isTestData: boolean }>;
}

export interface CycleContext {
  sourceId: string;
  /** By civicAPI election_id. */
  contests: Map<string, ContestState>;
}

export interface IngestOutcome {
  published: string[];
  unchanged: number;
  rejected: Array<{ label: string; reason: string }>;
  callsMade: string[];
  callsRetracted: string[];
  /** Races whose new call has no civicAPI call time yet; a detail fetch can supply it. */
  needCallTime: string[];
  warnings: string[];
}

/**
 * State the ingestor keeps between cycles: reporting unit ids, county geography ids, and how many
 * documents in a row each active call has been missing from.
 */
export class IngestMemory {
  readonly units = new Map<string, string>();
  readonly counties = new Map<string, string>();
  countyVersionId: string | null = null;
  readonly callMisses = new Map<string, number>();
  testDataPurged = false;
}

const SIGNATURE_PREFIX = 'sig:';
const signatureId = (update: RaceUpdate) => `${SIGNATURE_PREFIX}${sha256(raceSignature(update)).slice(0, 32)}`;

/** The civicAPI source row; the ballot sync creates it. */
export async function civicSource(db: PrismaClient) {
  return db.dataSource.findUnique({ where: { key: CIVICAPI_SOURCE_KEY } });
}

/** Everything one cycle needs about civicAPI's contests, in three queries. */
export async function loadCycleContext(db: PrismaClient, sourceId: string): Promise<CycleContext> {
  const rows = await db.contest.findMany({
    where: { sourceId, sourceContestId: { not: null } },
    select: {
      id: true, sourceContestId: true, office: true, stateCode: true, districtCode: true,
      candidacies: { where: { sourceId }, select: { id: true, sourceCandidateId: true } },
      currentSnapshot: { select: { sourceSnapshotId: true, sourceUpdatedAt: true, isTestData: true, rawArtifact: { select: { metadata: true, sourceUpdatedAt: true } } } },
      raceCalls: { where: { retractedAt: null }, select: { id: true, candidacyId: true, kind: true, calledAtSource: true, isTestData: true } },
    },
  });
  const contests = new Map<string, ContestState>();
  for (const row of rows) {
    const officeType = row.office === 'US_SENATE' ? 'SENATE' : 'HOUSE';
    contests.set(row.sourceContestId!, {
      id: row.id,
      label: officeType === 'SENATE' ? `${row.stateCode}-SEN` : `${row.stateCode}-${row.districtCode}`,
      officeType,
      stateCode: row.stateCode,
      candidacies: new Map(row.candidacies.flatMap((candidacy) => (candidacy.sourceCandidateId ? [[candidacy.sourceCandidateId, candidacy.id] as const] : []))),
      currentSignature: row.currentSnapshot?.sourceSnapshotId ?? null,
      currentSnapshotIsTest: row.currentSnapshot?.isTestData ?? false,
      currentSourceUpdatedAt: row.currentSnapshot?.sourceUpdatedAt ?? null,
      currentDocumentTime: row.currentSnapshot?.rawArtifact?.sourceUpdatedAt ?? row.currentSnapshot?.sourceUpdatedAt ?? null,
      currentKind: documentKind(row.currentSnapshot?.rawArtifact?.metadata),
      activeCalls: row.raceCalls,
    });
  }
  return { sourceId, contests };
}

/** `aggregate` or `detail`, from the metadata `recordArtifact` writes. */
function documentKind(metadata: Prisma.JsonValue | undefined): ParsedDocument['kind'] | null {
  const kind = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata.kind : null;
  return kind === 'aggregate' || kind === 'detail' ? kind : null;
}

/** True when a race's numbers differ from its current snapshot (or the snapshot is rehearsal data and this is not). */
export function hasChanged(update: RaceUpdate, contest: ContestState, testData: boolean) {
  return contest.currentSignature !== signatureId(update) || contest.currentSnapshotIsTest !== testData;
}

/** The gzipped payload, in the bucket or on disk. A failed write is logged; the database rows still record its hash. */
async function storePayload(options: IngestOptions, doc: FetchedDocument): Promise<{ storageKey: string; stored: boolean }> {
  const name = `sha256/${doc.sha256}.json.gz`;
  const store = options.artifactStore ?? diskArtifactStore(options.artifactDir);
  try {
    return { storageKey: await store.put(name, gzipSync(doc.bytes)), stored: true };
  } catch (error) {
    console.warn(`[civicapi] Could not store payload ${doc.sha256} (${store.describe}): ${error instanceof Error ? error.message : error}`);
    return { storageKey: `unstored:${name}`, stored: false };
  }
}

/** One `RawArtifact` per document that changed something, deduplicated on its hash. */
export async function recordArtifact(db: PrismaClient, sourceId: string, runId: string, doc: FetchedDocument, parsed: ParsedDocument, options: IngestOptions) {
  const existing = await db.rawArtifact.findUnique({ where: { sourceId_contentSha256: { sourceId, contentSha256: doc.sha256! } }, select: { id: true } });
  if (existing) return existing.id;
  const { storageKey, stored } = await storePayload(options, doc);
  const artifact = await db.rawArtifact.create({
    data: {
      sourceId, ingestionRunId: runId, status: 'VALIDATED', storageKey, contentSha256: doc.sha256!,
      contentType: doc.contentType ?? 'application/json', payloadByteSize: BigInt(doc.bytes.byteLength), sourceUrl: doc.sourceUrl,
      sourceUpdatedAt: parsed.lastUpdated ? new Date(parsed.lastUpdated) : null, fetchedAt: new Date(doc.fetchedAt),
      httpStatus: doc.httpStatus, etag: doc.etag ?? null, lastModified: doc.lastModified ?? null, isMock: false,
      metadata: { kind: parsed.kind, testData: parsed.testData, stored, races: parsed.races.length },
    },
    select: { id: true },
  });
  return artifact.id;
}

async function countyGeography(tx: Prisma.TransactionClient, memory: IngestMemory, fips: string, name: string): Promise<string | null> {
  const cached = memory.counties.get(fips);
  if (cached) return cached;
  if (!memory.countyVersionId) {
    const version = await tx.geographyVersion.upsert({
      where: { name: COUNTY_GEOGRAPHY_VERSION },
      // The list grows as counties report; the hash names the version, not its contents.
      create: { name: COUNTY_GEOGRAPHY_VERSION, vintage: '2020', sourceUrl: COUNTY_GEOGRAPHY_SOURCE, sha256: sha256(COUNTY_GEOGRAPHY_VERSION) },
      update: {},
      select: { id: true },
    });
    memory.countyVersionId = version.id;
  }
  const unit = await tx.geographyUnit.upsert({
    where: { versionId_type_geoid: { versionId: memory.countyVersionId, type: 'COUNTY', geoid: fips } },
    create: { versionId: memory.countyVersionId, type: 'COUNTY', geoid: fips, name, countyFips: fips, stateCode: STATE_FIPS_TO_POSTAL[fips.slice(0, 2)] ?? null },
    update: {},
    select: { id: true },
  });
  memory.counties.set(fips, unit.id);
  return unit.id;
}

async function reportingUnit(
  tx: Prisma.TransactionClient,
  memory: IngestMemory,
  sourceId: string,
  unit: { sourceUnitId: string; name: string; type: 'STATE' | 'DISTRICT' | 'COUNTY'; parentId: string | null; geographyUnitId: string | null },
): Promise<string> {
  const cached = memory.units.get(unit.sourceUnitId);
  if (cached) return cached;
  const row = await tx.reportingUnit.upsert({
    where: { sourceId_sourceUnitId: { sourceId, sourceUnitId: unit.sourceUnitId } },
    create: { sourceId, ...unit },
    update: {},
    select: { id: true },
  });
  memory.units.set(unit.sourceUnitId, row.id);
  return row.id;
}

/** The candidacy for a tally; a candidate civicAPI adds mid-count gets an UNCONFIRMED one. */
async function candidacyFor(tx: Prisma.TransactionClient, sourceId: string, contest: ContestState, candidate: CandidateTally, warnings: string[]): Promise<string> {
  const known = contest.candidacies.get(candidate.sourceCandidateId);
  if (known) return known;
  const parts = nameParts(candidate.name);
  const person = await tx.person.create({
    data: { displayName: candidate.name, normalizedName: candidate.name.toLowerCase(), firstName: parts?.first ?? null, lastName: parts?.last ?? null },
    select: { id: true },
  });
  const party = candidate.party
    ? await tx.party.upsert({
      where: { name_sourceCode: { name: candidate.party, sourceCode: CIVICAPI_SOURCE_KEY } },
      create: { name: candidate.party, abbreviation: candidate.partyCode, sourceCode: CIVICAPI_SOURCE_KEY },
      update: {},
      select: { id: true },
    })
    : null;
  const created = await tx.candidacy.create({
    data: {
      personId: person.id, contestId: contest.id, sourceId, sourceCandidateId: candidate.sourceCandidateId, partyId: party?.id ?? null,
      ballotName: candidate.name, ballotStatus: candidate.writeIn ? 'WRITE_IN' : 'UNCONFIRMED', isIncumbent: candidate.isIncumbent,
    },
    select: { id: true },
  });
  warnings.push(`${contest.label}: new candidate ${candidate.name} (${candidate.party ?? 'no party'}) added as unconfirmed`);
  return created.id;
}

const reportingStatus = (votes: number, percentReporting: number | null) =>
  percentReporting === 100 ? 'COMPLETE' as const
    : votes === 0 && !percentReporting ? 'NOT_STARTED' as const
      : 'PARTIAL' as const;

const decimal = (value: number | null) => (value === null ? null : new Prisma.Decimal(value));

/** Writes and publishes one race's snapshot. Throws to reject the race. */
async function publishRace(
  db: PrismaClient,
  memory: IngestMemory,
  ctx: CycleContext,
  contest: ContestState,
  update: RaceUpdate,
  meta: { runId: string; artifactId: string; payloadSha256: string; sourceUpdatedAt: Date; testData: boolean },
  warnings: string[],
): Promise<void> {
  const votes = totalVotes(update);
  const status = reportingStatus(votes, update.percentReporting);
  await db.$transaction(async (tx) => {
    const rootId = await reportingUnit(tx, memory, ctx.sourceId, {
      sourceUnitId: `race:${update.sourceContestId}`, name: update.name, type: update.race.officeType === 'SENATE' ? 'STATE' : 'DISTRICT', parentId: null, geographyUnitId: null,
    });
    const units: Array<{ id: string; candidates: CandidateTally[]; otherVotes: number; percentReporting: number | null }> = [
      { id: rootId, candidates: update.candidates, otherVotes: update.otherVotes, percentReporting: update.percentReporting },
    ];
    for (const county of update.counties ?? []) {
      const geographyUnitId = await countyGeography(tx, memory, county.fips, county.name);
      const id = await reportingUnit(tx, memory, ctx.sourceId, {
        sourceUnitId: `race:${update.sourceContestId}:county:${county.fips}`,
        // A county split across districts is one unit per district, named as a part.
        name: update.race.officeType === 'HOUSE' ? `${county.name} (part)` : county.name,
        type: 'COUNTY', parentId: rootId, geographyUnitId,
      });
      units.push({ id, candidates: county.candidates, otherVotes: county.otherVotes, percentReporting: county.percentReporting });
    }

    const candidacyIds = new Map<string, string>();
    for (const candidate of update.candidates) {
      candidacyIds.set(candidate.sourceCandidateId, await candidacyFor(tx, ctx.sourceId, contest, candidate, warnings));
    }

    const snapshot = await tx.resultSnapshot.create({
      data: {
        contestId: contest.id, sourceId: ctx.sourceId, ingestionRunId: meta.runId, rawArtifactId: meta.artifactId,
        sourceSnapshotId: signatureId(update), payloadSha256: meta.payloadSha256, publicationStatus: 'STAGED',
        reportingStatus: status, certification: 'UNOFFICIAL', sourceUpdatedAt: meta.sourceUpdatedAt,
        isPartial: status !== 'COMPLETE', isMock: false, isTestData: meta.testData,
        notes: meta.testData ? 'civicAPI TEST DATA: rehearsal numbers, not election results.' : null,
      },
      select: { id: true },
    });
    const voteRows: Prisma.CandidateVoteCreateManyInput[] = [];
    const metricRows: Prisma.ContestMetricCreateManyInput[] = [];
    for (const unit of units) {
      for (const candidate of unit.candidates) {
        const candidacyId = candidacyIds.get(candidate.sourceCandidateId);
        if (!candidacyId) {
          // A county row whose name matches no one at race level; its votes stay in the county total.
          warnings.push(`${contest.label}: county candidate ${candidate.name} matches no race candidate; counted in the total only`);
          continue;
        }
        voteRows.push({
          snapshotId: snapshot.id, candidacyId, reportingUnitId: unit.id, voteType: 'TOTAL',
          votes: BigInt(candidate.votes), sourceVotePercentage: decimal(candidate.percent),
        });
      }
      metricRows.push({
        snapshotId: snapshot.id, reportingUnitId: unit.id, votesCounted: BigInt(totalVotes(unit)),
        // civicAPI gives an estimated share only; counts stay null and are never invented.
        reportingPercentage: decimal(unit.percentReporting), isComplete: unit.percentReporting === 100,
      });
    }
    await tx.candidateVote.createMany({ data: voteRows });
    await tx.contestMetric.createMany({ data: metricRows });
    await publishSnapshot(tx, contest.id, snapshot.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/**
 * Records civicAPI's calls for one race: new ones are added, ones missing from
 * `RETRACT_AFTER_MISSES` documents in a row are retracted. A detail document's `called_at`
 * replaces a first-seen time.
 */
async function syncCalls(
  db: PrismaClient,
  memory: IngestMemory,
  ctx: CycleContext,
  contest: ContestState,
  update: RaceUpdate,
  meta: { artifactId: string | null; testData: boolean; now: Date },
  outcome: IngestOutcome,
) {
  const wanted = calledCandidates(update)
    .map((call) => ({ ...call, candidacyId: contest.candidacies.get(call.sourceCandidateId) }))
    .filter((call): call is typeof call & { candidacyId: string } => Boolean(call.candidacyId));
  const active = contest.activeCalls.filter((call) => call.isTestData === meta.testData);
  for (const call of active) {
    const still = wanted.some((item) => item.candidacyId === call.candidacyId && item.kind === call.kind);
    if (still) {
      memory.callMisses.delete(call.id);
      if (!call.calledAtSource && update.calledAt) {
        await db.raceCall.update({ where: { id: call.id }, data: { calledAt: new Date(update.calledAt), calledAtSource: true } });
        call.calledAtSource = true;
      }
      continue;
    }
    const misses = (memory.callMisses.get(call.id) ?? 0) + 1;
    memory.callMisses.set(call.id, misses);
    if (misses < RETRACT_AFTER_MISSES) continue;
    await db.raceCall.update({ where: { id: call.id }, data: { retractedAt: meta.now } });
    memory.callMisses.delete(call.id);
    contest.activeCalls = contest.activeCalls.filter((item) => item.id !== call.id);
    outcome.callsRetracted.push(`${contest.label} ${call.kind.toLowerCase()} call retracted`);
  }
  for (const call of wanted) {
    if (active.some((item) => item.candidacyId === call.candidacyId && item.kind === call.kind)) continue;
    const created = await db.raceCall.create({
      data: {
        contestId: contest.id, candidacyId: call.candidacyId, sourceId: ctx.sourceId, kind: call.kind,
        calledAt: update.calledAt ? new Date(update.calledAt) : meta.now, calledAtSource: Boolean(update.calledAt),
        firstSeenAt: meta.now, rawArtifactId: meta.artifactId, isTestData: meta.testData,
      },
      select: { id: true },
    });
    contest.activeCalls.push({ id: created.id, candidacyId: call.candidacyId, kind: call.kind, calledAtSource: Boolean(update.calledAt), isTestData: meta.testData });
    const name = update.candidates.find((candidate) => candidate.sourceCandidateId === call.sourceCandidateId)?.name ?? 'a candidate';
    outcome.callsMade.push(`${contest.label} ${call.kind === 'WINNER' ? 'called for' : 'runoff:'} ${name}`);
    if (!update.calledAt) outcome.needCallTime.push(update.sourceContestId);
  }
}

/** Removes rehearsal snapshots and calls once civicAPI serves live numbers. */
export async function purgeTestData(db: PrismaClient, sourceId: string): Promise<{ snapshots: number; calls: number }> {
  return db.$transaction(async (tx) => {
    await tx.contest.updateMany({ where: { sourceId, currentSnapshot: { isTestData: true } }, data: { currentSnapshotId: null } });
    const calls = await tx.raceCall.deleteMany({ where: { sourceId, isTestData: true } });
    const snapshots = await tx.resultSnapshot.deleteMany({ where: { sourceId, isTestData: true } });
    return { snapshots: snapshots.count, calls: calls.count };
  }, { timeout: 60_000 });
}

/**
 * Applies one parsed document: publishes changed races in `snapshotRaces` (the races this document
 * kind owns, see the tiers) and syncs calls for every race in it.
 */
export async function ingestDocument(
  db: PrismaClient,
  memory: IngestMemory,
  ctx: CycleContext,
  doc: FetchedDocument,
  parsed: ParsedDocument,
  options: IngestOptions & { runId: string; snapshotRaces: (update: RaceUpdate) => boolean; now?: Date },
): Promise<IngestOutcome> {
  const now = options.now ?? new Date();
  const outcome: IngestOutcome = { published: [], unchanged: 0, rejected: [], callsMade: [], callsRetracted: [], needCallTime: [], warnings: [] };
  const known = parsed.races.filter((update) => {
    if (ctx.contests.has(update.sourceContestId)) return true;
    outcome.rejected.push({ label: update.label, reason: `election_id ${update.sourceContestId} is not in the catalog; run the ballot sync (npm run sync:ballot -- --apply)` });
    return false;
  });
  const changed = known.filter((update) => options.snapshotRaces(update) && hasChanged(update, ctx.contests.get(update.sourceContestId)!, parsed.testData));
  outcome.unchanged = known.filter(options.snapshotRaces).length - changed.length;
  const anyCalls = known.some((update) => calledCandidates(update).length > 0 || ctx.contests.get(update.sourceContestId)!.activeCalls.length > 0);
  const artifactId = changed.length > 0 || anyCalls ? await recordArtifact(db, ctx.sourceId, options.runId, doc, parsed, options) : null;
  // civicAPI's own time for this document: one race's for a detail document, the whole feed's for an aggregate.
  const documentTime = new Date(parsed.lastUpdated ?? doc.fetchedAt);
  // The snapshot's "as of" time. A detail document's last_updated is its race's own. An aggregate's is feed-wide
  // and need not follow the counts: on Nov 3 both aggregates still read Oct 23 while detail documents were current.
  // So an aggregate snapshot is stamped with the cycle that first saw its numbers, within one poll of the change.
  // A finals pass stamps detail documents the same way, with the time it fetched them (`stampWithFetchTime`).
  const sourceUpdatedAt = parsed.kind === 'aggregate' || options.stampWithFetchTime ? now : documentTime;

  for (const update of changed) {
    const contest = ctx.contests.get(update.sourceContestId)!;
    const sameKind = contest.currentKind === parsed.kind;
    // A document older than the one of the same kind behind the current snapshot is a stale copy served late.
    const stale = sameKind && contest.currentDocumentTime !== null && documentTime < contest.currentDocumentTime;
    // Across kinds only the "as of" times compare, as publishSnapshot() does.
    const behind = !sameKind && contest.currentSourceUpdatedAt !== null && sourceUpdatedAt < contest.currentSourceUpdatedAt;
    if ((stale || behind) && !contest.currentSnapshotIsTest) {
      if (behind && contest.currentKind) {
        // The race joined tier A after a restart: its detail document's own time is older than the cycle that
        // stamped its aggregate snapshot, so it keeps its current numbers until it next changes. (The other way,
        // detail to aggregate, always publishes: the cycle time is newer.) Nothing failed validation, so this is no rejection.
        outcome.warnings.push(`${update.label}: kept its ${contest.currentKind} snapshot; the ${parsed.kind} document is older (the race changed tiers) and publishes once the race next changes`);
        continue;
      }
      outcome.rejected.push({ label: update.label, reason: 'this document is older than the race’s current snapshot' });
      continue;
    }
    try {
      await publishRace(db, memory, ctx, contest, update, { runId: options.runId, artifactId: artifactId!, payloadSha256: doc.sha256!, sourceUpdatedAt, testData: parsed.testData }, outcome.warnings);
      contest.currentSignature = signatureId(update);
      contest.currentSnapshotIsTest = parsed.testData;
      contest.currentSourceUpdatedAt = sourceUpdatedAt;
      contest.currentDocumentTime = documentTime;
      contest.currentKind = parsed.kind;
      outcome.published.push(update.label);
    } catch (error) {
      // Unit and geography ids cached inside a rolled-back transaction may not exist.
      memory.units.clear();
      memory.counties.clear();
      memory.countyVersionId = null;
      outcome.rejected.push({ label: update.label, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const update of known) {
    try {
      await syncCalls(db, memory, ctx, ctx.contests.get(update.sourceContestId)!, update, { artifactId, testData: parsed.testData, now }, outcome);
    } catch (error) {
      outcome.rejected.push({ label: update.label, reason: `race call: ${error instanceof Error ? error.message : error}` });
    }
  }
  return outcome;
}

/** Logs parse issues and rejected races against the run; one row per problem. */
export async function recordIssues(db: PrismaClient, runId: string, issues: ResultsParseIssue[], outcome: IngestOutcome | null, ctx: CycleContext | null) {
  const rows: Prisma.IngestionErrorCreateManyInput[] = [
    ...issues.map((issue) => ({ ingestionRunId: runId, severity: issue.severity, code: issue.code, message: issue.message.slice(0, 2000) })),
    ...(outcome?.rejected ?? []).map((item) => ({
      ingestionRunId: runId, severity: 'ERROR' as const, code: 'RACE_REJECTED', message: `${item.label}: ${item.reason}`.slice(0, 2000), recordKey: item.label,
      contestId: [...(ctx?.contests.values() ?? [])].find((contest) => contest.label === item.label)?.id ?? null,
    })),
    ...(outcome?.warnings ?? []).map((message) => ({ ingestionRunId: runId, severity: 'WARNING' as const, code: 'RESULTS_WARNING', message: message.slice(0, 2000) })),
  ];
  if (rows.length > 0) await db.ingestionError.createMany({ data: rows });
}
