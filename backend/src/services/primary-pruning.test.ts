import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findPrimaryLosers,
  generalElectionDate,
  nomineeIds,
  pruningOpensOn,
  raceOf,
  type RaceCandidate,
} from './primary-pruning.service.js';

const candidate = (candidateId: string, state: string, office: string, district: string | null): RaceCandidate => ({
  candidateId,
  state,
  office,
  district,
});

test('the general election is the Tuesday after the first Monday in November', () => {
  assert.equal(generalElectionDate(2026).toISOString().slice(0, 10), '2026-11-03');
  assert.equal(generalElectionDate(2028).toISOString().slice(0, 10), '2028-11-07');
  assert.equal(generalElectionDate(2022).toISOString().slice(0, 10), '2022-11-08');
  // November 1 is itself a Tuesday: the election is a week later.
  assert.equal(generalElectionDate(2033).toISOString().slice(0, 10), '2033-11-08');
});

test('pruning opens a few days after pre-general reports are due', () => {
  assert.equal(pruningOpensOn(2026).toISOString().slice(0, 10), '2026-10-25');
});

test('races are keyed by state and seat, with at-large and Senate seats normalised', () => {
  assert.equal(raceOf(candidate('S6GA00119', 'GA', 'S', '00')), 'GA-SEN');
  assert.equal(raceOf(candidate('H6PA07001', 'PA', 'H', '7')), 'PA-07');
  assert.equal(raceOf(candidate('H6DE00001', 'DE', 'H', null)), 'DE-00');
  assert.equal(raceOf(candidate('H6GA23001', 'GA', 'H', '23')), 'GA-?23');
});

test('nominees are the candidates whose committee filed a general election report', () => {
  const nominees = nomineeIds(
    [{ committee_id: 'C1' }, { committee_id: 'C1' }, { committee_id: 'C3' }],
    [
      { committee_id: 'C1', name: 'DOE FOR CONGRESS', candidate_ids: ['H6PA07001'] },
      { committee_id: 'C2', name: 'ROE FOR CONGRESS', candidate_ids: ['H6PA07002'] },
      { committee_id: 'C3', name: 'NO CANDIDATE' },
    ],
  );
  assert.deepEqual([...nominees], ['H6PA07001']);
});

test('only non-nominees in races with a nominee are primary losers', () => {
  const candidates = [
    candidate('H6PA07001', 'PA', 'H', '07'), // nominee
    candidate('H6PA07002', 'PA', 'H', '07'), // nominee
    candidate('H6PA07003', 'PA', 'H', '7'), // lost the primary
    candidate('H6PA08001', 'PA', 'H', '08'), // no one in PA-08 has filed yet
    candidate('S6PA00001', 'PA', 'S', null), // the Senate is a different race
    candidate('H6PA99001', 'PA', 'H', '99'), // a district that does not exist
  ];
  const losers = findPrimaryLosers(candidates, new Set(['H6PA07001', 'H6PA07002']));
  assert.deepEqual(losers.map((loser) => loser.candidateId), ['H6PA07003']);
});
