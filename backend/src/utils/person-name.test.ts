import assert from 'node:assert/strict';
import { test } from 'node:test';
import { majorParty, matchName, nameParts } from './person-name.js';

test('ballot and FEC names reduce to the same surname and first name', () => {
  assert.deepEqual(nameParts('Doris Matsui'), { last: 'MATSUI', first: 'DORIS' });
  assert.deepEqual(nameParts('MATSUI, DORIS O'), { last: 'MATSUI', first: 'DORIS' });
  assert.deepEqual(nameParts('VAN HOLLEN, CHRIS JR.'), { last: 'HOLLEN', first: 'CHRIS' });
  assert.deepEqual(nameParts('Chris Van Hollen'), { last: 'HOLLEN', first: 'CHRIS' });
  assert.deepEqual(nameParts('Alexandria Ocasio-Cortez'), { last: 'OCASIO-CORTEZ', first: 'ALEXANDRIA' });
  assert.deepEqual(nameParts('Robert "Bobby" Scott III'), { last: 'SCOTT', first: 'ROBERT' });
  assert.deepEqual(nameParts('Nydia Velázquez'), { last: 'VELAZQUEZ', first: 'NYDIA' });
  assert.equal(nameParts('  '), null);
});

test('a name matches one candidate, using the first initial only to break a surname tie', () => {
  const fec = [{ name: 'MATSUI, DORIS O' }, { name: 'SMITH, JOHN' }, { name: 'SMITH, MARY' }];
  assert.equal(matchName('Doris Matsui', fec), fec[0]);
  assert.equal(matchName('Mary Smith', fec), fec[2]);
  assert.equal(matchName('Pat Smith', fec), null);
  assert.equal(matchName('Jane Doe', fec), null);
});

test('only Democrats and Republicans get a major party', () => {
  for (const party of ['DEM', 'D', 'Democratic', 'Democratic Party', 'Democratic-Farmer-Labor', 'DFL']) assert.equal(majorParty(party), 'D', party);
  for (const party of ['REP', 'R', 'Republican', 'GOP']) assert.equal(majorParty(party), 'R', party);
  for (const party of ['IND', 'Libertarian', 'No Party Preference', '', null]) assert.equal(majorParty(party), null, String(party));
});
