import type {
  Candidate,
  CandidateResult,
  ElectionResultsFeatureFlags,
  ElectionResultsResponse,
  ReportingProgress,
  SourceStatus,
} from './contracts.js';

const MOCK_DISCLAIMER =
  'FICTIONAL MOCK DATA for development and testing only. It is not an election report and does not represent any real candidate, jurisdiction, provider, or result.';

const unknownProgress: ReportingProgress = {
  reportingUnits: { reported: null, total: null, percentage: null },
  precincts: { reported: null, total: null, percentage: null },
};

const mockSource = (
  updatedAt: string,
  overrides: Partial<SourceStatus> = {}
): SourceStatus => ({
  providerKey: 'mock_fixtures',
  name: 'Election Dashboard Fictional Fixture',
  url: 'https://fixtures.example.test/election-results',
  type: 'MOCK_FIXTURE',
  health: 'CURRENT',
  isMock: true,
  updatedAt,
  lastCheckedAt: updatedAt,
  lastSuccessfulAt: updatedAt,
  expectedUpdateIntervalSeconds: 120,
  ...overrides,
});

const candidate = (
  id: string,
  displayName: string,
  affiliation: string,
  ballotOrder: number
): Candidate => ({
  id,
  candidacyId: `${id}-candidacy`,
  displayName,
  party: { name: affiliation },
  ballotOrder,
  isWriteIn: false,
});

const result = (
  candidateValue: Candidate,
  votes: number,
  percentage: number,
  updatedAt: string
): CandidateResult => ({
  candidateId: candidateValue.id,
  candidacyId: candidateValue.candidacyId,
  votes,
  percentage,
  updatedAt,
});

const senateUpdatedAt = '2026-11-04T01:42:00.000Z';
const senateCandidates = [
  candidate('mock-senate-alex-north', 'Alex North', 'Example Affiliation A', 1),
  candidate('mock-senate-riley-vale', 'Riley Vale', 'Example Affiliation B', 2),
  candidate('mock-senate-write-in', 'Write-in candidates', 'Other', 3),
];

export const mockPartialSenateResultsFixture: ElectionResultsResponse = {
  data: {
    snapshotId: 'mock-snapshot-senate-partial-001',
    election: {
      id: 'mock-election-ex-general-2026',
      name: 'Example State 2026 General Election',
      electionDate: '2026-11-03',
      type: 'GENERAL',
      status: 'CLOSED',
      cycle: 2026,
      jurisdiction: {
        id: 'mock-state-ex',
        type: 'STATE',
        name: 'Example State',
        stateCode: 'EX',
      },
    },
    contest: {
      id: 'mock-contest-ex-senate',
      electionId: 'mock-election-ex-general-2026',
      sourceContestId: 'fixture-senate-001',
      officeType: 'US_SENATE',
      officeTitle: 'United States Senator — Example State',
      jurisdiction: {
        id: 'mock-state-ex',
        type: 'STATE',
        name: 'Example State',
        stateCode: 'EX',
      },
      seatName: 'Class II',
    },
    reportingUnit: {
      id: 'mock-state-ex',
      sourceUnitId: 'fixture-state-ex',
      type: 'STATE',
      name: 'Example State',
      stateCode: 'EX',
    },
    candidates: senateCandidates,
    candidateResults: [
      result(senateCandidates[0], 186_250, 51.41, senateUpdatedAt),
      result(senateCandidates[1], 172_800, 47.7, senateUpdatedAt),
      result(senateCandidates[2], 3_210, 0.89, senateUpdatedAt),
    ],
    reportingUnitResults: [
      {
        reportingUnit: {
          id: 'mock-county-ex-north',
          sourceUnitId: 'fixture-county-north',
          type: 'COUNTY',
          name: 'North County',
          stateCode: 'EX',
          countyFips: '99901',
          parentId: 'mock-state-ex',
        },
        candidateResults: [
          result(senateCandidates[0], 28_400, 53.68, senateUpdatedAt),
          result(senateCandidates[1], 23_950, 45.27, senateUpdatedAt),
          result(senateCandidates[2], 555, 1.05, senateUpdatedAt),
        ],
        totalVotes: 52_905,
        reportingProgress: {
          reportingUnits: { reported: 1, total: 1, percentage: 100 },
          precincts: { reported: 98, total: 120, percentage: 81.67 },
        },
        status: 'IN_PROGRESS',
        certificationState: 'UNOFFICIAL',
        updatedAt: senateUpdatedAt,
      },
      {
        reportingUnit: {
          id: 'mock-county-ex-lake',
          sourceUnitId: 'fixture-county-lake',
          type: 'COUNTY',
          name: 'Lake County',
          stateCode: 'EX',
          countyFips: '99903',
          parentId: 'mock-state-ex',
        },
        candidateResults: [
          result(senateCandidates[0], 18_150, 47.91, senateUpdatedAt),
          result(senateCandidates[1], 19_420, 51.26, senateUpdatedAt),
          result(senateCandidates[2], 315, 0.83, senateUpdatedAt),
        ],
        totalVotes: 37_885,
        reportingProgress: {
          reportingUnits: { reported: 1, total: 1, percentage: 100 },
          precincts: { reported: 76, total: 110, percentage: 69.09 },
        },
        status: 'IN_PROGRESS',
        certificationState: 'UNOFFICIAL',
        updatedAt: senateUpdatedAt,
      },
    ],
    totalVotes: 362_260,
    reportingProgress: {
      reportingUnits: { reported: 31, total: 50, percentage: 62 },
      precincts: { reported: 744, total: 1_200, percentage: 62 },
    },
    status: 'IN_PROGRESS',
    certificationState: 'UNOFFICIAL',
    updatedAt: senateUpdatedAt,
  },
  meta: {
    contractVersion: '1.0.0',
    generatedAt: senateUpdatedAt,
    updatedAt: senateUpdatedAt,
    dataMode: 'MOCK',
    isMockData: true,
    mockDisclaimer: MOCK_DISCLAIMER,
    responseStatus: 'PARTIAL',
    freshness: 'FRESH',
    coverage: 'PARTIAL',
    source: mockSource(senateUpdatedAt),
    limitations: [
      'Only a sample of fictional county reporting units is included.',
      'All totals, names, places, affiliations, and timestamps are invented test data.',
    ],
    request: {
      electionId: 'mock-election-ex-general-2026',
      contestId: 'mock-contest-ex-senate',
      reportingUnitId: 'mock-state-ex',
    },
  },
};

