import { prisma } from '../../config/database.js';
import type { RaceCandidateName } from './catalog.js';

/**
 * The 2026 general election candidates for each Kalshi race (`CA-07`, `GA-SEN`): the
 * ballot when we have it, otherwise FEC filers. Used to give candidate-named markets a party.
 */
export async function loadRaceCandidates(cycle = 2026): Promise<Map<string, RaceCandidateName[]>> {
  const elections = await prisma.election.findMany({
    where: { cycle, electionType: 'GENERAL' },
    select: {
      state: true,
      officeType: true,
      district: true,
      normalizedContest: {
        select: { candidacies: { select: { ballotName: true, person: { select: { displayName: true } }, party: { select: { name: true } } } } },
      },
      candidateElections: { select: { candidate: { select: { name: true, party: true } } } },
    },
  });
  return new Map(elections.map((election) => {
    const ballot = (election.normalizedContest?.candidacies ?? []).map((candidacy) => ({
      name: candidacy.person.displayName || candidacy.ballotName || '',
      party: candidacy.party?.name ?? null,
    }));
    // The ballot is the better list; FEC filers would only make a name match ambiguous.
    const names = ballot.length > 0 ? ballot : election.candidateElections.map(({ candidate }) => ({ name: candidate.name, party: candidate.party }));
    return [election.officeType === 'SENATE' ? `${election.state}-SEN` : `${election.state}-${election.district}`, names];
  }));
}
