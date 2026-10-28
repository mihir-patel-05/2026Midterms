import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexCandidates, isOtherAnswer, matchRace } from './race-match.js';
import { CANDIDATES, votehubPoll } from './test-fixtures.js';
import { parseVoteHubPoll, type ParsedPoll } from './votehub-client.js';

const races = indexCandidates(CANDIDATES);
const poll = (overrides: Record<string, unknown> = {}): ParsedPoll => {
  const parsed = parseVoteHubPoll(votehubPoll(overrides));
  assert.ok(parsed.ok);
  return parsed.poll;
};

test('candidates are grouped into races, dropping districts that do not exist', () => {
  assert.deepEqual([...races.keys()].sort(), ['AK-00', 'MI-03', 'NE-SEN', 'OH-SEN', 'PA-07', 'TX-15', 'TX-SEN']);
  // "7" and "07" are one district; an at-large seat is "00" whatever the filing says.
  assert.equal(races.get('PA-07')?.length, 2);
  assert.equal(races.get('AK-00')?.length, 2);
});

test('a two-party poll is matched and published with each answer linked to its candidate', () => {
  const match = matchRace(poll(), races);
  assert.equal(match.raceCode, 'OH-SEN');
  assert.equal(match.status, 'PUBLISHED');
  assert.equal(match.reviewReason, null);
  assert.deepEqual(match.answers, [
    { choice: 'Brown', pct: 47, party: 'DEM', candidateFecId: 'S6OH00001' },
    { choice: 'Husted', pct: 48, party: 'REP', candidateFecId: 'S6OH00002' },
    { choice: 'Undecided', pct: 5, party: null, candidateFecId: null },
  ]);
});

test('full names, accents, multi-word last names, and independents match', () => {
  const ne = matchRace(poll({ answers: [{ choice: 'Dan Osborn', pct: 46 }, { choice: 'Pete Ricketts', pct: 49 }] }), races);
  assert.equal(ne.raceCode, 'NE-SEN');
  assert.equal(ne.status, 'PUBLISHED');

  const tx15 = matchRace(poll({ poll_type: 'us-representative', answers: [{ choice: 'Mónica De La Cruz', pct: 52 }, { choice: 'Bobby Vallejo (D)', pct: 44 }] }), races);
  assert.equal(tx15.raceCode, 'TX-15');
  assert.deepEqual(tx15.answers.map((answer) => answer.candidateFecId), ['H6TX15001', 'H6TX15002']);

  const ak = matchRace(poll({ poll_type: 'us-representative', answers: [{ choice: 'Begich', pct: 50 }, { choice: 'Peltola', pct: 48 }] }), races);
  assert.equal(ak.raceCode, 'AK-00');
});

test('a shared last name is told apart by first name, and left unmatched without one', () => {
  const both = matchRace(poll({ poll_type: 'us-representative', answers: [{ choice: 'John Smith', pct: 49 }, { choice: 'Alice Smith', pct: 47 }] }), races);
  assert.equal(both.raceCode, 'MI-03');
  assert.equal(both.status, 'PUBLISHED');

  const bare = matchRace(poll({ poll_type: 'us-representative', answers: [{ choice: 'Smith', pct: 49 }, { choice: 'Smith Jr.', pct: 47 }] }), races);
  assert.equal(bare.raceCode, null);
  assert.equal(bare.reviewReason, 'no_race_match');
});

test('a one-party poll is held as a likely primary', () => {
  const match = matchRace(poll({ answers: [{ choice: 'Paxton', pct: 44 }, { choice: 'Cornyn', pct: 41 }, { choice: 'Not sure', pct: 15 }] }), races);
  assert.equal(match.raceCode, 'TX-SEN');
  assert.equal(match.status, 'NEEDS_REVIEW');
  assert.equal(match.reviewReason, 'likely_primary');
});

test('a poll that matches no race, or only one candidate, waits for review', () => {
  const none = matchRace(poll({ answers: [{ choice: 'Jane Doe', pct: 50 }, { choice: 'John Roe', pct: 45 }] }), races);
  assert.equal(none.status, 'NEEDS_REVIEW');
  assert.equal(none.reviewReason, 'no_race_match');
  // The record's own hints are kept for the reviewer.
  assert.equal(none.state, 'OH');

  const one = matchRace(poll({ answers: [{ choice: 'Brown', pct: 50 }, { choice: 'Someone else', pct: 45 }] }), races);
  assert.equal(one.reviewReason, 'no_race_match');

  // The office decides which races are searched.
  const wrongOffice = matchRace(poll({ poll_type: 'us-representative' }), races);
  assert.equal(wrongOffice.reviewReason, 'no_race_match');
});

test('a tie between races is broken by the state the record names, or left for review', () => {
  const tied = new Map(races);
  tied.set('WI-SEN', [
    { fecId: 'S6WI00001', name: 'BROWN, AMY', party: 'DEM', office: 'SENATE', state: 'WI', district: null },
    { fecId: 'S6WI00002', name: 'HUSTED, MARK', party: 'REP', office: 'SENATE', state: 'WI', district: null },
  ]);
  assert.equal(matchRace(poll(), tied).raceCode, 'OH-SEN');
  const noHint = matchRace(poll({ subject: null }), tied);
  assert.equal(noHint.raceCode, null);
  assert.equal(noHint.reviewReason, 'ambiguous_race');
});

test('non-candidate answers are recognised', () => {
  for (const choice of ['Undecided', 'Other', "Don't know", 'Someone else', 'Third party candidate', 'Would not vote']) assert.equal(isOtherAnswer(choice), true, choice);
  for (const choice of ['Brown', 'Otherson', 'Nonely']) assert.equal(isOtherAnswer(choice), false, choice);
});
