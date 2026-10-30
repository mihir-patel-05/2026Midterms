import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ballotRaces } from '../../utils/races.js';
import { loadBallot, matchAcrossDistricts, matchBallotToFec, type FecCandidate } from './ballot-sync.js';
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
        { name: 'Pat Writer', party: 'Write-In', votes: 0 },
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
  assert.deepEqual(ca7.candidates.map((candidate) => [candidate.name, candidate.party, candidate.isIncumbent, candidate.writeIn, candidate.sourceCandidateId]), [
    ['Doris Matsui', 'Democratic', true, false, 'c1'],
    ['Jane Doe', 'Democratic', false, false, 'name:jane doe|D'],
    // A declared write-in: kept, but with no party and flagged.
    ['Pat Writer', null, false, true, 'name:pat writer|O'],
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
    { id: 'u1', candidateId: 'H4CA05216', name: 'MATSUI, DORIS O', party: 'DEM', race: 'CA-07' },
    { id: 'u2', candidateId: 'H6CA07001', name: 'DOE, JOHN', party: 'REP', race: 'CA-07' },
  ];
  const ca7 = parseAggregate(house, 'HOUSE', 2026).races[0];
  const planned = matchBallotToFec(ca7.candidates, fec);
  assert.deepEqual(planned.map((candidate) => [candidate.name, candidate.ballotOrder, candidate.fec?.candidateId ?? null, candidate.noMatch ?? null]), [
    ['Doris Matsui', 0, 'H4CA05216', null],
    // Same surname, but a Republican filing is not this Democrat.
    ['Jane Doe', 1, null, 'FEC lists DOE, JOHN as REP'],
    ['Pat Writer', 2, null, 'declared write-in'],
  ]);
});

test('unmatched candidates say why, and a same-name filing under another district matches', () => {
  const candidate = (name: string, party = 'Republican') =>
    ({ sourceCandidateId: name, name, party, partyCode: 'R', isIncumbent: false, writeIn: false });
  const record = (candidateId: string, name: string, race: string, party = 'REP'): FecCandidate => ({ id: candidateId, candidateId, name, party, race });
  const nc8 = [record('A', 'SMITH, JOHN', 'NC-08'), record('B', 'SMITH, JANE', 'NC-08')];
  const planned = matchBallotToFec([candidate('Mark Harris'), candidate('Jim Smith')], nc8);
  assert.equal(planned[0].noMatch, 'no FEC filer with that surname in this race');
  assert.equal(planned[1].noMatch, '2 FEC filers share the surname: SMITH, JOHN / SMITH, JANE');

  // After a redraw FEC can still list the candidate under their old district number.
  const state = [...nc8, record('H8NC09123', 'HARRIS, MARK E', 'NC-09'), record('S1', 'HARRIS, MARK E', 'NC-SEN')];
  const used = new Set<string>();
  const second = matchAcrossDistricts({ state: 'NC', officeType: 'HOUSE' }, planned, state, used);
  assert.equal(second[0].fec?.candidateId, 'H8NC09123');
  assert.equal(second[0].noMatch, undefined);
  assert.ok(used.has('H8NC09123'));
  // Never across chambers, never with another first initial, and each record once.
  const again = matchAcrossDistricts({ state: 'NC', officeType: 'HOUSE' }, matchBallotToFec([candidate('Mark Harris')], []), state, used);
  assert.equal(again[0].fec, null);
  assert.match(again[0].noMatch!, /FEC has HARRIS, MARK E \(NC-09\), HARRIS, MARK E \(NC-SEN\)/);
  const other = matchAcrossDistricts({ state: 'NC', officeType: 'HOUSE' }, matchBallotToFec([candidate('Steve Harris')], []), state, new Set());
  assert.equal(other[0].fec, null);
});

test('two ballot names that could be one person are flagged, not merged', () => {
  const parsed = parseAggregate({ region_results: { ak: { name: 'Alaska Senate', candidates: [
    { name: 'Dan Sullivan', party: 'Republican' }, { name: 'Daniel J. Jr. Sullivan', party: 'Republican' }, { name: 'Sid Hill', party: 'Independent' },
  ] } } }, 'SENATE', 2026);
  assert.equal(parsed.races[0].candidates.length, 3);
  assert.deepEqual(parsed.issues, ['AK-SEN: "Dan Sullivan" and "Daniel J. Jr. Sullivan" may be the same person; both kept']);
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
