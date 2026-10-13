import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma } from '@prisma/client';
import { ElectionResultsResponseSchema } from './contracts.js';
import { servableSourceWhere, toResultsResponse, type ContestRecord, type ReadModelConfig } from './read-model.js';

const now = new Date('2026-11-04T02:20:00.000Z');
const at = new Date('2026-11-04T02:15:00.000Z');
const config: ReadModelConfig = { mockEnabled: true, enabledProviderKeys: [], staleAfterSeconds: 300 };
const context = (overrides: Partial<ReadModelConfig> = {}) => ({
  now, config: { ...config, ...overrides }, stateNames: new Map([['ZZ', 'Fictional Example State']]),
});
const stamps = { createdAt: at, updatedAt: at };

function unit(id: string, type: 'DISTRICT' | 'COUNTY', parentId: string | null, geographyUnitId: string | null) {
  return {
    id, sourceId: 'source', geographyUnitId, parentId, sourceUnitId: id.toUpperCase(), name: `Unit ${id}`, type,
    isDistricted: false, isMailOnly: false, ...stamps,
    geographyUnit: geographyUnitId
      ? { id: geographyUnitId, versionId: 'v', type: 'CONGRESSIONAL_DISTRICT' as const, geoid: 'G', name: 'District 00', stateCode: 'ZZ', districtCode: '00', countyFips: null, metadata: null, ...stamps }
      : null,
  };
}

function metric(unitRecord: ReturnType<typeof unit>, values: Partial<{ votesCounted: bigint | null; precinctsReporting: number | null; precinctsTotal: number | null }> = {}) {
  return {
    id: `metric-${unitRecord.id}`, snapshotId: 'snapshot', reportingUnitId: unitRecord.id,
    ballotsCast: null, votesCounted: values.votesCounted === undefined ? 300n : values.votesCounted,
    registeredVoters: null, reportingUnitsTotal: null, reportingUnitsReporting: null,
    precinctsTotal: values.precinctsTotal === undefined ? 10 : values.precinctsTotal,
    precinctsReporting: values.precinctsReporting === undefined ? 4 : values.precinctsReporting,
    reportingPercentage: null, isComplete: false, ...stamps, reportingUnit: unitRecord,
  };
}

function vote(candidacyId: string, reportingUnitId: string, votes: bigint) {
  return {
    id: `vote-${candidacyId}-${reportingUnitId}`, snapshotId: 'snapshot', candidacyId, reportingUnitId,
    voteType: 'TOTAL', votes, sourceVotePercentage: null as Prisma.Decimal | null, ...stamps,
  };
}

function candidacy(id: string, order: number) {
  return {
    id, personId: `person-${id}`, contestId: 'contest', partyId: null, sourceId: 'source', sourceCandidateId: id,
    fecCandidateId: null, legacyCandidateId: null, legacyCandidateElectionId: null, ballotName: null, ballotOrder: order,
    ballotStatus: 'BALLOT_CONFIRMED' as const, isIncumbent: false, ...stamps,
    person: { id: `person-${id}`, displayName: `Person ${id}`, normalizedName: id, firstName: null, middleName: null, lastName: null, suffix: null, ...stamps },
    party: null,
  };
}

function fixture(): ContestRecord {
  const district = unit('district', 'DISTRICT', null, 'geo-district');
  const county = unit('county', 'COUNTY', 'district', null);
  return {
    id: 'contest', electionEventId: 'event', sourceId: 'source', sourceContestId: 'SRC-CONTEST',
    legacyElectionId: null, electionDistrictId: 'geo-district', currentSnapshotId: 'snapshot',
    name: 'Fictional House District 00', office: 'US_HOUSE', officeLevel: null, stateCode: 'ZZ', districtCode: '00',
    status: 'REPORTING', voteFor: 1, ...stamps,
    electionEvent: { id: 'event', name: 'Fictional General', electionDate: new Date('2026-11-03T00:00:00.000Z'), type: 'GENERAL', status: 'ACTIVE', cycle: 2026, stateCode: 'ZZ', sourceId: 'source', sourceElectionId: 'E', sourceUrl: null, ...stamps },
    electionDistrict: district.geographyUnit,
    source: {
      id: 'source', key: 'fictional-source', name: 'Fictional Source', type: 'MOCK_FIXTURE', authority: null,
      homepageUrl: null, attributionText: 'FICTIONAL MOCK DATA', licenseName: null, licenseUrl: null,
      coverageDescription: 'One fictional district.', expectedCadenceSeconds: null, healthStatus: 'CURRENT',
      lastCheckedAt: null, lastSuccessfulAt: null, isEnabled: false, isMock: true, ...stamps,
    },
    candidacies: [candidacy('a', 1), candidacy('b', 2)],
    currentSnapshot: {
      id: 'snapshot', contestId: 'contest', sourceId: 'source', ingestionRunId: null, rawArtifactId: 'artifact',
      sourceSnapshotId: null, payloadSha256: 'f'.repeat(64), publicationStatus: 'PUBLISHED', reportingStatus: 'PARTIAL',
      certification: 'UNOFFICIAL', sourceUpdatedAt: at, receivedAt: at, publishedAt: at, isPartial: true, isMock: true,
      notes: null, ...stamps,
      rawArtifact: { sourceUrl: 'https://example.invalid/results' },
      candidateVotes: [
        vote('a', 'district', 180n), vote('b', 'district', 120n),
        vote('a', 'county', 50n), vote('b', 'county', 30n),
      ],
      contestMetrics: [metric(district), metric(county, { votesCounted: 80n, precinctsReporting: null, precinctsTotal: null })],
    },
  };
}

