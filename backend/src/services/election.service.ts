import { prisma } from '../config/database.js';
import { parseCalendarDate } from '../utils/calendar-date.js';

interface GetElectionsParams {
  state?: string;
  district?: string;
  officeType?: string;
  electionType?: string;
  cycle?: number;
  page?: number;
  perPage?: number;
}

interface CreateElectionData {
  state: string;
  district?: string;
  officeType: string;
  electionDate: Date;
  electionType: string;
  cycle: number;
}

/**
 * House seats per state after the 2020 apportionment (435 total), plus DC and
 * the territories, which each elect one non-voting delegate.
 */
const HOUSE_SEATS: Record<string, number> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14,
  HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8,
  MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12,
  NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7,
  SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1,
  DC: 1, AS: 1, GU: 1, MP: 1, PR: 1, VI: 1,
};

/**
 * Two-digit district for a House filing ("00" for at-large seats), or null
 * when the filing names a district that does not exist. FEC filings include
 * typos (e.g. GA-23, NM-66) and blanks that would otherwise become fake races.
 */
export function houseDistrict(state: string, district: string | null | undefined): string | null {
  const seats = HOUSE_SEATS[state];
  if (!seats) return null;
  if (seats === 1) return '00';
  if (!district || !/^\d{1,2}$/.test(district.trim())) return null;
  const number = parseInt(district, 10);
  return number >= 1 && number <= seats ? String(number).padStart(2, '0') : null;
}

