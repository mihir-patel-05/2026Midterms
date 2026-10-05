import type {
  CertificationState,
  ContestOfficeType,
  ReportingUnitType,
  ResponseMetadataContract,
  ResultStatus,
} from "@/features/election-dashboard/types";

/**
 * View model for the new election monitor. Real FEC/election data and the
 * flagged mock results feed are both normalised into these shapes, so panels
 * never need to know where a value came from beyond `isFictional`/`meta`.
 */
export type OfficeFilter = "ALL" | "US_SENATE" | "US_HOUSE";
export type MapLayer = "states" | "districts" | "counties";
export type DetailTab = "overview" | "counties" | "finance";
/** Map readiness: ready = contests and finance; partial = contests only; pending = nothing loaded. */
export type Readiness = "ready" | "partial" | "pending";

export interface MonitorStateSummary {
  code: string;
  name: string;
  /** null while counts are unknown (loading or API unavailable), never 0 by default. */
  contests: number | null;
  readiness: Readiness;
  /** The fictional "EX" state that hosts mock results fixtures. */
  isFictional?: boolean;
}

export interface MonitorCandidate {
  id: string;
  /** VoteInformed candidate id for /candidates/:id; absent for fictional candidates. */
  profileId?: string;
  fecId?: string;
  name: string;
  party: string | null;
  isIncumbent: boolean;
  ballotStatus?: "CONFIRMED" | "UNCONFIRMED";
  /** FEC headline totals for the cycle; null when no filing is on file. */
  receipts?: number | null;
  cashOnHand?: number | null;
}

export interface MonitorContest {
  id: string;
  stateCode: string;
  office: ContestOfficeType;
  /** Two-digit district for House contests ("00" for at-large), otherwise null. */
  district: string | null;
  title: string;
  electionDate: string | null;
  electionType: string;
  candidates: MonitorCandidate[];
  isFictional?: boolean;
}

export interface MonitorReportingUnit {
  id: string;
  name: string;
  type: ReportingUnitType;
  countyFips?: string;
  reported: number | null;
  total: number | null;
}

export interface MonitorResults {
  contestId: string;
  status: ResultStatus;
  certificationState: CertificationState;
  totalVotes: number;
  reported: number | null;
  total: number | null;
  reportingPercent: number | null;
  candidates: Array<{ candidateId: string; votes: number; percentage: number }>;
  units: MonitorReportingUnit[];
  updatedAt: string;
  meta: ResponseMetadataContract;
}
