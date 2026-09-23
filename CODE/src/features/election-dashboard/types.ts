/**
 * Browser-safe mirrors of backend/src/features/election-results/contracts.ts.
 * Keep enum values and normalized field names synchronized with that schema.
 * Zod validation remains server-owned; the UI consumes validated responses.
 */
export const RESULT_CONTRACT_VERSION = "1.0.0" as const;

export type DataMode = "MOCK" | "LIVE";
export type ElectionType = "PRIMARY" | "GENERAL" | "RUNOFF" | "SPECIAL";
export type ElectionStatus = "SCHEDULED" | "OPEN" | "CLOSED" | "CANVASSING" | "CERTIFIED";
export type ContestOfficeType = "US_SENATE" | "US_HOUSE" | "STATEWIDE_EXECUTIVE" | "COUNTY_OFFICE" | "OTHER";
export type JurisdictionType = "NATIONAL" | "STATE" | "CONGRESSIONAL_DISTRICT" | "COUNTY" | "PRECINCT" | "OTHER";
export type ReportingUnitType = "STATE" | "CONGRESSIONAL_DISTRICT" | "COUNTY" | "PRECINCT" | "SPLIT_PRECINCT" | "OTHER";
export type ResultStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "DELAYED" | "UNAVAILABLE";
export type CertificationState = "UNOFFICIAL" | "PARTIALLY_CERTIFIED" | "CERTIFIED";
export type SourceHealth = "CURRENT" | "DEGRADED" | "STALE" | "UNAVAILABLE" | "NOT_CONFIGURED";
export type SourceType = "MOCK_FIXTURE" | "LICENSED_PROVIDER" | "STATE_OFFICIAL" | "LOCAL_OFFICIAL" | "OTHER";
export type ResponseStatus = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
export type FreshnessStatus = "FRESH" | "STALE" | "UNKNOWN";
export type CoverageStatus = "COMPLETE" | "PARTIAL" | "NONE" | "UNKNOWN";

export interface JurisdictionContract {
  id: string;
  type: JurisdictionType;
  name: string;
  stateCode?: string;
  districtCode?: string;
  countyFips?: string;
}

export interface ElectionContract {
  id: string;
  name: string;
  electionDate: string;
  type: ElectionType;
  status: ElectionStatus;
  cycle: number;
  jurisdiction: JurisdictionContract;
}

export interface ContestContract {
  id: string;
  electionId: string;
  sourceContestId?: string;
  officeType: ContestOfficeType;
  officeTitle: string;
  jurisdiction: JurisdictionContract;
  districtCode?: string;
  seatName?: string;
}

export interface CandidateContract {
  id: string;
  candidacyId: string;
  displayName: string;
  party: { name: string; abbreviation?: string } | null;
  ballotOrder?: number;
  isWriteIn: boolean;
}

export interface ReportingUnitContract {
  id: string;
  sourceUnitId?: string;
  type: ReportingUnitType;
  name: string;
  stateCode: string;
  districtCode?: string;
  countyFips?: string;
  parentId?: string;
}

export interface CandidateResultContract {
  candidateId: string;
  candidacyId: string;
  votes: number;
  percentage: number;
  updatedAt: string;
}

export interface ProgressCountContract {
  reported: number | null;
  total: number | null;
  percentage: number | null;
}

export interface ReportingProgressContract {
  reportingUnits: ProgressCountContract;
  precincts: ProgressCountContract;
}

export interface SourceStatusContract {
  providerKey: string;
  name: string;
  url: string;
  type: SourceType;
  health: SourceHealth;
  isMock: boolean;
  updatedAt: string;
  lastCheckedAt: string;
  lastSuccessfulAt: string | null;
  expectedUpdateIntervalSeconds: number | null;
  message?: string;
}

export interface ResponseMetadataContract {
  contractVersion: typeof RESULT_CONTRACT_VERSION;
  generatedAt: string;
  updatedAt: string;
  dataMode: DataMode;
  isMockData: boolean;
  mockDisclaimer?: string;
  responseStatus: ResponseStatus;
  freshness: FreshnessStatus;
  coverage: CoverageStatus;
  source: SourceStatusContract;
  limitations: string[];
  request: {
    electionId?: string;
    contestId?: string;
    reportingUnitId?: string;
  };
}

/** UI projections derived from the normalized response at the API boundary. */
export interface ContestViewModel extends ContestContract {
  candidateIds: string[];
}

export interface ReportingUnitProgressViewModel {
  reportingUnit: ReportingUnitContract;
  reported: number | null;
  total: number | null;
}

export interface ContestResultViewModel {
  contestId: string;
  status: ResultStatus;
  certificationState: CertificationState;
  reportingProgress: ReportingProgressContract;
  totalVotes: number;
  candidateResults: CandidateResultContract[];
  reportingUnits: ReportingUnitProgressViewModel[];
  updatedAt: string;
}

export interface FinanceSummaryViewModel {
  candidateId: string;
  coverageStart: string;
  coverageEnd: string;
  reportLabel: string;
  receipts: number;
  disbursements: number;
  cashOnHand: number;
  debts: number;
  supportingOutsideSpending: number;
  opposingOutsideSpending: number;
  isMock: true;
}

export interface StateMapItemViewModel {
  code: string;
  name: string;
  row: number;
  column: number;
  coverage: CoverageStatus;
}

export interface ElectionDashboardFixture {
  election: ElectionContract;
  contests: ContestViewModel[];
  candidates: CandidateContract[];
  results: ContestResultViewModel[];
  finance: FinanceSummaryViewModel[];
  sourceStatus: SourceStatusContract;
  metadata: ResponseMetadataContract;
}

export interface ElectionResultsResponseContract {
  data: ({
    snapshotId: string;
    election: ElectionContract;
    contest: ContestContract;
    reportingUnit: ReportingUnitContract;
    candidates: CandidateContract[];
    candidateResults: CandidateResultContract[];
    totalVotes: number;
    reportingProgress: ReportingProgressContract;
    status: ResultStatus;
    certificationState: CertificationState;
    updatedAt: string;
    reportingUnitResults: Array<{
      reportingUnit: ReportingUnitContract;
      reportingProgress: ReportingProgressContract;
    }>;
  }) | null;
  meta: ResponseMetadataContract;
}

export interface DashboardBootstrapResponse {
  data: {
    manifest: { version: string; states: Array<{ code: string; name: string; coverage: CoverageStatus }> };
    results: ElectionResultsResponseContract[];
  };
  meta: ResponseMetadataContract;
}

export type DashboardViewState = "ready" | "loading" | "stale" | "partial" | "unavailable";
export type DashboardOfficeFilter = "ALL" | "US_SENATE" | "US_HOUSE" | "STATEWIDE_EXECUTIVE" | "COUNTY_OFFICE";
