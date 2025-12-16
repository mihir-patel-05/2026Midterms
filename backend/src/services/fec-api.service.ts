import { fecClient } from '../config/fec-client.js';

// FEC API Response Types
export interface FECCandidate {
  candidate_id: string;
  name: string;
  party?: string;
  party_full?: string;
  office?: string;
  office_full?: string;
  state?: string;
  district?: string;
  incumbent_challenge?: string;
  incumbent_challenge_full?: string;
  candidate_status?: string;
  active_through?: number;
  cycles?: number[];
  election_years?: number[];
}

export interface FECCommittee {
  committee_id: string;
  name: string;
  committee_type?: string;
  committee_type_full?: string;
  designation?: string;
  designation_full?: string;
  candidate_ids?: string[];
  party?: string;
  party_full?: string;
  state?: string;
}

export interface FECFinancialSummary {
  committee_id: string;
  cycle: number;
  total_receipts?: number;
  total_disbursements?: number;
  cash_on_hand_end_period?: number;
  debts_owed_by_committee?: number;
  coverage_end_date?: string;
  last_cash_on_hand_end_period?: number;
  last_debts_owed_by_committee?: number;
}

export interface FECReceipt {
  committee: {
    committee_id: string;
    name?: string;
  };
  contributor_name?: string;
  contributor_state?: string;
  contributor_city?: string;
  contributor_employer?: string;
  contributor_occupation?: string;
  contribution_receipt_amount?: number;
  contribution_receipt_date?: string;
  receipt_type?: string;
  receipt_type_full?: string;
  image_number?: string;
}

export interface FECDisbursement {
  committee: {
    committee_id: string;
    name?: string;
  };
  recipient_name?: string;
  disbursement_type?: string;
  disbursement_type_description?: string;
  disbursement_amount?: number;
  disbursement_date?: string;
  disbursement_description?: string;
  image_number?: string;
}

/**
 * Service for interacting with the FEC API
 */
export class FECApiService {
  /**
   * Get candidates by state and cycle
   */
  async getCandidates(params: {
    state?: string;
    office?: string;
    cycle?: number;
    page?: number;
    perPage?: number;
  }): Promise<FECCandidate[]> {
    const { state, office, cycle, page = 1, perPage = 100 } = params;

    const response = await fecClient.get<FECCandidate>('/candidates/', {
      params: {
        state,
        office,
        election_year: cycle,
        page,
        per_page: perPage,
      },
    });

    return response.data.results;
  }

  /**
   * Get all candidates for a specific state and cycle
   */
  async getAllCandidates(params: {
    state?: string;
    office?: string;
    cycle?: number;
    maxPages?: number;
  }): Promise<FECCandidate[]> {
    const { state, office, cycle, maxPages = 10 } = params;

    return fecClient.getAll<FECCandidate>(
      '/candidates/',
      {
        state,
        office,
        election_year: cycle,
      },
      maxPages
    );
  }

  /**
   * Get a specific candidate by ID
   */
  async getCandidateById(candidateId: string): Promise<FECCandidate | null> {
    try {
      const response = await fecClient.get<FECCandidate>(`/candidate/${candidateId}/`);
      return response.data.results[0] || null;
    } catch (error) {
      console.error(`Error fetching candidate ${candidateId}:`, error);
      return null;
    }
  }

  /**
   * Get committees for a candidate
   */
  async getCommittees(candidateId: string): Promise<FECCommittee[]> {
    const response = await fecClient.get<FECCommittee>(`/candidate/${candidateId}/committees/`);
    return response.data.results;
  }

  /**
   * Get financial totals for a committee
   */
  async getFinancialSummary(committeeId: string, cycle?: number): Promise<FECFinancialSummary[]> {
    const response = await fecClient.get<FECFinancialSummary>(`/committee/${committeeId}/totals/`, {
      params: cycle ? { cycle } : {},
    });
    return response.data.results;
  }

  /**
   * Get itemized receipts (Schedule A) for a committee
   */
  async getReceipts(params: {
    committeeId: string;
    twoYearTransactionPeriod?: number;
    minDate?: string;
    maxDate?: string;
    page?: number;
    perPage?: number;
  }): Promise<FECReceipt[]> {
    const { committeeId, twoYearTransactionPeriod, minDate, maxDate, page = 1, perPage = 100 } = params;

    const response = await fecClient.get<FECReceipt>('/schedules/schedule_a/', {
      params: {
        committee_id: committeeId,
        two_year_transaction_period: twoYearTransactionPeriod,
        min_date: minDate,
        max_date: maxDate,
        page,
        per_page: perPage,
        sort: '-contribution_receipt_date',
      },
    });

    return response.data.results;
  }

  /**
   * Get all receipts for a committee (limited by maxPages)
   */
  async getAllReceipts(params: {
    committeeId: string;
    twoYearTransactionPeriod?: number;
    minDate?: string;
    maxDate?: string;
    maxPages?: number;
  }): Promise<FECReceipt[]> {
    const { committeeId, twoYearTransactionPeriod, minDate, maxDate, maxPages = 5 } = params;

    return fecClient.getAll<FECReceipt>(
      '/schedules/schedule_a/',
      {
        committee_id: committeeId,
        two_year_transaction_period: twoYearTransactionPeriod,
        min_date: minDate,
        max_date: maxDate,
        sort: '-contribution_receipt_date',
      },
      maxPages
    );
  }

  /**
   * Get itemized disbursements (Schedule B) for a committee
   */
  async getDisbursements(params: {
    committeeId: string;
    twoYearTransactionPeriod?: number;
    minDate?: string;
    maxDate?: string;
    page?: number;
    perPage?: number;
  }): Promise<FECDisbursement[]> {
    const { committeeId, twoYearTransactionPeriod, minDate, maxDate, page = 1, perPage = 100 } = params;

    const response = await fecClient.get<FECDisbursement>('/schedules/schedule_b/', {
      params: {
        committee_id: committeeId,
        two_year_transaction_period: twoYearTransactionPeriod,
        min_date: minDate,
        max_date: maxDate,
        page,
        per_page: perPage,
        sort: '-disbursement_date',
      },
    });

    return response.data.results;
  }

  /**
   * Get all disbursements for a committee (limited by maxPages)
   */
  async getAllDisbursements(params: {
    committeeId: string;
    twoYearTransactionPeriod?: number;
    minDate?: string;
    maxDate?: string;
    maxPages?: number;
  }): Promise<FECDisbursement[]> {
    const { committeeId, twoYearTransactionPeriod, minDate, maxDate, maxPages = 5 } = params;

    return fecClient.getAll<FECDisbursement>(
      '/schedules/schedule_b/',
      {
        committee_id: committeeId,
        two_year_transaction_period: twoYearTransactionPeriod,
        min_date: minDate,
        max_date: maxDate,
        sort: '-disbursement_date',
      },
      maxPages
    );
  }
}

// Export singleton instance
export const fecApiService = new FECApiService();
