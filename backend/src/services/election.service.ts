import { prisma } from '../config/database.js';
import { parseCalendarDate } from '../utils/calendar-date.js';
import { HOUSE_SEATS } from '../utils/house-seats.js';
import { ballotRaces, raceKey, raceLabel, type Race } from '../utils/races.js';
import { normalizePagination } from '../utils/pagination.js';

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

/**
 * The race's general election ballot from the ballot sync (services/ballot), in ballot order.
 * Empty until the sync has run; the FEC filings stay the fallback.
 */
const ballotInclude = {
  normalizedContest: {
    select: {
      candidacies: {
        where: { ballotStatus: 'BALLOT_CONFIRMED' as const, source: { key: 'civicapi' } },
        orderBy: { ballotOrder: 'asc' as const },
        select: {
          id: true,
          ballotName: true,
          isIncumbent: true,
          fecCandidateId: true,
          legacyCandidateId: true,
          person: { select: { displayName: true } },
          party: { select: { name: true, abbreviation: true } },
        },
      },
    },
  },
};

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
    } = params;
    const { page, perPage } = normalizePagination(params.page, params.perPage);

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
        ...ballotInclude,
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
        ...ballotInclude,
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
   * Keep one GENERAL election per race on the ballot and link each active FEC
   * candidate to theirs. Every seat on the ballot gets a race even before (or
   * without) an FEC filing, so a district never drops off the map because its
   * candidates are missing or misfiled. For a cycle with no roster in
   * utils/races.ts, races come from FEC filings alone.
   */
  async generateElections(cycle: number = 2026): Promise<{
    electionsCreated: number;
    electionsRemoved: number;
    candidateLinksCreated: number;
    racesWithoutCandidates: string[];
    errors: number;
  }> {
    console.log(`\n🗳️  Generating elections for cycle ${cycle}...`);

    const stats = {
      electionsCreated: 0,
      electionsRemoved: 0,
      candidateLinksCreated: 0,
      racesWithoutCandidates: [] as string[],
      errors: 0,
    };

    try {
      const ballot = ballotRaces(cycle);
      const onBallot = ballot ? new Set(ballot.map(raceKey)) : null;

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
      const races: Record<string, Race & { candidates: typeof candidates }> = {};

      let invalidDistricts = 0;
      const offBallot = new Set<string>();
      for (const candidate of candidates) {
        // Normalize office to SENATE/HOUSE
        const officeType = candidate.office?.toUpperCase() === 'S' ? 'SENATE' : 'HOUSE';
        const district = officeType === 'HOUSE' ? houseDistrict(candidate.state, candidate.district) : null;
        if (officeType === 'HOUSE' && !district) {
          invalidDistricts++;
          continue;
        }
        const race: Race = { state: candidate.state, officeType, district };
        const key = raceKey(race);
        // e.g. a Senate filing in a state with no Senate race this year.
        if (onBallot && !onBallot.has(key)) {
          offBallot.add(raceLabel(race));
          continue;
        }

        races[key] ??= { ...race, candidates: [] };
        races[key].candidates.push(candidate);
      }

      if (invalidDistricts > 0) {
        console.warn(`  ⚠️  Skipped ${invalidDistricts} House candidate(s) filed under a district that does not exist`);
      }
      if (offBallot.size > 0) {
        console.warn(`  ⚠️  Skipped candidates filed for races not on the ${cycle} ballot: ${[...offBallot].sort().join(', ')}`);
      }
      console.log(`  🏛️  Found ${Object.keys(races).length} unique races with candidates`);

      // General election date: First Tuesday after first Monday in November
      const generalElectionDate = parseCalendarDate(`${cycle}-11-03`);

      const existing = await prisma.election.findMany({
        where: { cycle, electionType: 'GENERAL' },
        select: { id: true, state: true, officeType: true, district: true },
      });
      const electionIds = new Map(existing.map((election) => [raceKey(election), election.id]));

      // Every race on the ballot, and any other race a candidate filed for.
      const wanted = new Map<string, Race>([
        ...(ballot ?? []).map((race): [string, Race] => [raceKey(race), race]),
        ...Object.entries(races).map(([key, { state, officeType, district }]): [string, Race] => [key, { state, officeType, district }]),
      ]);
      const missing = [...wanted].filter(([key]) => !electionIds.has(key)).map(([, race]) => race);
      if (missing.length > 0) {
        const created = await prisma.election.createManyAndReturn({
          data: missing.map((race) => ({
            ...race,
            cycle,
            electionType: 'GENERAL',
            electionDate: generalElectionDate,
          })),
          select: { id: true, state: true, officeType: true, district: true },
        });
        for (const election of created) electionIds.set(raceKey(election), election.id);
        stats.electionsCreated = created.length;
        console.log(`  ✅ Created ${created.length} election(s): ${missing.map(raceLabel).join(', ')}`);
      }

      if (onBallot) {
        stats.electionsRemoved = await this.removeOffBallotElections(cycle, existing.filter((election) => !onBallot.has(raceKey(election))));
        stats.racesWithoutCandidates = ballot!.filter((race) => !races[raceKey(race)]).map(raceLabel);
        if (stats.racesWithoutCandidates.length > 0) {
          console.warn(
            `  ⚠️  ${stats.racesWithoutCandidates.length} race(s) on the ballot have no active FEC candidate yet: ` +
            stats.racesWithoutCandidates.join(', ')
          );
        }
      }

      // Link candidates to their elections
      for (const [raceKeyValue, race] of Object.entries(races)) {
        const electionId = electionIds.get(raceKeyValue);
        if (!electionId) {
          console.error(`  ❌ No election for ${raceLabel(race)}`);
          stats.errors++;
          continue;
        }
        for (const candidate of race.candidates) {
          try {
            const existingLink = await prisma.candidateElection.findUnique({
              where: {
                candidateId_electionId: {
                  candidateId: candidate.candidateId,
                  electionId,
                },
              },
              select: { id: true },
            });

            await prisma.candidateElection.upsert({
              where: {
                candidateId_electionId: {
                  candidateId: candidate.candidateId,
                  electionId,
                },
              },
              // The ballot sync owns ballotStatus; a filing it confirmed stays confirmed.
              update: {
                isIncumbent: candidate.incumbentStatus === 'I',
              },
              create: {
                candidateId: candidate.candidateId,
                electionId,
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
      }

      console.log(`\n📊 Election Generation Summary:`);
      console.log(`   Elections created: ${stats.electionsCreated}`);
      console.log(`   Elections removed (not on the ballot): ${stats.electionsRemoved}`);
      console.log(`   Candidate links created: ${stats.candidateLinksCreated}`);
      console.log(`   Races with no FEC candidate: ${stats.racesWithoutCandidates.length}`);
      console.log(`   Errors: ${stats.errors}`);

      return stats;
    } catch (error: any) {
      console.error('❌ Fatal error generating elections:', error.message);
      throw error;
    }
  }

  /**
   * Delete GENERAL elections for races that are not on the ballot, such as a
   * Senate race in a state with no Senate seat up, created from a misfiled FEC
   * candidate. An election tied to a results contest or to a confirmed or
   * decided candidacy is kept and reported instead.
   */
  private async removeOffBallotElections(
    cycle: number,
    elections: Array<{ id: string; state: string; officeType: string; district: string | null }>,
  ): Promise<number> {
    let removed = 0;
    for (const election of elections) {
      const label = raceLabel(election);
      const [contest, settled] = await Promise.all([
        prisma.contest.count({ where: { legacyElectionId: election.id } }),
        prisma.candidateElection.count({
          where: { electionId: election.id, NOT: { ballotStatus: 'UNCONFIRMED', result: 'PENDING' } },
        }),
      ]);
      if (contest > 0 || settled > 0) {
        console.warn(`  ⚠️  ${label} is not on the ${cycle} ballot but has results data; left in place`);
        continue;
      }
      await prisma.$transaction([
        prisma.candidateElection.deleteMany({ where: { electionId: election.id } }),
        prisma.election.delete({ where: { id: election.id } }),
      ]);
      removed++;
      console.log(`  🗑️  Removed ${label}: not on the ${cycle} ballot`);
    }
    return removed;
  }
}

export const electionService = new ElectionService();
