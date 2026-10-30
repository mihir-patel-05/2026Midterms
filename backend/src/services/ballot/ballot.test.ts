import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ballotRaces } from '../../utils/races.js';
import { loadBallot, matchBallotToFec, type FecCandidate } from './ballot-sync.js';
import { parseAggregate, partyCode, raceFromRegion } from './civicapi-ballot.js';

// Shaped like civicAPI's House aggregate as docs/plans/civicapi-results.md describes it.
// Not recorded: civicAPI was unreachable when this was written, and the CA-07 names are illustrative.
const house = {
  region_results: {
    'ca-07': {
      election_id: 9001, name: 'California 7th District', percent_reporting: 0,
      candidates: [
        { candidate_id: 'c1', name: 'Doris Matsui', party: 'Democratic', votes: 0, incumbent: true },
        { name: 'Jane Doe', party: 'Democratic', votes: 0 },
        { name: 'Write-ins', party: '', votes: 0 },
      ],
    },
    'ak-al': { election_id: 9002, name: 'Alaska At-Large', candidates: [{ name: 'Mary Peltola', party: 'Democratic' }] },
    'pr-al': { election_id: 9003, name: 'Puerto Rico', candidates: [] },
    'ca-53': { election_id: 9004, name: 'Not a seat', candidates: [] },
  },
};

test('region keys map to races on the ballot, and nothing else', () => {
  assert.deepEqual(raceFromRegion('ca-07', 'HOUSE', 2026), { state: 'CA', officeType: 'HOUSE', district: '07' });
  assert.deepEqual(raceFromRegion('AK-AL', 'HOUSE', 2026), { state: 'AK', officeType: 'HOUSE', district: '00' });
  assert.deepEqual(raceFromRegion('oh', 'SENATE', 2026), { state: 'OH', officeType: 'SENATE', district: null });
  assert.equal(raceFromRegion('ca', 'SENATE', 2026), null, 'no CA Senate race in 2026');
  assert.equal(raceFromRegion('ca-53', 'HOUSE', 2026), null);
  assert.equal(raceFromRegion('pr-al', 'HOUSE', 2026), null, 'Puerto Rico votes in 2028');
});

test('an aggregate becomes races with their ballot candidates, placeholders dropped', () => {
  const parsed = parseAggregate(house, 'HOUSE', 2026);
  assert.deepEqual(parsed.races.map((race) => race.label), ['CA-07', 'AK-00']);
  const ca7 = parsed.races[0];
  assert.equal(ca7.sourceContestId, '9001');
  assert.deepEqual(ca7.candidates.map((candidate) => [candidate.name, candidate.partyCode, candidate.isIncumbent, candidate.sourceCandidateId]), [
    ['Doris Matsui', 'D', true, 'c1'],
    ['Jane Doe', 'D', false, 'name:jane doe|D'],
  ]);
  assert.equal(parsed.issues.length, 2);
  assert.ok(parsed.issues.some((issue) => issue.includes('"ca-53"')));
  assert.deepEqual(parseAggregate({ nope: true }, 'SENATE', 2026).issues, ['SENATE aggregate has no region_results']);
});

test('party names reduce to short codes', () => {
  assert.deepEqual(['Democratic', 'Republican', 'Libertarian', 'Green', 'No Party Preference', 'Independent', 'Constitution', null].map(partyCode),
    ['D', 'R', 'L', 'G', 'I', 'I', 'O', 'O']);
});

test('ballot candidates match FEC records by name, once each, and never across major parties', () => {
  const fec: FecCandidate[] = [
    { id: 'u1', candidateId: 'H4CA05216', name: 'MATSUI, DORIS O', party: 'DEM' },
    { id: 'u2', candidateId: 'H6CA07001', name: 'DOE, JOHN', party: 'REP' },
  ];
  const ca7 = parseAggregate(house, 'HOUSE', 2026).races[0];
  const planned = matchBallotToFec(ca7.candidates, fec);
  assert.deepEqual(planned.map((candidate) => [candidate.name, candidate.ballotOrder, candidate.fec?.candidateId ?? null]), [
    ['Doris Matsui', 0, 'H4CA05216'],
    // Same surname, but a Republican filing is not this Democrat.
    ['Jane Doe', 1, null],
  ]);
});

test('an aggregate missing most races is refused before anything is written', async () => {
  const full = (office: 'HOUSE' | 'SENATE') => ({
    region_results: Object.fromEntries(ballotRaces(2026)!.filter((race) => race.officeType === office).map((race) => [
      office === 'SENATE' ? race.state.toLowerCase() : `${race.state.toLowerCase()}-${race.district === '00' ? 'al' : race.district}`,
      { name: 'x', candidates: [{ name: 'A Candidate', party: 'Democratic' }] },
    ])),
  });
  const ok = await loadBallot(2026, async (url) => (url.endsWith('/87524') ? full('HOUSE') : full('SENATE')));
  assert.equal(ok.races.length, 475);
  await assert.rejects(loadBallot(2026, async (url) => (url.endsWith('/87524') ? house : full('SENATE'))), /HOUSE aggregate has 2 of 440 races/);
});
