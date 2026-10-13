import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ElectionResultsResponseSchema,
  RESULT_CONTRACT_VERSION,
  SourceStatusSchema,
  type CandidateResult,
  type ContestResult,
  type CoverageStatusSchema,
  type ElectionResultsResponse,
  type FreshnessStatusSchema,
  type ReportingProgress,
  type ReportingUnit,
  type ResponseMetadata,
  type SourceStatus,
} from './contracts.js';
import type { z } from 'zod';

/**
 * Read path for /api/v1 results: turns each contest's published current snapshot into the
 * provider-neutral contract. Any provider that writes snapshots and calls publishSnapshot()
 * is served here once its DataSource is eligible (see servableSourceWhere).
 */

export interface ReadModelConfig {
  mockEnabled: boolean;
  enabledProviderKeys: string[];
  staleAfterSeconds: number;
}

type Coverage = z.infer<typeof CoverageStatusSchema>;
type Freshness = z.infer<typeof FreshnessStatusSchema>;
type Jurisdiction = ContestResult['contest']['jurisdiction'];

const WITHHELD_LIMITATION =
  'Results for this contest failed validation and are withheld until the source data is corrected.';
const MOCK_LIMITATION =
  'Results are fictional mock data; no live election provider is connected.';
const FALLBACK_MOCK_DISCLAIMER = 'FICTIONAL MOCK DATA — not official election results.';

export const contestInclude = {
  electionEvent: true,
  electionDistrict: true,
  source: true,
  candidacies: { include: { person: true, party: true } },
  currentSnapshot: {
    include: {
      rawArtifact: { select: { sourceUrl: true } },
      candidateVotes: { where: { voteType: 'TOTAL' } },
      contestMetrics: { include: { reportingUnit: { include: { geographyUnit: true } } } },
    },
  },
} satisfies Prisma.ContestInclude;

export type ContestRecord = Prisma.ContestGetPayload<{ include: typeof contestInclude }>;
type SourceRecord = NonNullable<ContestRecord['source']>;
type SnapshotRecord = NonNullable<ContestRecord['currentSnapshot']>;
type MetricRecord = SnapshotRecord['contestMetrics'][number];

class InconsistentDataError extends Error {}

/** Mock sources need the mock flag; live sources must be enabled in the DB and listed in env. */
export function servableSourceWhere(config: ReadModelConfig): Prisma.DataSourceWhereInput {
  const eligible: Prisma.DataSourceWhereInput[] = [];
  if (config.mockEnabled) eligible.push({ isMock: true, type: 'MOCK_FIXTURE' });
  if (config.enabledProviderKeys.length > 0) {
    eligible.push({
      isMock: false,
      isEnabled: true,
      type: { not: 'MOCK_FIXTURE' },
      key: { in: config.enabledProviderKeys },
    });
  }
  return eligible.length > 0 ? { OR: eligible } : { id: { in: [] } };
}

const iso = (date: Date) => date.toISOString();
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

function count(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new InconsistentDataError('Count exceeds the safe integer range');
  return result;
}

