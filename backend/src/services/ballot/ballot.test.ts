import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ballotRaces } from '../../utils/races.js';
import { loadBallot, matchAcrossDistricts, matchBallotToFec, pickSearchResult, type FecCandidate } from './ballot-sync.js';
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
    { id: 'u1', candidateId: 'H4CA05216', name: 'MATSUI, DORIS O', party: 'DEM', race: 'CA-07', receipts: 900_000 },
    { id: 'u2', candidateId: 'H6CA07001', name: 'DOE, JOHN', party: 'REP', race: 'CA-07', receipts: 0 },
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

const candidate = (name: string, party = 'Republican') =>
  ({ sourceCandidateId: name, name, party, partyCode: party === 'Democratic' ? 'D' : 'R', isIncumbent: false, writeIn: false });
const record = (candidateId: string, name: string, race: string, party = 'REP', receipts = 0): FecCandidate =>
  ({ id: candidateId, candidateId, name, party, race, receipts });

// The duplicates below are the FEC records the Oct 30 Testing run could not choose between.
test('duplicate FEC records for one person resolve to the best funded', () => {
  const nc8 = matchBallotToFec([candidate('Mark Harris')], [record('H8NC09123', 'HARRIS, MARK E', 'NC-08', 'REP', 10), record('H4NC08000', 'HARRIS, MARK E', 'NC-08', 'REP', 2_000_000)]);
  assert.equal(nc8[0].fec?.candidateId, 'H4NC08000');
  assert.equal(nc8[0].picked, 'the best funded of 2 records');
  // A nickname or short form: Bob/ROBERT, Rob/ROBERT J.
  const mo3 = matchBallotToFec([candidate('Bob Onder')], [record('A', 'ONDER JR, ROBERT FRANK', 'MO-03', 'REP', 5), record('B', 'ONDER, ROBERT FOR JR.', 'MO-03', 'REP', 900)]);
  assert.equal(mo3[0].fec?.candidateId, 'B');
  const nj8 = matchBallotToFec([candidate('Rob Menendez', 'Democratic')], [record('C', 'MENENDEZ, ROBERT', 'NJ-08', 'DEM', 50), record('D', 'MENENDEZ, ROBERT J.', 'NJ-08', 'DEM', 3_000_000)]);
  assert.equal(nj8[0].fec?.candidateId, 'D');
  // One person filed twice under one name, with a ballot name FEC never uses.
  const nc4 = matchBallotToFec([candidate('Max Ganorkar')], [record('E', 'GANORKAR, MAHESH', 'NC-04'), record('F', 'GANORKAR, MAHESH', 'NC-04', 'REP', 40)]);
  assert.equal(nc4[0].fec?.candidateId, 'F');
});

test('two real people with one surname each get their own record', () => {
  const ak = [record('S4AK00214', 'SULLIVAN, DAN', 'AK-SEN', 'REP', 9_000_000), record('S6AK00999', 'SULLIVAN, DANIEL J', 'AK-SEN', 'REP', 0)];
  // Listed in the order that would let the best-funded rule steal the senator's record.
  const planned = matchBallotToFec([candidate('Daniel J. Jr. Sullivan'), candidate('Dan Sullivan')], ak);
  assert.deepEqual(planned.map((entry) => [entry.name, entry.fec?.candidateId]), [['Daniel J. Jr. Sullivan', 'S6AK00999'], ['Dan Sullivan', 'S4AK00214']]);
  // Different first names that are not nicknames never match.
  const smiths = matchBallotToFec([candidate('Jim Smith'), candidate('Ann Smith')], [record('A', 'SMITH, JOHN', 'NC-08'), record('B', 'SMITH, JANE', 'NC-08')]);
  assert.deepEqual(smiths.map((entry) => entry.fec), [null, null]);
});

test('unmatched candidates say why, and a same-name filing under another district matches', () => {
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
  // Never across chambers, never with another first name, and each record once.
  const again = matchAcrossDistricts({ state: 'NC', officeType: 'HOUSE' }, matchBallotToFec([candidate('Mark Harris')], []), state, used);
  assert.equal(again[0].fec, null);
  assert.match(again[0].noMatch!, /FEC has HARRIS, MARK E \(NC-09\), HARRIS, MARK E \(NC-SEN\)/);
  const other = matchAcrossDistricts({ state: 'NC', officeType: 'HOUSE' }, matchBallotToFec([candidate('Steve Harris')], []), state, new Set());
  assert.equal(other[0].fec, null);
});

test('an OpenFEC search result is chosen by name and party, preferring one running this cycle', () => {
  const result = (candidate_id: string, name: string, party: string, election_years: number[], active_through: number) =>
    ({ candidate_id, name, party, office: 'H', state: 'NY', district: '01', election_years, active_through });
  const results = [
    result('H2NY01190', 'LALOTA, NICHOLAS J', 'REP', [2022, 2024], 2024),
    result('H6NY01001', 'LALOTA, NICHOLAS J', 'REP', [2026], 2026),
    result('H6NY01002', 'LALOTA, MARIA', 'REP', [2026], 2026),
    result('H6NY01003', 'LALOTA, NICK', 'DEM', [2026], 2026),
  ];
  assert.equal(pickSearchResult(candidate('Nick LaLota'), results, 2026)?.candidate_id, 'H6NY01001');
  assert.equal(pickSearchResult(candidate('Nick LaLota'), results.slice(0, 1), 2026)?.candidate_id, 'H2NY01190');
  assert.equal(pickSearchResult(candidate('Ashley Hinson'), results, 2026), null);
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
