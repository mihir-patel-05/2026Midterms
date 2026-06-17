import { prisma } from '../config/database.js';
import { fecApiService, type FECElectionDate } from './fec-api.service.js';

/**
 * Pure transform: turn FEC election-date rows into a per-race primary-date
 * lookup. Keys: `${STATE}-SENATE`, `${STATE}-HOUSE`, plus a `${STATE}-*`
 * statewide fallback. Earliest date wins. Keeps only regular ("P") primaries
 * for federal House/Senate offices. Exported for unit testing.
 */
export function buildPrimaryDateLookup(rows: FECElectionDate[]): Map<string, Date> {
  const lookup = new Map<string, Date>();

  const setEarliest = (key: string, date: Date) => {
    const existing = lookup.get(key);
    if (!existing || date < existing) lookup.set(key, date);
  };

  for (const row of rows) {
    if (row.election_type_id && row.election_type_id !== 'P') continue;
    if (!row.election_state || !row.election_date) continue;

    const date = new Date(row.election_date);
    if (Number.isNaN(date.getTime())) continue;

    const officeType =
      row.office_sought === 'S' ? 'SENATE' : row.office_sought === 'H' ? 'HOUSE' : null;
    if (!officeType) continue;

    const state = row.election_state.toUpperCase();
    setEarliest(`${state}-${officeType}`, date);
    setEarliest(`${state}-*`, date); // statewide fallback
  }

  return lookup;
}

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
    // Count one election per race (the general) so the map shows the number of
    // distinct races, not the number of election events. Every race has a
    // GENERAL, so this stays correct after PRIMARY elections are added.
    const counts = await prisma.election.groupBy({
      by: ['state'],
      where: {
        cycle,
        electionType: 'GENERAL',
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
   * Build a lookup of primary election dates by race from FEC's /election-dates/
   * resource. Keys: `${STATE}-SENATE`, `${STATE}-HOUSE`, plus a `${STATE}-*`
   * statewide fallback (federal primaries usually share one date per state).
   * Values: the earliest primary date found for that key.
   */
  async getPrimaryDatesByRace(cycle: number): Promise<Map<string, Date>> {
    const rows = await fecApiService.getAllElectionDates({
      year: cycle,
      electionTypeId: 'P', // regular primaries (not runoffs/specials)
    });

    const lookup = buildPrimaryDateLookup(rows);
    console.log(`  🗳️  Loaded primary dates for ${lookup.size} race keys from FEC`);
    return lookup;
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
    primariesCreated: number;
    primariesSkippedNoDate: number;
  }> {
    console.log(`\n🗳️  Generating elections for cycle ${cycle}...`);

    const stats = {
      electionsCreated: 0,
      candidateLinksCreated: 0,
      errors: 0,
      primariesCreated: 0,
      primariesSkippedNoDate: 0,
    };

    try {
      // Get all candidates for this cycle
      const candidates = await prisma.candidate.findMany({
        where: {
          cycles: { has: cycle },
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

      // Group candidates by race (state + office + district)
      const races: Record<string, {
        state: string;
        officeType: string;
        district: string | null;
        candidates: typeof candidates;
      }> = {};

      for (const candidate of candidates) {
        // Normalize office to SENATE/HOUSE
        const officeType = candidate.office?.toUpperCase() === 'S' ? 'SENATE' : 'HOUSE';
        const district = officeType === 'HOUSE' ? candidate.district : null;
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

      console.log(`  🏛️  Found ${Object.keys(races).length} unique races`);

      // General election date: First Tuesday after first Monday in November
      const generalElectionDate = new Date('2026-11-03');

      // Primary dates come from FEC's election-dates resource. If that fetch
      // fails (e.g. network/quota), fall back to generals-only rather than
      // aborting the whole generation.
      let primaryDates = new Map<string, Date>();
      try {
        primaryDates = await this.getPrimaryDatesByRace(cycle);
      } catch (primaryError: any) {
        console.error(
          `  ⚠️  Could not load FEC primary dates, generating generals only:`,
          primaryError.message
        );
      }

      // Create elections (general + primary) and link candidates
      for (const [raceKey, race] of Object.entries(races)) {
        try {
          // General election (always created)
          await this.upsertElectionWithCandidates(race, 'GENERAL', generalElectionDate, cycle, stats);

          // Primary election (only when we have a date for this race)
          const primaryDate =
            primaryDates.get(`${race.state}-${race.officeType}`) ||
            primaryDates.get(`${race.state}-*`);

          if (primaryDate) {
            const created = await this.upsertElectionWithCandidates(
              race,
              'PRIMARY',
              primaryDate,
              cycle,
              stats
            );
            if (created) stats.primariesCreated++;
          } else {
            stats.primariesSkippedNoDate++;
          }
        } catch (electionError: any) {
          console.error(`  ❌ Error creating elections for ${raceKey}:`, electionError.message);
          stats.errors++;
        }
      }

      console.log(`\n📊 Election Generation Summary:`);
      console.log(`   Elections created: ${stats.electionsCreated}`);
      console.log(`   Candidate links created: ${stats.candidateLinksCreated}`);
      console.log(`   Primaries created: ${stats.primariesCreated}`);
      console.log(`   Primaries skipped (no FEC date): ${stats.primariesSkippedNoDate}`);
      console.log(`   Errors: ${stats.errors}`);

      return stats;
    } catch (error: any) {
      console.error('❌ Fatal error generating elections:', error.message);
      throw error;
    }
  }

  /**
   * Find-or-create one election for a race and link all of its candidates.
   * Returns true if a new Election row was created (false if it already existed).
   */
  private async upsertElectionWithCandidates(
    race: {
      state: string;
      officeType: string;
      district: string | null;
      candidates: Array<{ candidateId: string; name: string; incumbentStatus: string | null }>;
    },
    electionType: 'GENERAL' | 'PRIMARY',
    electionDate: Date,
    cycle: number,
    stats: { electionsCreated: number; candidateLinksCreated: number; errors: number }
  ): Promise<boolean> {
    let election = await prisma.election.findFirst({
      where: {
        state: race.state,
        officeType: race.officeType,
        district: race.district,
        cycle,
        electionType,
      },
    });

    let created = false;
    if (!election) {
      election = await prisma.election.create({
        data: {
          state: race.state,
          officeType: race.officeType,
          district: race.district,
          cycle,
          electionType,
          electionDate,
        },
      });
      stats.electionsCreated++;
      created = true;
      console.log(
        `  ✅ Created ${electionType.toLowerCase()} election: ${race.state} ${race.officeType}` +
          `${race.district ? ` District ${race.district}` : ''}`
      );
    }

    for (const candidate of race.candidates) {
      try {
        const existingLink = await prisma.candidateElection.findUnique({
          where: {
            candidateId_electionId: {
              candidateId: candidate.candidateId,
              electionId: election.id,
            },
          },
        });

        if (!existingLink) {
          await prisma.candidateElection.create({
            data: {
              candidateId: candidate.candidateId,
              electionId: election.id,
              isIncumbent: candidate.incumbentStatus === 'I',
              result: 'PENDING',
            },
          });
          stats.candidateLinksCreated++;
        }
      } catch (linkError: any) {
        console.error(`  ❌ Error linking ${candidate.name} to ${electionType} election:`, linkError.message);
        stats.errors++;
      }
    }

    return created;
  }
}

export const electionService = new ElectionService();
