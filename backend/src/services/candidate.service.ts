import { prisma } from '../config/database.js';
import { Candidate, Committee } from '@prisma/client';
import { fecApiService, FECCandidate, FECCommittee } from './fec-api.service.js';
import { getPaginationParams, createPaginationResult, PaginationResult } from '../utils/pagination.js';

/**
 * Service for managing candidates in the database
 */
export class CandidateService {
  /**
   * Normalize office value to match database format
   * Converts 'HOUSE'/'SENATE' to 'H'/'S' and handles both formats
   */
  private normalizeOffice(office?: string): string | undefined {
    if (!office) return undefined;
    
    const normalized = office.toUpperCase();
    if (normalized === 'HOUSE' || normalized === 'H') return 'H';
    if (normalized === 'SENATE' || normalized === 'S') return 'S';
    
    // Return as-is if it's already in the correct format
    return normalized;
  }

  /**
   * Get candidates with filters and pagination
   * Optimized: Uses candidate-level financials (no committee joins when possible)
   */
  async getCandidates(params: {
    search?: string;
    state?: string;
    office?: string;
    party?: string;
    cycle?: number;
    page?: number;
    perPage?: number;
    includeFunds?: boolean;
  }): Promise<PaginationResult<any>> {
    const { search, state, office, party, cycle = 2026, page = 1, perPage = 50, includeFunds = false } = params;
    const { skip, take } = getPaginationParams(page, perPage);

    // Normalize office filter to handle both 'HOUSE'/'SENATE' and 'H'/'S'
    let officeFilter: any = undefined;
    if (office) {
      const normalized = office.toUpperCase();
      if (normalized === 'HOUSE' || normalized === 'H') {
        officeFilter = { in: ['H', 'HOUSE'] };
      } else if (normalized === 'SENATE' || normalized === 'S') {
        officeFilter = { in: ['S', 'SENATE'] };
      } else {
        officeFilter = normalized;
      }
    }

    const where = {
      ...(search && { name: { contains: search, mode: 'insensitive' as const } }),
      ...(state && { state }),
      ...(officeFilter && { office: officeFilter }),
      ...(party && { party }),
      ...(cycle && { cycles: { has: cycle } }),
    };

    // Use candidate-level financials instead of committee joins (much faster)
    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          ...(includeFunds ? {
            financials: {
              where: { cycle },
              take: 1,
            },
          } : {}),
          ideologyScores: {
            orderBy: { congressSession: 'desc' },
            take: 1, // Get the latest ideology score
          },
        },
      }),
      prisma.candidate.count({ where }),
    ]);

    // Transform candidates with financial data
    const enhancedCandidates = candidates.map((candidate: any) => {
      const financial = candidate.financials?.[0];
      const { financials, ...candidateData } = candidate;

      return {
        ...candidateData,
        totalFundsRaised: includeFunds ? (financial?.receipts?.toNumber() || 0) : undefined,
        incumbent: candidate.incumbentStatus === 'I',
      };
    });

    return createPaginationResult(enhancedCandidates, total, page, perPage);
  }

  /**
   * Get a single candidate by ID
   */
  async getCandidateById(id: string) {
    return prisma.candidate.findUnique({
      where: { id },
      include: {
        committees: true,
        ideologyScores: true,
      },
    });
  }

  /**
   * Get a single candidate by FEC candidate ID
   */
  async getCandidateByCandidateId(candidateId: string) {
    return prisma.candidate.findUnique({
      where: { candidateId },
      include: {
        committees: true,
        ideologyScores: true,
      },
    });
  }

  /**
   * Create or update a candidate from FEC data
   */
  async upsertCandidate(fecCandidate: FECCandidate): Promise<Candidate> {
    // Normalize office value to 'H' or 'S' for consistency
    const normalizedOffice = this.normalizeOffice(fecCandidate.office) || 'UNKNOWN';
    
    return prisma.candidate.upsert({
      where: { candidateId: fecCandidate.candidate_id },
      update: {
        name: fecCandidate.name,
        party: fecCandidate.party,
        office: normalizedOffice,
        district: fecCandidate.district,
        state: fecCandidate.state || 'US',
        incumbentStatus: fecCandidate.incumbent_challenge,
        activeThrough: fecCandidate.active_through,
        cycles: fecCandidate.cycles || [],
        electionYears: fecCandidate.election_years || [],
        candidateStatus: fecCandidate.candidate_status,
      },
      create: {
        candidateId: fecCandidate.candidate_id,
        name: fecCandidate.name,
        party: fecCandidate.party,
        office: normalizedOffice,
        district: fecCandidate.district,
        state: fecCandidate.state || 'US',
        incumbentStatus: fecCandidate.incumbent_challenge,
        activeThrough: fecCandidate.active_through,
        cycles: fecCandidate.cycles || [],
        electionYears: fecCandidate.election_years || [],
        candidateStatus: fecCandidate.candidate_status,
      },
    });
  }

  /**
   * Sync candidates from FEC API to database
   */
  async syncCandidates(params: {
    state?: string;
    office?: string;
    cycle?: number;
    maxPages?: number;
  }): Promise<{ synced: number; errors: number }> {
    const { state, office, cycle, maxPages = 10 } = params;

    console.log(`🔄 Syncing candidates: state=${state}, office=${office}, cycle=${cycle}`);

    try {
      const fecCandidates = await fecApiService.getAllCandidates({
        state,
        office,
        cycle,
        maxPages,
      });

      console.log(`📥 Found ${fecCandidates.length} candidates from FEC API`);

      let synced = 0;
      let errors = 0;

      for (const fecCandidate of fecCandidates) {
        try {
          await this.upsertCandidate(fecCandidate);
          synced++;
        } catch (error) {
          console.error(`❌ Error upserting candidate ${fecCandidate.candidate_id}:`, error);
          errors++;
        }
      }

      console.log(`✅ Synced ${synced} candidates, ${errors} errors`);

      return { synced, errors };
    } catch (error) {
      console.error('❌ Error syncing candidates:', error);
      throw error;
    }
  }

  /**
   * Create or update a committee from FEC data
   */
  async upsertCommittee(fecCommittee: FECCommittee): Promise<Committee> {
    // Link to candidate if candidate_ids exists
    const candidateId = fecCommittee.candidate_ids?.[0];

    // Find the candidate by FEC candidate ID if it exists
    let dbCandidateId: string | null = null;
    if (candidateId) {
      const candidate = await prisma.candidate.findUnique({
        where: { candidateId },
        select: { candidateId: true },
      });
      dbCandidateId = candidate?.candidateId || null;
    }

    return prisma.committee.upsert({
      where: { committeeId: fecCommittee.committee_id },
      update: {
        name: fecCommittee.name,
        committeeType: fecCommittee.committee_type,
        designation: fecCommittee.designation,
        candidateId: dbCandidateId,
        party: fecCommittee.party,
        state: fecCommittee.state,
      },
      create: {
        committeeId: fecCommittee.committee_id,
        name: fecCommittee.name,
        committeeType: fecCommittee.committee_type,
        designation: fecCommittee.designation,
        candidateId: dbCandidateId,
        party: fecCommittee.party,
        state: fecCommittee.state,
      },
    });
  }

  /**
   * Sync committees for a candidate
   */
  async syncCandidateCommittees(candidateId: string): Promise<{ synced: number; errors: number }> {
    console.log(`🔄 Syncing committees for candidate ${candidateId}`);

    try {
      const fecCommittees = await fecApiService.getCommittees(candidateId);
      console.log(`📥 Found ${fecCommittees.length} committees for ${candidateId}`);

      let synced = 0;
      let errors = 0;

      for (const fecCommittee of fecCommittees) {
        try {
          await this.upsertCommittee(fecCommittee);
          synced++;
        } catch (error) {
          console.error(`❌ Error upserting committee ${fecCommittee.committee_id}:`, error);
          errors++;
        }
      }

      console.log(`✅ Synced ${synced} committees, ${errors} errors`);

      return { synced, errors };
    } catch (error) {
      console.error('❌ Error syncing committees:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const candidateService = new CandidateService();
