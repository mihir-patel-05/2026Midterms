export interface ResearcherUser {
  id: string;
  email: string;
  name: string | null;
}

export interface County {
  fipsCode: string;
  state: string;
  name: string;
  districts: string[];
}

export interface CountyResultRow {
  party: string;
  candidateName: string;
  votes: number;
  votePct: number;
}

export interface CountyRaceBreakdown {
  fipsCode: string;
  countyName: string;
  state: string;
  results: CountyResultRow[];
  totalVotes: number;
  demPct: number;
  repPct: number;
  margin: number;
}

export interface ResearchRaceListItem {
  key: string;
  state: string;
  officeType: string;
  district: string | null;
  cycle: number;
  totalVotes: number;
}

export interface RaceDetailResponse {
  race: { state: string; officeType: string; district: string | null; cycle: number };
  counties: CountyRaceBreakdown[];
  rollup: { totalVotes: number; demPct: number; repPct: number };
}

export interface SwingVector {
  D: number;
  R: number;
}

export interface SimulationRequest {
  baselineCycle: number;
  state?: string;
  officeType?: 'HOUSE' | 'SENATE';
  swings: {
    statewide?: SwingVector;
    perRace?: Record<string, SwingVector>;
  };
}

export interface SimulatedRace {
  key: string;
  state: string;
  officeType: string;
  district: string | null;
  baselineWinner: 'D' | 'R' | 'O' | null;
  baselineMargin: number;
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
