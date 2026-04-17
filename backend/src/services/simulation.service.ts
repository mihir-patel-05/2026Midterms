/**
 * Vote-swing simulator.
 *
 * Takes baseline county-level results from a past cycle, applies a swing vector
 * (percentage points D and R, optionally per-race overrides), re-tallies at the
 * district level, and reports predicted winners and flipped seats.
 *
 * The model is deliberately simple: no turnout modeling, no demographic inputs.
 * Swings are applied to the D% and R% of each county; other-party % is held
 * flat, then all three are normalized back to 100. County vote totals are used
 * as turnout weights for district rollups.
 */

import { prisma } from '../config/database.js';

export interface SwingVector {
  D: number; // percentage points added to Democrat share (can be negative)
  R: number;
}

export interface SimulationRequest {
  baselineCycle: number;
  state?: string;           // optional filter
  officeType?: 'HOUSE' | 'SENATE';
  swings: {
    statewide?: SwingVector;
    perRace?: Record<string, SwingVector>; // keyed by `${state}-${officeType}-${district}`
  };
}

export interface SimulatedRace {
  key: string;
  state: string;
  officeType: string;
  district: string;
  baselineWinner: 'D' | 'R' | 'O' | null;
  baselineMargin: number;     // D - R percentage points
  simulatedWinner: 'D' | 'R' | 'O' | null;
  simulatedMargin: number;
  flipped: boolean;
  totalVotes: number;
}

export interface SimulationResponse {
  races: SimulatedRace[];
  flippedSeats: { D: number; R: number };
  summary: {
    totalRaces: number;
    baselineD: number;
    baselineR: number;
    simulatedD: number;
    simulatedR: number;
  };
}

export type RaceGroup = {
  state: string;
  officeType: string;
  district: string;
  counties: Map<string, {
    totalVotes: number;
    demVotes: number;
    repVotes: number;
    otherVotes: number;
  }>;
};

export interface CountyResultRow {
  state: string;
  officeType: string;
  district: string;
  countyFips: string;
  party: string;
  votes: number;
}

function raceKey(state: string, officeType: string, district: string): string {
  return `${state}-${officeType}-${district || 'AT_LARGE'}`;
}

function applySwing(
  demPct: number,
  repPct: number,
  otherPct: number,
  swing: SwingVector,
): { d: number; r: number; o: number } {
  // Apply swing in percentage points, clamp to >= 0, then renormalize.
  const d = Math.max(0, demPct + swing.D);
  const r = Math.max(0, repPct + swing.R);
  const o = Math.max(0, otherPct);
  const total = d + r + o;
  if (total === 0) return { d: 0, r: 0, o: 0 };
  return { d: (d / total) * 100, r: (r / total) * 100, o: (o / total) * 100 };
}

function winnerOf(d: number, r: number, o: number): 'D' | 'R' | 'O' | null {
  const max = Math.max(d, r, o);
  if (max === 0) return null;
  if (max === d) return 'D';
  if (max === r) return 'R';
  return 'O';
}

/**
 * Pure simulation: groups + swing → SimulationResponse.
 * Extracted so it can be tested without Prisma.
 */
export function simulateFromRows(rows: CountyResultRow[], swings: SimulationRequest['swings']): SimulationResponse {
  // Group by race and county. County-level D/R/O vote sums are the baseline.
  const races = new Map<string, RaceGroup>();
  for (const row of rows) {
    const key = raceKey(row.state, row.officeType, row.district);
    let race = races.get(key);
    if (!race) {
      race = {
        state: row.state,
        officeType: row.officeType,
        district: row.district,
        counties: new Map(),
      };
      races.set(key, race);
    }
    let c = race.counties.get(row.countyFips);
    if (!c) {
      c = { totalVotes: 0, demVotes: 0, repVotes: 0, otherVotes: 0 };
      race.counties.set(row.countyFips, c);
    }
    c.totalVotes += row.votes;
    if (row.party === 'DEMOCRAT') c.demVotes += row.votes;
    else if (row.party === 'REPUBLICAN') c.repVotes += row.votes;
    else c.otherVotes += row.votes;
  }

  const simulated: SimulatedRace[] = [];
    const flipped = { D: 0, R: 0 };
    let baselineD = 0, baselineR = 0, simulatedD = 0, simulatedR = 0;

    for (const [key, race] of races) {
      const swing = swings.perRace?.[key] ?? swings.statewide ?? { D: 0, R: 0 };

      let baseDem = 0, baseRep = 0, baseOther = 0, total = 0;
      let simDem = 0, simRep = 0, simOther = 0;

      for (const c of race.counties.values()) {
        total += c.totalVotes;
        baseDem += c.demVotes;
        baseRep += c.repVotes;
        baseOther += c.otherVotes;

        if (c.totalVotes === 0) continue;
        const dPct = (c.demVotes / c.totalVotes) * 100;
        const rPct = (c.repVotes / c.totalVotes) * 100;
        const oPct = (c.otherVotes / c.totalVotes) * 100;
        const swung = applySwing(dPct, rPct, oPct, swing);

        simDem += (swung.d / 100) * c.totalVotes;
        simRep += (swung.r / 100) * c.totalVotes;
        simOther += (swung.o / 100) * c.totalVotes;
      }

      const baselinePcts = total > 0
        ? { d: (baseDem / total) * 100, r: (baseRep / total) * 100, o: (baseOther / total) * 100 }
        : { d: 0, r: 0, o: 0 };
      const simPcts = total > 0
        ? { d: (simDem / total) * 100, r: (simRep / total) * 100, o: (simOther / total) * 100 }
        : { d: 0, r: 0, o: 0 };

      const baselineWinner = winnerOf(baselinePcts.d, baselinePcts.r, baselinePcts.o);
      const simulatedWinner = winnerOf(simPcts.d, simPcts.r, simPcts.o);

      if (baselineWinner === 'D') baselineD++;
      else if (baselineWinner === 'R') baselineR++;
      if (simulatedWinner === 'D') simulatedD++;
      else if (simulatedWinner === 'R') simulatedR++;

      const flippedRace = baselineWinner !== simulatedWinner && baselineWinner != null && simulatedWinner != null;
      if (flippedRace) {
        if (simulatedWinner === 'D') flipped.D++;
        else if (simulatedWinner === 'R') flipped.R++;
      }

      simulated.push({
        key,
        state: race.state,
        officeType: race.officeType,
        district: race.district,
        baselineWinner,
        baselineMargin: baselinePcts.d - baselinePcts.r,
        simulatedWinner,
        simulatedMargin: simPcts.d - simPcts.r,
        flipped: flippedRace,
        totalVotes: total,
      });
    }

  simulated.sort((a, b) => Math.abs(a.simulatedMargin) - Math.abs(b.simulatedMargin));

  return {
    races: simulated,
    flippedSeats: flipped,
    summary: {
      totalRaces: simulated.length,
      baselineD,
      baselineR,
      simulatedD,
      simulatedR,
    },
  };
}

export const simulationService = {
  async simulate(req: SimulationRequest): Promise<SimulationResponse> {
    const { baselineCycle, state, officeType, swings } = req;
    const rows = await prisma.countyResult.findMany({
      where: {
        cycle: baselineCycle,
        ...(state ? { state } : {}),
        ...(officeType ? { officeType } : {}),
      },
    });
    return simulateFromRows(
      rows.map(r => ({
        state: r.state,
        officeType: r.officeType,
        district: r.district,
        countyFips: r.countyFips,
        party: r.party,
        votes: r.votes,
      })),
      swings,
    );
  },
};