const houseUpdatedAt = '2026-11-04T01:05:00.000Z';
const houseGeneratedAt = '2026-11-04T01:35:00.000Z';
const houseCandidates = [
  candidate('mock-house-jordan-river', 'Jordan River', 'Example Affiliation A', 1),
  candidate('mock-house-morgan-field', 'Morgan Field', 'Example Affiliation B', 2),
];

export const mockStaleHouseResultsFixture: ElectionResultsResponse = {
  data: {
    snapshotId: 'mock-snapshot-house-stale-001',
    election: {
      id: 'mock-election-ex-general-2026',
      name: 'Example State 2026 General Election',
      electionDate: '2026-11-03',
      type: 'GENERAL',
      status: 'CLOSED',
      cycle: 2026,
      jurisdiction: {
        id: 'mock-state-ex',
        type: 'STATE',
        name: 'Example State',
        stateCode: 'EX',
      },
    },
    contest: {
      id: 'mock-contest-ex-house-07',
      electionId: 'mock-election-ex-general-2026',
      sourceContestId: 'fixture-house-007',
      officeType: 'US_HOUSE',
      officeTitle: 'United States Representative — Example District 7',
      jurisdiction: {
        id: 'mock-district-ex-07',
        type: 'CONGRESSIONAL_DISTRICT',
        name: 'Example State Congressional District 7',
        stateCode: 'EX',
        districtCode: '07',
      },
      districtCode: '07',
    },
    reportingUnit: {
      id: 'mock-district-ex-07',
      sourceUnitId: 'fixture-district-ex-07',
      type: 'CONGRESSIONAL_DISTRICT',
      name: 'Example State Congressional District 7',
      stateCode: 'EX',
      districtCode: '07',
    },
    candidates: houseCandidates,
    candidateResults: [
      result(houseCandidates[0], 71_200, 49.83, houseUpdatedAt),
      result(houseCandidates[1], 71_700, 50.17, houseUpdatedAt),
    ],
    reportingUnitResults: [],
    totalVotes: 142_900,
    reportingProgress: {
      reportingUnits: { reported: 18, total: 26, percentage: 69.23 },
      precincts: { reported: 283, total: 410, percentage: 69.02 },
    },
    status: 'DELAYED',
    certificationState: 'UNOFFICIAL',
    updatedAt: houseUpdatedAt,
  },
  meta: {
    contractVersion: '1.0.0',
    generatedAt: houseGeneratedAt,
    updatedAt: houseUpdatedAt,
    dataMode: 'MOCK',
    isMockData: true,
    mockDisclaimer: MOCK_DISCLAIMER,
    responseStatus: 'PARTIAL',
    freshness: 'STALE',
    coverage: 'PARTIAL',
    source: mockSource(houseUpdatedAt, {
      health: 'STALE',
      lastCheckedAt: houseGeneratedAt,
      message: 'Fictional fixture update is outside its expected refresh interval.',
    }),
    limitations: [
      'This fixture intentionally models delayed, stale, and incomplete reporting.',
      'No county-level breakdown is supplied for this fictional House contest.',
    ],
    request: {
      electionId: 'mock-election-ex-general-2026',
      contestId: 'mock-contest-ex-house-07',
      reportingUnitId: 'mock-district-ex-07',
    },
  },
};

