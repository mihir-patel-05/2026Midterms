import type {
  CandidateContract,
  ElectionDashboardFixture,
  StateMapItemViewModel,
} from "./types";

export const MOCK_NOTICE =
  "Demonstration only: every candidate, contest, vote, reporting percentage, finance amount, and update event on this dashboard is fictional mock data.";

export const stateMapItems: StateMapItemViewModel[] = [
  ["AK", "Alaska", 8, 1], ["ME", "Maine", 1, 12], ["VT", "Vermont", 2, 10], ["NH", "New Hampshire", 2, 11],
  ["WA", "Washington", 3, 1], ["ID", "Idaho", 3, 2], ["MT", "Montana", 3, 3], ["ND", "North Dakota", 3, 4],
  ["MN", "Minnesota", 3, 5], ["WI", "Wisconsin", 3, 6], ["MI", "Michigan", 3, 7], ["NY", "New York", 3, 9],
  ["MA", "Massachusetts", 3, 10], ["OR", "Oregon", 4, 1], ["NV", "Nevada", 4, 2], ["WY", "Wyoming", 4, 3],
  ["SD", "South Dakota", 4, 4], ["IA", "Iowa", 4, 5], ["IL", "Illinois", 4, 6], ["IN", "Indiana", 4, 7],
  ["OH", "Ohio", 4, 8], ["PA", "Pennsylvania", 4, 9], ["NJ", "New Jersey", 4, 10], ["CT", "Connecticut", 4, 11],
  ["RI", "Rhode Island", 4, 12], ["CA", "California", 5, 1], ["UT", "Utah", 5, 2], ["CO", "Colorado", 5, 3],
  ["NE", "Nebraska", 5, 4], ["MO", "Missouri", 5, 5], ["KY", "Kentucky", 5, 6], ["WV", "West Virginia", 5, 7],
  ["VA", "Virginia", 5, 8], ["MD", "Maryland", 5, 9], ["DE", "Delaware", 5, 10], ["AZ", "Arizona", 6, 2],
  ["NM", "New Mexico", 6, 3], ["KS", "Kansas", 6, 4], ["AR", "Arkansas", 6, 5], ["TN", "Tennessee", 6, 6],
  ["NC", "North Carolina", 6, 8], ["SC", "South Carolina", 6, 9], ["OK", "Oklahoma", 7, 4], ["LA", "Louisiana", 7, 5],
  ["MS", "Mississippi", 7, 6], ["AL", "Alabama", 7, 7], ["GA", "Georgia", 7, 8], ["HI", "Hawaii", 8, 2],
  ["TX", "Texas", 8, 5], ["FL", "Florida", 8, 9],
].map(([code, name, row, column], index) => ({
  code: String(code),
  name: String(name),
  row: Number(row),
  column: Number(column),
  coverage: index % 7 === 0 ? "NONE" : index % 4 === 0 ? "PARTIAL" : "COMPLETE",
}));

const updatedAt = "2026-11-04T02:15:00.000Z";
const mockStateJurisdiction = {
  id: "mock-state-mi",
  type: "STATE" as const,
  name: "Michigan — fictional dashboard scenario",
  stateCode: "MI",
};

const candidateRows: Array<[string, string, string, number]> = [
  ["mock-jordan-lee", "Jordan Lee", "Example Affiliation A", 1],
  ["mock-morgan-ruiz", "Morgan Ruiz", "Example Affiliation B", 2],
  ["mock-casey-patel", "Casey Patel", "Independent example", 3],
  ["mock-taylor-brooks", "Taylor Brooks", "Example Affiliation B", 1],
  ["mock-riley-chen", "Riley Chen", "Example Affiliation A", 2],
  ["mock-avery-morgan", "Avery Morgan", "Independent example", 3],
  ["mock-alex-monroe", "Alex Monroe", "Example Affiliation C", 1],
  ["mock-sam-diaz", "Sam Diaz", "Example Affiliation D", 2],
  ["mock-robin-shah", "Robin Shah", "Example Local List A", 1],
  ["mock-drew-kim", "Drew Kim", "Example Local List B", 2],
];

const candidates: CandidateContract[] = candidateRows.map(
  ([id, displayName, partyName, ballotOrder]) => ({
    id,
    candidacyId: `${id}-candidacy`,
    displayName,
    party: { name: partyName },
    ballotOrder,
    isWriteIn: false,
  }),
);

const resultRows: Array<[string, number, number, Array<[string, number, number]>]> = [
  ["mock-house-07", 62, 100, [["mock-jordan-lee", 109584, 51.2], ["mock-morgan-ruiz", 101446, 47.4], ["mock-casey-patel", 2812, 1.4]]],
  ["mock-senate", 71, 100, [["mock-taylor-brooks", 1203948, 49.8], ["mock-riley-chen", 1193472, 49.3], ["mock-avery-morgan", 21867, 0.9]]],
  ["mock-statewide", 48, 100, [["mock-alex-monroe", 589210, 50.5], ["mock-sam-diaz", 577621, 49.5]]],
  ["mock-county", 23, 40, [["mock-robin-shah", 42862, 52.1], ["mock-drew-kim", 39405, 47.9]]],
];