test('maps a published snapshot to a valid contract response', () => {
  const response = toResultsResponse(fixture(), context());
  assert(response?.data);
  ElectionResultsResponseSchema.parse(response);
  assert.equal(response.data.snapshotId, 'snapshot');
  assert.equal(response.data.status, 'IN_PROGRESS');
  assert.equal(response.data.reportingUnit.id, 'district');
  assert.equal(response.data.reportingUnit.type, 'CONGRESSIONAL_DISTRICT');
  assert.equal(response.data.totalVotes, 300);
  assert.deepEqual(response.data.candidateResults.map((result) => [result.candidateId, result.votes, result.percentage]), [
    ['person-a', 180, 60], ['person-b', 120, 40],
  ]);
  assert.deepEqual(response.data.reportingProgress.precincts, { reported: 4, total: 10, percentage: 40 });
  assert.equal(response.data.reportingUnitResults.length, 1);
  assert.equal(response.data.election.jurisdiction.name, 'Fictional Example State');
  assert.equal(response.data.election.electionDate, '2026-11-03');
  assert.equal(response.meta.responseStatus, 'PARTIAL');
  assert.equal(response.meta.coverage, 'PARTIAL');
  assert.equal(response.meta.source.url, 'https://example.invalid/results');
});

test('missing progress counts stay null instead of becoming zero', () => {
  const response = toResultsResponse(fixture(), context());
  assert.deepEqual(response?.data?.reportingUnitResults[0].reportingProgress.precincts, { reported: null, total: null, percentage: null });
});

test('mock and live sources are labeled consistently', () => {
  const mock = toResultsResponse(fixture(), context());
  assert.equal(mock?.meta.dataMode, 'MOCK');
  assert.equal(mock?.meta.isMockData, true);
  assert.equal(mock?.meta.mockDisclaimer, 'FICTIONAL MOCK DATA');

  const liveContest = fixture();
  Object.assign(liveContest.source!, { isMock: false, type: 'OFFICIAL_STATE', isEnabled: true, homepageUrl: 'https://sos.example.gov/results' });
  liveContest.currentSnapshot!.isMock = false;
  const live = toResultsResponse(liveContest, context());
  ElectionResultsResponseSchema.parse(live);
  assert.equal(live?.meta.dataMode, 'LIVE');
  assert.equal(live?.meta.source.type, 'STATE_OFFICIAL');
  assert.equal(live?.meta.mockDisclaimer, undefined);
  assert.equal(live?.meta.source.url, 'https://sos.example.gov/results');
});

test('freshness turns stale after the configured window unless reporting is complete', () => {
  const stale = fixture();
  stale.source!.lastSuccessfulAt = new Date(now.getTime() - 301_000);
  assert.equal(toResultsResponse(stale, context())?.meta.freshness, 'STALE');
  assert.equal(toResultsResponse(stale, context())?.meta.source.health, 'STALE');

  stale.currentSnapshot!.reportingStatus = 'COMPLETE';
  stale.currentSnapshot!.isPartial = false;
  assert.equal(toResultsResponse(stale, context())?.meta.freshness, 'FRESH');
  assert.equal(toResultsResponse(stale, context())?.meta.coverage, 'COMPLETE');
});

test('contests without a current snapshot are unavailable', () => {
  const contest = fixture();
  contest.currentSnapshot = null;
  contest.currentSnapshotId = null;
  const response = toResultsResponse(contest, { ...context(), artifactUrls: new Map([['source', 'https://example.invalid/results']]) });
  ElectionResultsResponseSchema.parse(response);
  assert.equal(response?.data, null);
  assert.equal(response?.meta.responseStatus, 'UNAVAILABLE');
  assert.equal(response?.meta.coverage, 'NONE');
});

test('inconsistent snapshots are withheld rather than served', (t) => {
  t.mock.method(console, 'warn', () => {});
  const overcounted = fixture();
  overcounted.currentSnapshot!.contestMetrics[0].votesCounted = 10n;
  const withheld = toResultsResponse(overcounted, context());
  ElectionResultsResponseSchema.parse(withheld);
  assert.equal(withheld?.data, null);
  assert.match(withheld!.meta.limitations.join(' '), /withheld/);

  const certifiedPartial = fixture();
  certifiedPartial.currentSnapshot!.certification = 'CERTIFIED';
  assert.equal(toResultsResponse(certifiedPartial, context())?.data, null);

  const ambiguous = fixture();
  ambiguous.electionDistrictId = null;
  ambiguous.currentSnapshot!.contestMetrics[1].reportingUnit.parentId = null;
  assert.equal(toResultsResponse(ambiguous, context())?.data, null);
});

test('a source without a usable URL is not served', (t) => {
  t.mock.method(console, 'warn', () => {});
  const contest = fixture();
  contest.currentSnapshot!.rawArtifact = null;
  assert.equal(toResultsResponse(contest, context()), null);
});

test('source eligibility requires the mock flag or an enabled, listed live source', () => {
  assert.deepEqual(servableSourceWhere({ ...config, mockEnabled: false }), { id: { in: [] } });
  assert.deepEqual(servableSourceWhere({ ...config, mockEnabled: false, enabledProviderKeys: ['state-zz'] }), {
    OR: [{ isMock: false, isEnabled: true, type: { not: 'MOCK_FIXTURE' }, key: { in: ['state-zz'] } }],
  });
});