export class ElectionService {
  /**
   * Get elections with filters and pagination
   */
  async getElections(params: GetElectionsParams = {}) {
    const {
      state,
      district,
      officeType,
      electionType,
      cycle = 2026,
      page = 1,
      perPage = 50,
    } = params;

    // Build where clause
    const where: any = {
      cycle,
    };

    if (state) {
      where.state = state.toUpperCase();
    }

    if (district) {
      where.district = district;
    }

    if (officeType) {
      where.officeType = officeType.toUpperCase();
    }

    if (electionType) {
      where.electionType = electionType.toUpperCase();
    }

    // Get total count
    const total = await prisma.election.count({ where });

    // Get paginated results with candidate count
    const elections = await prisma.election.findMany({
      where,
      include: {
        candidateElections: {
          include: {
            candidate: {
              select: {
                id: true,
                candidateId: true,
                name: true,
                party: true,
                incumbentStatus: true,
              },
            },
          },
        },
        _count: {
          select: {
            candidateElections: true,
          },
        },
      },
      orderBy: [
        { state: 'asc' },
        { officeType: 'desc' }, // SENATE before HOUSE
        { district: 'asc' },
      ],
      skip: (page - 1) * perPage,
      take: perPage,
    });

    return {
      data: elections,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
        hasNext: page * perPage < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get elections for a specific state
   */
  async getElectionsByState(state: string, cycle: number = 2026) {
    const elections = await prisma.election.findMany({
      where: {
        state: state.toUpperCase(),
        cycle,
      },
      include: {
        candidateElections: {
          include: {
            candidate: {
              select: {
                id: true,
                candidateId: true,
                name: true,
                party: true,
                incumbentStatus: true,
                state: true,
                office: true,
                district: true,
                financials: {
                  where: { cycle },
                  select: { receipts: true, disbursements: true, cashOnHand: true, coverageEndDate: true, lastUpdated: true },
                  take: 1,
                },
              },
            },
          },
        },
        _count: {
          select: {
            candidateElections: true,
          },
        },
      },
      orderBy: [
        { officeType: 'desc' }, // SENATE before HOUSE
        { district: 'asc' },
      ],
    });

    return elections;
  }

  /**
   * Get race counts by state for the map
   * Returns total number of races per state
   */
  async getStateElectionCounts(cycle: number = 2026) {
    const counts = await prisma.election.groupBy({
      by: ['state'],
      where: {
        cycle,
      },
      _count: {
        id: true,
      },
      orderBy: {
        state: 'asc',
      },
    });

    return counts.map(count => ({
      state: count.state,
      races: count._count.id,
    }));
  }

  /**
   * Get a single election by ID
   */
  async getElectionById(id: string) {
    const election = await prisma.election.findUnique({
      where: { id },
      include: {
        candidateElections: {
          include: {
            candidate: true,
          },
        },
      },
    });

    return election;
  }

  /**
   * Create a new election
   */
  async createElection(data: CreateElectionData) {
    const election = await prisma.election.create({
      data: {
        state: data.state.toUpperCase(),
        district: data.district,
        officeType: data.officeType.toUpperCase(),
        electionDate: data.electionDate,
        electionType: data.electionType.toUpperCase(),
        cycle: data.cycle,
      },
    });

    return election;
  }

  /**
   * Update an election
   */
  async updateElection(id: string, data: Partial<CreateElectionData>) {
    const election = await prisma.election.update({
      where: { id },
      data,
    });

    return election;
  }

  /**
   * Delete an election
   */
  async deleteElection(id: string) {
    const election = await prisma.election.delete({
      where: { id },
    });

    return election;
  }

  /**
   * Generate elections from existing candidate data
   * Creates Election records for each unique (state, office, district) combination
   * and links candidates to their elections via CandidateElection records
   */
  async generateElections(cycle: number = 2026): Promise<{
    electionsCreated: number;
    candidateLinksCreated: number;
    errors: number;
  }> {
    console.log(`\n🗳️  Generating elections for cycle ${cycle}...`);

    const stats = {
      electionsCreated: 0,
      candidateLinksCreated: 0,
      errors: 0,
    };

    try {
      // Get all candidates for this cycle
      const candidates = await prisma.candidate.findMany({
        where: {
          cycles: { has: cycle },
          electionYears: { has: cycle },
          candidateStatus: 'C',
          activeThrough: { gte: cycle },
        },
        select: {
          candidateId: true,
          name: true,
          state: true,
          office: true,
          district: true,
          incumbentStatus: true,
        },
      });

      console.log(`  📋 Found ${candidates.length} candidates for cycle ${cycle}`);

      const activeCandidateIds = candidates.map((candidate) => candidate.candidateId);
      await prisma.candidateElection.deleteMany({
        where: {
          election: { cycle },
          ballotStatus: 'UNCONFIRMED',
          result: 'PENDING',
          ...(activeCandidateIds.length > 0
            ? { candidateId: { notIn: activeCandidateIds } }
            : {}),
        },
      });

      // Group candidates by race (state + office + district)
      const races: Record<string, {
        state: string;
        officeType: string;
        district: string | null;
        candidates: typeof candidates;
      }> = {};

      let invalidDistricts = 0;
      for (const candidate of candidates) {
        // Normalize office to SENATE/HOUSE
        const officeType = candidate.office?.toUpperCase() === 'S' ? 'SENATE' : 'HOUSE';
        const district = officeType === 'HOUSE' ? houseDistrict(candidate.state, candidate.district) : null;
        if (officeType === 'HOUSE' && !district) {
          invalidDistricts++;
          continue;
        }
        const key = `${candidate.state}-${officeType}-${district || 'statewide'}`;

        if (!races[key]) {
          races[key] = {
            state: candidate.state,
            officeType,
            district,
            candidates: [],
          };
        }
        races[key].candidates.push(candidate);
      }

      if (invalidDistricts > 0) {
        console.warn(`  ⚠️  Skipped ${invalidDistricts} House candidate(s) filed under a district that does not exist`);
      }
      console.log(`  🏛️  Found ${Object.keys(races).length} unique races`);

      // General election date: First Tuesday after first Monday in November
      const generalElectionDate = parseCalendarDate(`${cycle}-11-03`);

      // Create elections and link candidates
      for (const [raceKey, race] of Object.entries(races)) {
        try {
          // Find or create the election
          let election = await prisma.election.findFirst({
            where: {
              state: race.state,
              officeType: race.officeType,
              district: race.district,
              cycle,
              electionType: 'GENERAL',
            },
          });

          if (!election) {
            election = await prisma.election.create({
              data: {
                state: race.state,
                officeType: race.officeType,
                district: race.district,
                cycle,
                electionType: 'GENERAL',
                electionDate: generalElectionDate,
              },
            });
            stats.electionsCreated++;
            console.log(`  ✅ Created election: ${race.state} ${race.officeType}${race.district ? ` District ${race.district}` : ''}`);
          }

          // Link candidates to this election
          for (const candidate of race.candidates) {
            try {
              const existingLink = await prisma.candidateElection.findUnique({
                where: {
                  candidateId_electionId: {
                    candidateId: candidate.candidateId,
                    electionId: election.id,
                  },
                },
                select: { id: true },
              });

              await prisma.candidateElection.upsert({
                where: {
                  candidateId_electionId: {
                    candidateId: candidate.candidateId,
                    electionId: election.id,
                  },
                },
                update: {
                  isIncumbent: candidate.incumbentStatus === 'I',
                  ballotStatus: 'UNCONFIRMED',
                },
                create: {
                  candidateId: candidate.candidateId,
                  electionId: election.id,
                  isIncumbent: candidate.incumbentStatus === 'I',
                  ballotStatus: 'UNCONFIRMED',
                  result: 'PENDING',
                },
              });
              if (!existingLink) stats.candidateLinksCreated++;
            } catch (linkError: any) {
              console.error(`  ❌ Error linking ${candidate.name} to election:`, linkError.message);
              stats.errors++;
            }
          }
        } catch (electionError: any) {
          console.error(`  ❌ Error creating election for ${raceKey}:`, electionError.message);
          stats.errors++;
        }
      }

      console.log(`\n📊 Election Generation Summary:`);
      console.log(`   Elections created: ${stats.electionsCreated}`);
      console.log(`   Candidate links created: ${stats.candidateLinksCreated}`);
      console.log(`   Errors: ${stats.errors}`);

      return stats;
    } catch (error: any) {
      console.error('❌ Fatal error generating elections:', error.message);
      throw error;
    }
  }
}

export const electionService = new ElectionService();
