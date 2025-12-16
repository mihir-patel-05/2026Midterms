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
