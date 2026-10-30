import assert from 'node:assert/strict';
import { test } from 'node:test';
import { majorParty, matchName, nameParts, sameFirstName, sharesSurname } from './person-name.js';

const lastFirst = (name: string) => {
  const parts = nameParts(name);
  return parts && { last: parts.last, first: parts.first };
};

test('ballot and FEC names reduce to the same surname and first name', () => {
  assert.deepEqual(lastFirst('Doris Matsui'), { last: 'MATSUI', first: 'DORIS' });
  assert.deepEqual(lastFirst('MATSUI, DORIS O'), { last: 'MATSUI', first: 'DORIS' });
  assert.deepEqual(lastFirst('VAN HOLLEN, CHRIS JR.'), { last: 'HOLLEN', first: 'CHRIS' });
  assert.deepEqual(lastFirst('Chris Van Hollen'), { last: 'HOLLEN', first: 'CHRIS' });
  assert.deepEqual(lastFirst('Alexandria Ocasio-Cortez'), { last: 'OCASIO-CORTEZ', first: 'ALEXANDRIA' });
  assert.deepEqual(lastFirst('Robert "Bobby" Scott III'), { last: 'SCOTT', first: 'ROBERT' });
  assert.deepEqual(lastFirst('Nydia Velázquez'), { last: 'VELAZQUEZ', first: 'NYDIA' });
  assert.equal(lastFirst('  '), null);
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

test('first names match through nicknames and short forms, not just initials', () => {
  for (const [a, b] of [['BOB', 'ROBERT'], ['ROB', 'ROBERT'], ['TOM', 'THOMAS'], ['NICK', 'NICHOLAS'], ['MITCH', 'MITCHELL'], ['DAN', 'DANIEL'], ['STEVE', 'STEPHEN'], ['JIM', 'JIMMY']]) {
    assert.ok(sameFirstName(a, b), `${a} ${b}`);
  }
  for (const [a, b] of [['JIM', 'JOHN'], ['ANN', 'JANE'], ['MAX', 'MAHESH'], ['AL', 'ALAN'], ['', 'ROBERT']]) {
    assert.ok(!sameFirstName(a, b), `${a} ${b}`);
  }
});

test('compound, spaced and maiden surnames still match, and only with the same first name for maiden names', () => {
  assert.ok(sharesSurname('Ashley Hinson', 'HINSON ARENHOLZ, ASHLEY'));
  assert.ok(sharesSurname('Ashley Hinson', 'ARENHOLZ, ASHLEY HINSON'));
  assert.ok(!sharesSurname('Caleb Hinson', 'ARENHOLZ, ASHLEY HINSON'));
  assert.ok(sharesSurname('Kevin StClair', 'ST CLAIR, KEVIN'));
  assert.ok(sharesSurname('Kevin St. Clair', 'STCLAIR, KEVIN'));
  assert.ok(sharesSurname('Taner E. Demirci Lopez', 'DEMIRCI LOPEZ, TANER E'));
  assert.ok(sharesSurname('Chris Van Hollen', 'VAN HOLLEN, CHRIS'));
  // A particle alone is no surname.
  assert.ok(!sharesSurname('Joe Van', 'VAN HOLLEN, CHRIS'));
  assert.ok(!sharesSurname('Doris Matsui', 'MATSON, DORIS'));
});
