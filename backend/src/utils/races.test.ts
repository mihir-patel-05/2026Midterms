import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ballotRaces, raceKey, raceLabel, SENATE_RACE_STATES } from './races.js';

test('2026 has 435 House seats, 5 delegates, and 35 Senate races', () => {
  const races = ballotRaces(2026)!;
  const house = races.filter((race) => race.officeType === 'HOUSE');
  const senate = races.filter((race) => race.officeType === 'SENATE');
  const delegates = ['AS', 'DC', 'GU', 'MP', 'VI'];
  assert.equal(house.filter((race) => !delegates.includes(race.state)).length, 435);
  assert.deepEqual(house.filter((race) => delegates.includes(race.state)).map(raceLabel).sort(), delegates.map((state) => `${state}-00`));
  assert.equal(senate.length, 35);
  assert.equal(new Set(races.map(raceKey)).size, races.length);
});

test('every district number is listed, including ones on redrawn maps', () => {
  const labels = new Set(ballotRaces(2026)!.map(raceLabel));
  for (const label of ['CA-01', 'CA-07', 'CA-52', 'TX-38', 'NC-14', 'DE-00', 'OH-SEN', 'FL-SEN']) assert.ok(labels.has(label), label);
  assert.ok(!labels.has('CA-SEN'));
  assert.ok(!labels.has('CA-53'));
});

test("Puerto Rico's Resident Commissioner is elected only in presidential years", () => {
  SENATE_RACE_STATES[2028] = [];
  try {
    assert.ok(!ballotRaces(2026)!.some((race) => race.state === 'PR'));
    assert.ok(ballotRaces(2028)!.some((race) => race.state === 'PR'));
  } finally {
    delete SENATE_RACE_STATES[2028];
  }
});

test('a cycle with no roster falls back to FEC filings', () => {
  assert.equal(ballotRaces(2092), null);
});
