/**
 * TypeScript interfaces for Candidate data
 * Matches backend API response structure
 */

/**
 * Social media handles for a candidate
 */
export interface SocialMedia {
  twitter?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
  [key: string]: string | undefined; // Allow additional platforms
}

/**
 * Committee associated with a candidate
 */
export interface Committee {
  id: string;
  committeeId: string;
  name: string;
  committeeType?: string;
  designation?: string;
  candidateId?: string;
  party?: string;
  state?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ideology score for a candidate
 */
export interface IdeologyScore {
  id: string;
  candidateId: string;
  congressSession: number;
  ideologyScore?: number;
  leadershipScore?: number;
  billsSponsored: number;
  billsCosponsored: number;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Main Candidate interface
 */
export interface Candidate {
  id: string;
  candidateId: string;
  name: string;
  party?: string;
  office: string; // "HOUSE" | "SENATE"
  district?: string;
  state: string;
  incumbentStatus?: string;
  activeThrough?: number;
  cycles: number[];
  electionYears: number[];
  candidateStatus?: string;

  // Detail fields
  biography?: string;
  currentOfficeHeld?: string;
  campaignWebsite?: string;
  socialMedia?: SocialMedia;

  // Timestamps
  createdAt: string;
  updatedAt: string;

  // Relations (optional, only included in detail view)
  committees?: Committee[];
  ideologyScores?: IdeologyScore[];

  // Computed fields (when includeFunds=true)
  totalFundsRaised?: number;
  incumbent?: boolean;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Paginated response wrapper for candidate list
 */
export interface CandidatesResponse {
  data: Candidate[];
  pagination: PaginationMeta;
}

/**
 * Query parameters for getCandidates
 */
export interface GetCandidatesParams {
  state?: string;
  office?: string;
  party?: string;
  cycle?: number;
  page?: number;
  perPage?: number;
  includeFunds?: boolean;
}

/**
 * API Error response
 */
export interface ApiError {
  error: string;
  message?: string;
  stack?: string;
}

/**
 * Financial summary for a committee
 */
export interface FinancialSummary {
  id: string;
  committeeId: string;
  cycle: number;
  totalReceipts: number;
  totalDisbursements: number;
  cashOnHand: number;
  debtOwed: number;
  coverageEndDate?: string;
  lastUpdated: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Finance data for a candidate's committee
 */
export interface CommitteeFinance {
  committee: Committee;
  summary: FinancialSummary | null;
}

/**
 * Full finance response for a candidate
 */
export interface CandidateFinanceResponse {
  candidate: {
    id: string;
    candidateId: string;
    name: string;
  };
  finances: CommitteeFinance[];
}

/**
 * Funding source breakdown (Individual, PAC, Party, Self-funded)
 */
export interface FundingSource {
  type: string;
  amount: number;
  percentage: number;
}

/**
 * Top donor/contributor information
 */
export interface TopDonor {
  name: string;
  employer: string | null;
  occupation: string | null;
  amount: number;
  state: string | null;
}

/**
 * Spending category breakdown
 */
export interface SpendingCategory {
  category: string;
  amount: number;
  percentage: number;
}

/**
 * Detailed finance summary
 */
export interface DetailedFinanceSummary {
  totalReceipts: number;
  totalDisbursements: number;
  cashOnHand: number;
  debtOwed: number;
  individualContributions: number;
  pacContributions: number;
  partyContributions: number;
  selfFunded: number;
  lastUpdated: string | null;
}

/**
 * Full detailed finance response for a candidate
 * Includes funding sources, top donors, and spending breakdown
 */
export interface DetailedFinanceResponse {
  summary: DetailedFinanceSummary;
  fundingSources: FundingSource[];
  topDonors: TopDonor[];
  spendingCategories: SpendingCategory[];
  lastSynced: string;
}
