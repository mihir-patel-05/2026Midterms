/**
 * VoteHub-shaped records and a fake fetch for poll tests. The fields follow
 * VoteHub's API docs: `sample_size` as a string, lower-case `population`, and
 * `answers` of `{ choice, pct }`.
 */
import type { RaceCandidate } from './race-match.js';

export function votehubPoll(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'vh-1001',
    poll_type: 'us-senate',
    subject: 'Ohio Senate',
    pollster: 'Emerson College',
    sponsors: ['The Hill'],
    start_date: '2026-10-18',
    end_date: '2026-10-20',
    sample_size: '1000',
    population: 'lv',
    internal: false,
    url: 'https://emersoncollegepolling.com/ohio-2026/',
    answers: [
      { choice: 'Brown', pct: 47 },
      { choice: 'Husted', pct: 48 },
      { choice: 'Undecided', pct: 5 },
    ],
    ...overrides,
  };
}

export const CANDIDATES: RaceCandidate[] = [
  { fecId: 'S6OH00001', name: 'BROWN, SHERROD', party: 'DEM', office: 'SENATE', state: 'OH', district: null },
  { fecId: 'S6OH00002', name: 'HUSTED, JON A', party: 'REP', office: 'SENATE', state: 'OH', district: null },
  { fecId: 'S6OH00003', name: 'RAMASWAMY, VIVEK', party: 'REP', office: 'SENATE', state: 'OH', district: null },
  { fecId: 'S6TX00001', name: 'TALARICO, JAMES', party: 'DEM', office: 'SENATE', state: 'TX', district: null },
  { fecId: 'S6TX00002', name: 'PAXTON, KEN', party: 'REP', office: 'SENATE', state: 'TX', district: null },
  { fecId: 'S6TX00003', name: 'CORNYN, JOHN', party: 'REP', office: 'SENATE', state: 'TX', district: null },
  { fecId: 'S6NE00001', name: 'OSBORN, DAN', party: 'IND', office: 'SENATE', state: 'NE', district: null },
  { fecId: 'S6NE00002', name: 'RICKETTS, PETE', party: 'REP', office: 'SENATE', state: 'NE', district: null },
  { fecId: 'H6PA07001', name: 'MACKENZIE, RYAN', party: 'REP', office: 'HOUSE', state: 'PA', district: '07' },
  { fecId: 'H6PA07002', name: 'CROSSWELL, LAMONT', party: 'DEM', office: 'HOUSE', state: 'PA', district: '7' },
  { fecId: 'H6TX15001', name: 'DE LA CRUZ, MONICA', party: 'REP', office: 'HOUSE', state: 'TX', district: '15' },
  { fecId: 'H6TX15002', name: 'VALLEJO, BOBBY', party: 'DEM', office: 'HOUSE', state: 'TX', district: '15' },
  { fecId: 'H6AK00001', name: 'BEGICH, NICHOLAS', party: 'REP', office: 'HOUSE', state: 'AK', district: null },
  { fecId: 'H6AK00002', name: 'PELTOLA, MARY', party: 'DEM', office: 'HOUSE', state: 'AK', district: '00' },
  // Two Smiths in one race, told apart by first name.
  { fecId: 'H6MI03001', name: 'SMITH, JOHN', party: 'DEM', office: 'HOUSE', state: 'MI', district: '03' },
  { fecId: 'H6MI03002', name: 'SMITH, ALICE', party: 'REP', office: 'HOUSE', state: 'MI', district: '03' },
  // A filing for a district that doesn't exist is dropped.
  { fecId: 'H6GA23001', name: 'NOBODY, PAT', party: 'DEM', office: 'HOUSE', state: 'GA', district: '23' },
];

/** A fetch that serves VoteHub's /poll-types and /polls?poll_type= from a table. A number answers with that HTTP status. */
export function fakeVoteHubFetch(
  routes: { pollTypes: unknown; polls: Record<string, unknown[] | number> },
  onRequest?: (url: URL) => void,
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    onRequest?.(url);
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname.endsWith('/poll-types')) return typeof routes.pollTypes === 'number' ? reply(routes.pollTypes, { error: 'down' }) : reply(200, routes.pollTypes);
    if (url.pathname.endsWith('/polls')) {
      const polls = routes.polls[url.searchParams.get('poll_type') ?? ''];
      if (polls === undefined) return reply(400, { error: 'unknown poll_type' });
      return typeof polls === 'number' ? reply(polls, { error: 'failed' }) : reply(200, polls);
    }
    return reply(404, { error: 'not found' });
  }) as typeof fetch;
}
