import { prisma } from '../config/database.js';

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
}

export const electionService = new ElectionService();
