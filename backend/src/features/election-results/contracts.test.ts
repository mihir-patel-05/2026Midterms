import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ElectionResultsFeatureFlagsSchema,
  ElectionResultsResponseSchema,
  type ElectionResultsResponse,
} from './contracts.js';
import {
  mockCertifiedStatewideResultsFixture,
  mockCountyResultsFixture,
  mockElectionResultsFeatureFlags,
  mockElectionResultsFixtures,
  mockPartialSenateResultsFixture,
  mockStaleHouseResultsFixture,
  mockUnavailableResultsFixture,
} from './fixtures.js';

test('all election result fixtures satisfy the normalized response contract', () => {
  for (const fixture of mockElectionResultsFixtures) {
    const parsed = ElectionResultsResponseSchema.safeParse(fixture);
    assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error.message);
    assert.equal(fixture.meta.dataMode, 'MOCK');
    assert.equal(fixture.meta.isMockData, true);
    assert.equal(fixture.meta.source.isMock, true);
    assert.match(fixture.meta.mockDisclaimer ?? '', /fictional mock data/i);
  }
});

test('fixtures cover Senate, House, statewide, county, stale, partial, certified, and unavailable states', () => {
  assert.equal(mockPartialSenateResultsFixture.data?.contest.officeType, 'US_SENATE');
  assert.equal(mockPartialSenateResultsFixture.meta.responseStatus, 'PARTIAL');
  assert.ok(
    mockPartialSenateResultsFixture.data?.reportingUnitResults.some(
      result => result.reportingUnit.type === 'COUNTY'
    )
  );

  assert.equal(mockStaleHouseResultsFixture.data?.contest.officeType, 'US_HOUSE');
  assert.equal(mockStaleHouseResultsFixture.meta.freshness, 'STALE');
  assert.equal(mockStaleHouseResultsFixture.meta.source.health, 'STALE');

  assert.equal(
    mockCertifiedStatewideResultsFixture.data?.contest.officeType,
    'STATEWIDE_EXECUTIVE'
  );
  assert.equal(mockCertifiedStatewideResultsFixture.data?.certificationState, 'CERTIFIED');
  assert.equal(mockCertifiedStatewideResultsFixture.data?.status, 'COMPLETE');

  assert.equal(mockCountyResultsFixture.data?.reportingUnit.type, 'COUNTY');
  assert.equal(mockCountyResultsFixture.data?.certificationState, 'UNOFFICIAL');

  assert.equal(mockUnavailableResultsFixture.data, null);
  assert.equal(mockUnavailableResultsFixture.meta.responseStatus, 'UNAVAILABLE');
  assert.equal(mockUnavailableResultsFixture.meta.coverage, 'NONE');
});

test('reporting progress rejects a reported count greater than the total', () => {
  const invalid: ElectionResultsResponse = structuredClone(mockPartialSenateResultsFixture);
  assert.ok(invalid.data);
  invalid.data.reportingProgress.precincts = {
    reported: 1_201,
    total: 1_200,
    percentage: 100,
  };

  const parsed = ElectionResultsResponseSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some(issue => issue.message === 'reported cannot exceed total'),
    parsed.error.message
  );
});

test('mock responses reject inconsistent live-data labeling', () => {
  const invalid: ElectionResultsResponse = structuredClone(mockCountyResultsFixture);
  invalid.meta.dataMode = 'LIVE';

  const parsed = ElectionResultsResponseSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some(issue =>
      issue.message.includes('data mode, mock labeling, disclaimer, and source type must agree')
    ),
    parsed.error.message
  );
});

test('unavailable responses cannot silently carry result data', () => {
  const invalid: ElectionResultsResponse = structuredClone(mockPartialSenateResultsFixture);
  invalid.meta.responseStatus = 'UNAVAILABLE';
  invalid.meta.coverage = 'NONE';

  const parsed = ElectionResultsResponseSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some(issue => issue.message === 'unavailable responses must not contain result data'),
    parsed.error.message
  );
});

test('certified results must be complete', () => {
  const invalid: ElectionResultsResponse = structuredClone(mockCertifiedStatewideResultsFixture);
  assert.ok(invalid.data);
  invalid.data.status = 'IN_PROGRESS';

  const parsed = ElectionResultsResponseSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some(issue => issue.message === 'a certified result must have COMPLETE result status'),
    parsed.error.message
  );
});

test('candidate result ids must reference the same candidate and candidacy', () => {
  const invalid: ElectionResultsResponse = structuredClone(mockPartialSenateResultsFixture);
  assert.ok(invalid.data);
  invalid.data.candidateResults[0].candidacyId = invalid.data.candidates[1].candidacyId;

  const parsed = ElectionResultsResponseSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some(
      issue => issue.message === 'candidateId and candidacyId must reference the same candidate'
    ),
    parsed.error.message
  );
});

test('candidate results reject duplicate candidate rows', () => {
  const invalid: ElectionResultsResponse = structuredClone(mockPartialSenateResultsFixture);
  assert.ok(invalid.data);
  invalid.data.candidateResults[1] = structuredClone(invalid.data.candidateResults[0]);

  const parsed = ElectionResultsResponseSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some(
      issue => issue.message === 'candidate results must not contain duplicate candidates'
    ),
    parsed.error.message
  );
});

test('listed candidate votes cannot exceed the reported total vote count', () => {
  const invalid: ElectionResultsResponse = structuredClone(mockPartialSenateResultsFixture);
  assert.ok(invalid.data);
  invalid.data.candidateResults[0].votes = invalid.data.totalVotes + 1;

  const parsed = ElectionResultsResponseSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some(issue => issue.message === 'candidate vote sum cannot exceed totalVotes'),
    parsed.error.message
  );
});

test('provider feature flags are keyed by their matching provider key', () => {
  assert.equal(ElectionResultsFeatureFlagsSchema.safeParse(mockElectionResultsFeatureFlags).success, true);

  const invalid = structuredClone(mockElectionResultsFeatureFlags);
  invalid.providers.mock_fixtures.providerKey = 'different_key';

  const parsed = ElectionResultsFeatureFlagsSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
  assert.ok(
    parsed.error.issues.some(issue =>
      issue.message.includes('provider registry key must match providerKey')
    ),
    parsed.error.message
  );
});