const statewideUpdatedAt = '2026-11-20T17:00:00.000Z';
const statewideCandidates = [
  candidate('mock-statewide-sam-harbor', 'Sam Harbor', 'Example Affiliation A', 1),
  candidate('mock-statewide-taylor-grove', 'Taylor Grove', 'Example Affiliation B', 2),
];

export const mockCertifiedStatewideResultsFixture: ElectionResultsResponse = {
  data: {
    snapshotId: 'mock-snapshot-statewide-certified-001',
    election: {
      id: 'mock-election-ex-general-2026',
      name: 'Example State 2026 General Election',
      electionDate: '2026-11-03',
      type: 'GENERAL',
      status: 'CERTIFIED',
      cycle: 2026,
      jurisdiction: {
        id: 'mock-state-ex',
        type: 'STATE',
        name: 'Example State',
        stateCode: 'EX',
      },
    },
    contest: {
      id: 'mock-contest-ex-auditor',
      electionId: 'mock-election-ex-general-2026',
      sourceContestId: 'fixture-statewide-001',
      officeType: 'STATEWIDE_EXECUTIVE',
      officeTitle: 'Example State Auditor',
      jurisdiction: {
        id: 'mock-state-ex',
        type: 'STATE',
        name: 'Example State',
        stateCode: 'EX',
      },
    },
    reportingUnit: {
      id: 'mock-state-ex',
      sourceUnitId: 'fixture-state-ex',
      type: 'STATE',
      name: 'Example State',
      stateCode: 'EX',
    },
    candidates: statewideCandidates,
    candidateResults: [
      result(statewideCandidates[0], 621_400, 52, statewideUpdatedAt),
      result(statewideCandidates[1], 573_600, 48, statewideUpdatedAt),
    ],
    reportingUnitResults: [],
    totalVotes: 1_195_000,
    reportingProgress: {
      reportingUnits: { reported: 50, total: 50, percentage: 100 },
      precincts: { reported: 1_800, total: 1_800, percentage: 100 },
    },
    status: 'COMPLETE',
    certificationState: 'CERTIFIED',
    updatedAt: statewideUpdatedAt,
  },
  meta: {
    contractVersion: '1.0.0',
    generatedAt: statewideUpdatedAt,
    updatedAt: statewideUpdatedAt,
    dataMode: 'MOCK',
    isMockData: true,
    mockDisclaimer: MOCK_DISCLAIMER,
    responseStatus: 'AVAILABLE',
    freshness: 'FRESH',
    coverage: 'COMPLETE',
    source: mockSource(statewideUpdatedAt, { expectedUpdateIntervalSeconds: null }),
    limitations: ['This certified statewide result is entirely fictional test data.'],
    request: {
      electionId: 'mock-election-ex-general-2026',
      contestId: 'mock-contest-ex-auditor',
      reportingUnitId: 'mock-state-ex',
    },
  },
};

const countyUpdatedAt = '2026-11-04T02:10:00.000Z';
const countyCandidates = [
  candidate('mock-county-casey-meadow', 'Casey Meadow', 'Nonpartisan', 1),
  candidate('mock-county-drew-summit', 'Drew Summit', 'Nonpartisan', 2),
];

