import { prisma } from '../config/database.js';

export interface CountyRaceBreakdown {
  fipsCode: string;
  countyName: string;
  state: string;
  results: Array<{
    party: string;
    candidateName: string;
    votes: number;
    votePct: number;
  }>;
  totalVotes: number;
  demPct: number;
  repPct: number;
  margin: number; // D - R, negative means R lead
}

export const countyService = {
  /**
   * Historical county-level results for a given race (state + office + district + cycle).
   * Aggregates at the county level, so a district that splits a county gets that county's
   * row filtered to matching district entries only.
   */
  async getRaceBreakdown(params: {
    state: string;
    officeType: 'HOUSE' | 'SENATE';
    district?: string;
    cycle: number;
  }): Promise<CountyRaceBreakdown[]> {
    const { state, officeType, cycle } = params;
    const district = params.district ?? '';

    const rows = await prisma.countyResult.findMany({
      where: {
        state,
        officeType,
        cycle,
        ...(officeType === 'HOUSE' ? { district } : { district: '' }),
      },
      include: { county: true },
      orderBy: [{ countyFips: 'asc' }],
    });

    const byCounty = new Map<string, CountyRaceBreakdown>();
    for (const r of rows) {
      let entry = byCounty.get(r.countyFips);
      if (!entry) {
        entry = {
          fipsCode: r.countyFips,
          countyName: r.county.name,
          state: r.state,
          results: [],
          totalVotes: 0,
          demPct: 0,
          repPct: 0,
          margin: 0,
        };
        byCounty.set(r.countyFips, entry);
      }
      entry.results.push({
        party: r.party,
        candidateName: r.candidateName,
        votes: r.votes,
        votePct: r.votePct,
      });
      entry.totalVotes += r.votes;
    }

    for (const entry of byCounty.values()) {
      const dem = entry.results.find(r => r.party === 'DEMOCRAT');
      const rep = entry.results.find(r => r.party === 'REPUBLICAN');
      entry.demPct = dem?.votePct ?? 0;
      entry.repPct = rep?.votePct ?? 0;
      entry.margin = entry.demPct - entry.repPct;
    }

    return Array.from(byCounty.values());
  },

  async getCountyHistory(fips: string, officeType?: string, cycle?: number) {
    return prisma.countyResult.findMany({
      where: {
        countyFips: fips,
        ...(officeType ? { officeType } : {}),
        ...(cycle ? { cycle } : {}),
      },
      orderBy: [{ cycle: 'desc' }, { officeType: 'asc' }, { district: 'asc' }, { votes: 'desc' }],
    });
  },
};