const resultStatus = {
  NOT_STARTED: 'NOT_STARTED',
  PARTIAL: 'IN_PROGRESS',
  COMPLETE: 'COMPLETE',
  DELAYED: 'DELAYED',
  SUSPENDED: 'DELAYED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

const reportingUnitType = {
  NATION: 'OTHER',
  STATE: 'STATE',
  DISTRICT: 'CONGRESSIONAL_DISTRICT',
  COUNTY: 'COUNTY',
  PRECINCT: 'PRECINCT',
  SPLIT_PRECINCT: 'SPLIT_PRECINCT',
  BALLOT_BATCH: 'OTHER',
  OTHER: 'OTHER',
} as const;

const jurisdictionType = {
  NATION: 'NATIONAL',
  STATE: 'STATE',
  CONGRESSIONAL_DISTRICT: 'CONGRESSIONAL_DISTRICT',
  COUNTY: 'COUNTY',
  PRECINCT: 'PRECINCT',
  SPLIT_PRECINCT: 'PRECINCT',
  MUNICIPALITY: 'OTHER',
  OTHER: 'OTHER',
} as const;

const sourceType = {
  OFFICIAL_FEDERAL: 'OTHER',
  OFFICIAL_STATE: 'STATE_OFFICIAL',
  OFFICIAL_LOCAL: 'LOCAL_OFFICIAL',
  LICENSED_PROVIDER: 'LICENSED_PROVIDER',
  MOCK_FIXTURE: 'MOCK_FIXTURE',
  OTHER: 'OTHER',
} as const;

const electionStatus = {
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'OPEN',
  COMPLETED: 'CLOSED',
  POSTPONED: 'SCHEDULED',
  CANCELLED: 'SCHEDULED',
} as const;

const officeTypes = new Set(['US_SENATE', 'US_HOUSE', 'STATEWIDE_EXECUTIVE', 'COUNTY_OFFICE']);

export function toSourceStatus(
  source: SourceRecord,
  fallbackUrl: string | null,
  now: Date,
  config: ReadModelConfig
): SourceStatus | null {
  let health = source.healthStatus;
  const staleAfterMs = Math.max(2 * (source.expectedCadenceSeconds ?? 0), config.staleAfterSeconds) * 1000;
  if (health === 'CURRENT' && source.lastSuccessfulAt && now.getTime() - source.lastSuccessfulAt.getTime() > staleAfterMs) {
    health = 'STALE';
  }
  const message = source.coverageDescription?.trim().slice(0, 500);
  const status = SourceStatusSchema.safeParse({
    providerKey: source.key,
    name: source.name,
    url: source.homepageUrl ?? fallbackUrl,
    type: sourceType[source.type],
    health,
    isMock: source.isMock,
    updatedAt: iso(source.updatedAt),
    lastCheckedAt: iso(source.lastCheckedAt ?? source.updatedAt),
    lastSuccessfulAt: source.lastSuccessfulAt ? iso(source.lastSuccessfulAt) : null,
    expectedUpdateIntervalSeconds: source.expectedCadenceSeconds ?? null,
    message: message || undefined,
  });
  if (!status.success) {
    console.warn(`[results] Source ${source.key} is not servable: ${status.error.issues.map((issue) => issue.message).join('; ')}`);
    return null;
  }
  return status.data;
}

function metadata(
  source: SourceRecord,
  status: SourceStatus,
  now: Date,
  fields: Pick<ResponseMetadata, 'updatedAt' | 'responseStatus' | 'freshness' | 'coverage' | 'request'> & { limitations?: string[] }
): ResponseMetadata {
  return {
    contractVersion: RESULT_CONTRACT_VERSION,
    generatedAt: iso(now),
    updatedAt: fields.updatedAt,
    dataMode: source.isMock ? 'MOCK' : 'LIVE',
    isMockData: source.isMock,
    mockDisclaimer: source.isMock ? source.attributionText.trim().slice(0, 500) || FALLBACK_MOCK_DISCLAIMER : undefined,
    responseStatus: fields.responseStatus,
    freshness: fields.freshness,
    coverage: fields.coverage,
    source: status,
    limitations: [...(source.isMock ? [MOCK_LIMITATION] : []), ...(fields.limitations ?? [])],
    request: fields.request,
  };
}

function stateJurisdiction(stateCode: string | null, stateNames: Map<string, string>): Jurisdiction {
  if (!stateCode) return { id: 'nation-us', type: 'NATIONAL', name: 'United States' };
  return { id: `state-${stateCode}`, type: 'STATE', name: stateNames.get(stateCode) ?? stateCode, stateCode };
}

function contestJurisdiction(contest: ContestRecord, stateNames: Map<string, string>): Jurisdiction {
  const district = contest.electionDistrict;
  if (!district) return stateJurisdiction(contest.stateCode, stateNames);
  return {
    id: district.id,
    type: jurisdictionType[district.type],
    name: district.name,
    stateCode: district.stateCode ?? contest.stateCode ?? undefined,
    districtCode: district.districtCode ?? undefined,
    countyFips: district.countyFips ?? undefined,
  };
}

function toReportingUnit(metric: MetricRecord, contest: ContestRecord): ReportingUnit {
  const unit = metric.reportingUnit;
  const stateCode = unit.geographyUnit?.stateCode ?? contest.stateCode;
  if (!stateCode) throw new InconsistentDataError(`Reporting unit ${unit.id} has no state code`);
  return {
    id: unit.id,
    sourceUnitId: unit.sourceUnitId,
    type: reportingUnitType[unit.type],
    name: unit.name,
    stateCode,
    districtCode: unit.geographyUnit?.districtCode ?? undefined,
    countyFips: unit.geographyUnit?.countyFips ?? undefined,
    parentId: unit.parentId ?? undefined,
  };
}

function progressCount(reported: number | null, total: number | null, sourcePercentage?: number) {
  // Missing progress stays null; it is never reported as zero.
  if (reported === null || total === null) return { reported: null, total: null, percentage: null };
  const percentage = sourcePercentage ?? (total > 0 ? round4((reported / total) * 100) : null);
  return { reported, total, percentage };
}

function toProgress(metric: MetricRecord): ReportingProgress {
  return {
    reportingUnits: progressCount(metric.reportingUnitsReporting, metric.reportingUnitsTotal),
    precincts: progressCount(metric.precinctsReporting, metric.precinctsTotal, metric.reportingPercentage?.toNumber()),
  };
}

/** The contest-level unit is the contest's district, else the snapshot's single top-level unit. */
function contestLevelMetric(contest: ContestRecord, metrics: MetricRecord[]): MetricRecord {
  const district = contest.electionDistrictId
    ? metrics.find((metric) => metric.reportingUnit.geographyUnitId === contest.electionDistrictId)
    : undefined;
  if (district) return district;
  const unitIds = new Set(metrics.map((metric) => metric.reportingUnitId));
  const roots = metrics.filter((metric) => !metric.reportingUnit.parentId || !unitIds.has(metric.reportingUnit.parentId));
  if (roots.length !== 1) throw new InconsistentDataError('Cannot determine the contest-level reporting unit');
  return roots[0];
}

function buildContestResult(
  contest: ContestRecord,
  snapshot: SnapshotRecord,
  stateNames: Map<string, string>
): ContestResult {
  const event = contest.electionEvent;
  if (event.type === 'OTHER') throw new InconsistentDataError(`Election ${event.id} has an unsupported type`);
  const updatedAt = iso(snapshot.sourceUpdatedAt ?? snapshot.receivedAt);
  const status = resultStatus[snapshot.reportingStatus];
  const certificationState = snapshot.certification === 'CERTIFIED' ? 'CERTIFIED' : 'UNOFFICIAL';

  const votedCandidacies = new Set(snapshot.candidateVotes.map((vote) => vote.candidacyId));
  const candidacies = contest.candidacies
    .filter((candidacy) =>
      votedCandidacies.has(candidacy.id) ||
      (candidacy.ballotStatus !== 'WITHDRAWN' && candidacy.ballotStatus !== 'DISQUALIFIED'))
    .sort((a, b) => (a.ballotOrder ?? Infinity) - (b.ballotOrder ?? Infinity) || a.id.localeCompare(b.id));
  const personByCandidacy = new Map(candidacies.map((candidacy) => [candidacy.id, candidacy.personId]));

  const unitResults = (metric: MetricRecord) => {
    const votes = snapshot.candidateVotes.filter((vote) => vote.reportingUnitId === metric.reportingUnitId);
    const listed = votes.reduce((sum, vote) => sum + count(vote.votes), 0);
    const totalVotes = metric.votesCounted === null ? listed : count(metric.votesCounted);
    const candidateResults: CandidateResult[] = votes.map((vote) => {
      const voteCount = count(vote.votes);
      return {
        candidateId: personByCandidacy.get(vote.candidacyId) ?? vote.candidacyId,
        candidacyId: vote.candidacyId,
        votes: voteCount,
        percentage: vote.sourceVotePercentage?.toNumber() ?? (totalVotes > 0 ? round4((voteCount / totalVotes) * 100) : 0),
        updatedAt,
      };
    });
    candidateResults.sort((a, b) => b.votes - a.votes || a.candidacyId.localeCompare(b.candidacyId));
    return { candidateResults, totalVotes };
  };

  const root = contestLevelMetric(contest, snapshot.contestMetrics);
  const rootResults = unitResults(root);
  return {
    snapshotId: snapshot.id,
    election: {
      id: event.id,
      name: event.name,
      electionDate: iso(event.electionDate).slice(0, 10),
      type: event.type,
      status: electionStatus[event.status],
      cycle: event.cycle,
      jurisdiction: stateJurisdiction(event.stateCode, stateNames),
    },
    contest: {
      id: contest.id,
      electionId: event.id,
      sourceContestId: contest.sourceContestId ?? undefined,
      officeType: officeTypes.has(contest.office) ? contest.office as ContestResult['contest']['officeType'] : 'OTHER',
      officeTitle: contest.name,
      jurisdiction: contestJurisdiction(contest, stateNames),
      districtCode: contest.districtCode ?? undefined,
    },
    reportingUnit: toReportingUnit(root, contest),
    candidates: candidacies.map((candidacy) => ({
      id: candidacy.personId,
      candidacyId: candidacy.id,
      displayName: candidacy.ballotName ?? candidacy.person.displayName,
      party: candidacy.party
        ? { name: candidacy.party.name, abbreviation: candidacy.party.abbreviation ?? undefined }
        : null,
      ballotOrder: candidacy.ballotOrder ?? undefined,
      isWriteIn: candidacy.ballotStatus === 'WRITE_IN',
    })),
    candidateResults: rootResults.candidateResults,
    reportingUnitResults: snapshot.contestMetrics
      .filter((metric) => metric !== root)
      .sort((a, b) => a.reportingUnit.name.localeCompare(b.reportingUnit.name))
      .map((metric) => ({
        reportingUnit: toReportingUnit(metric, contest),
        ...unitResults(metric),
        reportingProgress: toProgress(metric),
        status,
        certificationState,
        updatedAt,
      })),
    totalVotes: rootResults.totalVotes,
    reportingProgress: toProgress(root),
    status,
    certificationState,
    updatedAt,
  };
}

function freshnessFor(snapshot: SnapshotRecord, source: SourceRecord, now: Date, config: ReadModelConfig): Freshness {
  if (snapshot.reportingStatus === 'COMPLETE') return 'FRESH';
  const reference = source.lastSuccessfulAt ?? snapshot.receivedAt;
  return now.getTime() - reference.getTime() > config.staleAfterSeconds * 1000 ? 'STALE' : 'FRESH';
}

/**
 * Map one contest to a validated response. Inconsistent data is withheld as UNAVAILABLE rather
 * than served; null means the contest's source cannot be described (it is not served at all).
 */
export function toResultsResponse(
  contest: ContestRecord,
  context: {
    now: Date;
    config: ReadModelConfig;
    stateNames: Map<string, string>;
    /** Latest artifact URL per source id, used when a source has no homepage URL. */
    artifactUrls?: Map<string, string>;
  }
): ElectionResultsResponse | null {
  const { now, config, stateNames } = context;
  const source = contest.source;
  if (!source) return null;
  const snapshot = contest.currentSnapshot;
  const status = toSourceStatus(
    source,
    snapshot?.rawArtifact?.sourceUrl ?? context.artifactUrls?.get(source.id) ?? null,
    now,
    config
  );
  if (!status) return null;
  const request = { electionId: contest.electionEventId, contestId: contest.id };

  const unavailable = (limitations: string[] = []) => {
    const response = {
      data: null,
      meta: metadata(source, status, now, {
        updatedAt: iso(snapshot ? snapshot.sourceUpdatedAt ?? snapshot.receivedAt : source.updatedAt),
        responseStatus: 'UNAVAILABLE', freshness: 'UNKNOWN', coverage: 'NONE', request, limitations,
      }),
    };
    return ElectionResultsResponseSchema.safeParse(response).success ? response : null;
  };
  const withhold = (reason: string) => {
    console.warn(`[results] Withholding contest ${contest.id} snapshot ${snapshot?.id}: ${reason}`);
    return unavailable([WITHHELD_LIMITATION]);
  };

  if (!snapshot || snapshot.reportingStatus === 'UNAVAILABLE') return unavailable();

  let data: ContestResult;
  try {
    data = buildContestResult(contest, snapshot, stateNames);
  } catch (error) {
    if (error instanceof InconsistentDataError) return withhold(error.message);
    throw error;
  }
  const response: ElectionResultsResponse = {
    data,
    meta: metadata(source, status, now, {
      updatedAt: data.updatedAt,
      responseStatus: snapshot.isPartial ? 'PARTIAL' : 'AVAILABLE',
      freshness: freshnessFor(snapshot, source, now, config),
      coverage: snapshot.isPartial ? 'PARTIAL' : 'COMPLETE',
      request,
    }),
  };
  const parsed = ElectionResultsResponseSchema.safeParse(response);
  if (!parsed.success) return withhold(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return response;
}

async function loadStateNames(db: PrismaClient, stateCodes: Array<string | null>) {
  const codes = [...new Set(stateCodes.filter((code): code is string => Boolean(code)))];
  if (codes.length === 0) return new Map<string, string>();
  const units = await db.geographyUnit.findMany({
    where: { type: 'STATE', stateCode: { in: codes } },
    select: { stateCode: true, name: true },
    orderBy: { createdAt: 'desc' },
  });
  const names = new Map<string, string>();
  for (const unit of units) if (unit.stateCode && !names.has(unit.stateCode)) names.set(unit.stateCode, unit.name);
  return names;
}

async function latestArtifactUrl(db: PrismaClient, sourceId: string) {
  const artifact = await db.rawArtifact.findFirst({
    where: { sourceId, sourceUrl: { not: null } },
    orderBy: { fetchedAt: 'desc' },
    select: { sourceUrl: true },
  });
  return artifact?.sourceUrl ?? null;
}

async function loadServableSources(db: PrismaClient, config: ReadModelConfig, now: Date) {
  const sources = await db.dataSource.findMany({ where: servableSourceWhere(config), orderBy: { key: 'asc' } });
  const described = await Promise.all(sources.map(async (source) => {
    const artifactUrl = source.homepageUrl ? null : await latestArtifactUrl(db, source.id);
    const status = toSourceStatus(source, artifactUrl, now, config);
    return status ? { source, status, artifactUrl } : null;
  }));
  return described.filter((item): item is NonNullable<typeof item> => item !== null);
}

/** Live sources describe an aggregate payload ahead of mock ones. */
function primarySource(sources: Awaited<ReturnType<typeof loadServableSources>>) {
  return sources.find((item) => !item.source.isMock) ?? sources[0];
}

function aggregateCoverage(values: Coverage[]): Coverage {
  if (values.length === 0) return 'NONE';
  if (values.every((value) => value === 'COMPLETE')) return 'COMPLETE';
  if (values.every((value) => value === 'NONE')) return 'NONE';
  return 'PARTIAL';
}

/** Null when no eligible source exists. */
export async function dbBootstrapPayload(db: PrismaClient, config: ReadModelConfig, now = new Date()) {
  const sources = await loadServableSources(db, config, now);
  const primary = primarySource(sources);
  if (!primary) return null;

  const contests = await db.contest.findMany({
    where: { source: servableSourceWhere(config) },
    include: contestInclude,
    orderBy: [{ stateCode: 'asc' }, { office: 'asc' }, { districtCode: 'asc' }, { id: 'asc' }],
  });
  const stateNames = await loadStateNames(db, contests.map((contest) => contest.stateCode));
  const artifactUrls = new Map(sources.flatMap((item) => item.artifactUrl ? [[item.source.id, item.artifactUrl] as const] : []));
  const served = contests
    .map((contest) => ({ contest, response: toResultsResponse(contest, { now, config, stateNames, artifactUrls }) }))
    .filter((item): item is { contest: ContestRecord; response: ElectionResultsResponse } => item.response !== null);
  const results = served.map((item) => item.response);

  const version = createHash('sha256')
    .update(served.map(({ contest }) => `${contest.id}:${contest.currentSnapshotId ?? ''}`).sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
  const coverageByState = new Map<string, Coverage[]>();
  for (const { contest, response } of served) {
    if (!contest.stateCode) continue;
    coverageByState.set(contest.stateCode, [...(coverageByState.get(contest.stateCode) ?? []), response.meta.coverage]);
  }
  const states = [...coverageByState].map(([code, coverage]) => ({
    code,
    name: stateNames.get(code) ?? code,
    coverage: aggregateCoverage(coverage),
  }));

  const withData = results.filter((result) => result.data !== null);
  const freshness = results.map((result) => result.meta.freshness);
  const updatedAt = results.map((result) => result.meta.updatedAt).sort().at(-1) ?? primary.status.updatedAt;
  return {
    data: { manifest: { version: `db-${version}`, states }, results },
    meta: metadata(primary.source, primary.status, now, {
      updatedAt,
      responseStatus: withData.length === 0
        ? 'UNAVAILABLE'
        : withData.every((result) => result.meta.responseStatus === 'AVAILABLE') ? 'AVAILABLE' : 'PARTIAL',
      freshness: freshness.includes('STALE') ? 'STALE' : freshness.includes('FRESH') ? 'FRESH' : 'UNKNOWN',
      coverage: aggregateCoverage(results.map((result) => result.meta.coverage)),
      request: {},
      limitations: ["Source, freshness, and coverage for each contest are in that result's meta."],
    }),
  };
}

/** Null when the contest does not exist or its source is not servable. */
export async function dbCurrentResult(db: PrismaClient, config: ReadModelConfig, contestId: string, now = new Date()) {
  const contest = await db.contest.findFirst({
    where: { id: contestId, source: servableSourceWhere(config) },
    include: contestInclude,
  });
  if (!contest) return null;
  const stateNames = await loadStateNames(db, [contest.stateCode]);
  const artifactUrl = contest.source && !contest.source.homepageUrl && !contest.currentSnapshot?.rawArtifact?.sourceUrl
    ? await latestArtifactUrl(db, contest.source.id)
    : null;
  const artifactUrls = new Map(artifactUrl && contest.source ? [[contest.source.id, artifactUrl]] : []);
  return toResultsResponse(contest, { now, config, stateNames, artifactUrls });
}

/** Null when no eligible source exists. */
export async function dbSourceStatusPayload(db: PrismaClient, config: ReadModelConfig, now = new Date()) {
  const sources = await loadServableSources(db, config, now);
  const primary = primarySource(sources);
  if (!primary) return null;
  const statuses = sources.map((item) => item.status);
  return {
    data: { sources: statuses },
    meta: metadata(primary.source, primary.status, now, {
      updatedAt: statuses.map((status) => status.updatedAt).sort().at(-1)!,
      responseStatus: 'AVAILABLE',
      freshness: statuses.some((status) => status.health === 'STALE') ? 'STALE' : 'FRESH',
      coverage: 'UNKNOWN',
      request: {},
    }),
  };
}