export const mockCountyResultsFixture: ElectionResultsResponse = {
  data: {
    snapshotId: 'mock-snapshot-county-partial-001',
    election: {
      id: 'mock-election-north-county-2026',
      name: 'North County 2026 General Election',
      electionDate: '2026-11-03',
      type: 'GENERAL',
      status: 'CANVASSING',
      cycle: 2026,
      jurisdiction: {
        id: 'mock-county-ex-north',
        type: 'COUNTY',
        name: 'North County',
        stateCode: 'EX',
        countyFips: '99901',
      },
    },
    contest: {
      id: 'mock-contest-north-county-clerk',
      electionId: 'mock-election-north-county-2026',
      sourceContestId: 'fixture-county-office-001',
      officeType: 'COUNTY_OFFICE',
      officeTitle: 'North County Clerk',
      jurisdiction: {
        id: 'mock-county-ex-north',
        type: 'COUNTY',
        name: 'North County',
        stateCode: 'EX',
        countyFips: '99901',
      },
    },
    reportingUnit: {
      id: 'mock-county-ex-north',
      sourceUnitId: 'fixture-county-north',
      type: 'COUNTY',
      name: 'North County',
      stateCode: 'EX',
      countyFips: '99901',
    },
    candidates: countyCandidates,
    candidateResults: [
      result(countyCandidates[0], 19_870, 50.66, countyUpdatedAt),
      result(countyCandidates[1], 19_350, 49.34, countyUpdatedAt),
    ],
    reportingUnitResults: [],
    totalVotes: 39_220,
    reportingProgress: {
      reportingUnits: { reported: 1, total: 1, percentage: 100 },
      precincts: { reported: 104, total: 120, percentage: 86.67 },
    },
    status: 'IN_PROGRESS',
    certificationState: 'UNOFFICIAL',
    updatedAt: countyUpdatedAt,
  },
  meta: {
    contractVersion: '1.0.0',
    generatedAt: countyUpdatedAt,
    updatedAt: countyUpdatedAt,
    dataMode: 'MOCK',
    isMockData: true,
    mockDisclaimer: MOCK_DISCLAIMER,
    responseStatus: 'PARTIAL',
    freshness: 'FRESH',
    coverage: 'PARTIAL',
    source: mockSource(countyUpdatedAt),
    limitations: [
      'This fixture models one fictional county office and is outside the federal beta scope.',
      'Precinct reporting is incomplete and the result is not certified.',
    ],
    request: {
      electionId: 'mock-election-north-county-2026',
      contestId: 'mock-contest-north-county-clerk',
      reportingUnitId: 'mock-county-ex-north',
    },
  },
};

const unavailableAt = '2026-11-04T02:20:00.000Z';

export const mockUnavailableResultsFixture: ElectionResultsResponse = {
  data: null,
  meta: {
    contractVersion: '1.0.0',
    generatedAt: unavailableAt,
    updatedAt: unavailableAt,
    dataMode: 'MOCK',
    isMockData: true,
    mockDisclaimer: MOCK_DISCLAIMER,
    responseStatus: 'UNAVAILABLE',
    freshness: 'UNKNOWN',
    coverage: 'NONE',
    source: mockSource(unavailableAt, {
      health: 'UNAVAILABLE',
      lastSuccessfulAt: null,
      message: 'Fictional source is unavailable for explicit UI-state testing.',
    }),
    limitations: [
      'No result data is available in this fixture.',
      'The last valid result must remain visible separately if one exists.',
    ],
    request: {
      electionId: 'mock-election-ex-general-2026',
      contestId: 'mock-contest-ex-unavailable',
      reportingUnitId: 'mock-county-ex-harbor',
    },
  },
};

export const mockElectionResultsFixtures = [
  mockPartialSenateResultsFixture,
  mockStaleHouseResultsFixture,
  mockCertifiedStatewideResultsFixture,
  mockCountyResultsFixture,
  mockUnavailableResultsFixture,
] as const;

export const mockElectionResultsFeatureFlags: ElectionResultsFeatureFlags = {
  dashboardEnabled: true,
  providers: {
    mock_fixtures: {
      providerKey: 'mock_fixtures',
      enabled: true,
      dataMode: 'MOCK',
      reason: 'Explicitly enabled for local development and beta UI testing.',
    },
  },
};

export { MOCK_DISCLAIMER, unknownProgress };