export const electionDashboardFixture: ElectionDashboardFixture = {
  election: {
    id: "mock-election-2026",
    name: "2026 fictional demonstration election",
    electionDate: "2026-11-03",
    type: "GENERAL",
    status: "CLOSED",
    cycle: 2026,
    jurisdiction: mockStateJurisdiction,
  },
  contests: [
    {
      id: "mock-house-07",
      electionId: "mock-election-2026",
      sourceContestId: "fixture-house-07",
      officeType: "US_HOUSE",
      officeTitle: "U.S. House — Mock District 07",
      jurisdiction: { ...mockStateJurisdiction, id: "mock-district-mi-07", type: "CONGRESSIONAL_DISTRICT", districtCode: "07" },
      districtCode: "07",
      candidateIds: ["mock-jordan-lee", "mock-morgan-ruiz", "mock-casey-patel"],
    },
    {
      id: "mock-senate",
      electionId: "mock-election-2026",
      sourceContestId: "fixture-senate",
      officeType: "US_SENATE",
      officeTitle: "U.S. Senate — Mock Statewide",
      jurisdiction: mockStateJurisdiction,
      candidateIds: ["mock-taylor-brooks", "mock-riley-chen", "mock-avery-morgan"],
    },
    {
      id: "mock-statewide",
      electionId: "mock-election-2026",
      sourceContestId: "fixture-statewide",
      officeType: "STATEWIDE_EXECUTIVE",
      officeTitle: "Fictional Statewide Office",
      jurisdiction: mockStateJurisdiction,
      candidateIds: ["mock-alex-monroe", "mock-sam-diaz"],
    },
    {
      id: "mock-county",
      electionId: "mock-election-2026",
      sourceContestId: "fixture-county",
      officeType: "COUNTY_OFFICE",
      officeTitle: "Fictional Sample County Contest",
      jurisdiction: { ...mockStateJurisdiction, id: "mock-county-mi-example", type: "COUNTY", name: "Fictional Sample County" },
      candidateIds: ["mock-robin-shah", "mock-drew-kim"],
    },
  ],
  candidates,
  results: resultRows.map(([contestId, reported, total, rows]) => ({
    contestId,
    status: "IN_PROGRESS",
    certificationState: "UNOFFICIAL",
    reportingProgress: {
      reportingUnits: { reported, total, percentage: (reported / total) * 100 },
      precincts: { reported, total, percentage: (reported / total) * 100 },
    },
    totalVotes: rows.reduce((sum, [, votes]) => sum + votes, 0),
    candidateResults: rows.map(([candidateId, votes, percentage]) => ({
      candidateId,
      candidacyId: `${candidateId}-candidacy`,
      votes,
      percentage,
      updatedAt,
    })),
    reportingUnits: [
      { reportingUnit: { id: "mock-unit-central", name: "Central mock reporting unit", type: "COUNTY", stateCode: "MI" }, reported: 18, total: 20 },
      { reportingUnit: { id: "mock-unit-north", name: "North mock reporting unit", type: "COUNTY", stateCode: "MI" }, reported: 16, total: 20 },
      { reportingUnit: { id: "mock-unit-south", name: "South mock reporting unit", type: "COUNTY", stateCode: "MI" }, reported: 13, total: 20 },
    ],
    updatedAt,
  })),
  finance: [
    ["mock-jordan-lee", 6800000, 4700000, 1900000, 82000, 742000, 416000],
    ["mock-morgan-ruiz", 5900000, 4400000, 1400000, 121000, 504000, 618000],
    ["mock-taylor-brooks", 14200000, 10100000, 3800000, 164000, 1100000, 890000],
    ["mock-riley-chen", 13600000, 10000000, 3200000, 98000, 940000, 1020000],
  ].map(([candidateId, receipts, disbursements, cashOnHand, debts, supportingOutsideSpending, opposingOutsideSpending]) => ({
    candidateId: String(candidateId),
    coverageStart: "2025-01-01",
    coverageEnd: "2026-08-31",
    reportLabel: "Fictional periodic filing",
    receipts: Number(receipts),
    disbursements: Number(disbursements),
    cashOnHand: Number(cashOnHand),
    debts: Number(debts),
    supportingOutsideSpending: Number(supportingOutsideSpending),
    opposingOutsideSpending: Number(opposingOutsideSpending),
    isMock: true,
  })),
  sourceStatus: {
    providerKey: "mock_fixtures",
    name: "Local fictional results fixture",
    url: "https://example.invalid/fixtures/election-results",
    type: "MOCK_FIXTURE",
    health: "DEGRADED",
    isMock: true,
    updatedAt,
    lastCheckedAt: updatedAt,
    lastSuccessfulAt: updatedAt,
    expectedUpdateIntervalSeconds: 60,
    message: "Fictional fixture with intentionally partial coverage.",
  },
  metadata: {
    contractVersion: "1.0.0",
    generatedAt: updatedAt,
    updatedAt,
    dataMode: "MOCK",
    isMockData: true,
    mockDisclaimer: MOCK_NOTICE,
    responseStatus: "PARTIAL",
    freshness: "FRESH",
    coverage: "PARTIAL",
    source: {
      providerKey: "mock_fixtures",
      name: "Local fictional results fixture",
      url: "https://example.invalid/fixtures/election-results",
      type: "MOCK_FIXTURE",
      health: "DEGRADED",
      isMock: true,
      updatedAt,
      lastCheckedAt: updatedAt,
      lastSuccessfulAt: updatedAt,
      expectedUpdateIntervalSeconds: 60,
    },
    limitations: ["Mock fixture only", "Coverage is intentionally partial", "No licensed results provider is configured"],
    request: { electionId: "mock-election-2026", contestId: "mock-house-07", reportingUnitId: "mock-state-mi" },
  },
};
