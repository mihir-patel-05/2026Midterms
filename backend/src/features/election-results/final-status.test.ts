import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FinalStatusSchema } from './contracts.js';
import { deriveFinalStatus, type FinalStatusInput } from './final-status.js';

const now = new Date('2026-11-12T20:00:00Z');
const base: FinalStatusInput = {
  now, stateCode: 'WV', lastChangedAt: new Date('2026-11-09T15:00:00Z'), latestEvent: null, deadline: null,
  ballotCandidates: 2, hasWinnerCall: true, hasAdvancedCall: false,
};
const derive = (input: Partial<FinalStatusInput>) => FinalStatusSchema.parse(deriveFinalStatus({ ...base, ...input }));

test('totals unchanged for 72 hours read "no change since"; a recent change reads "still counting"', () => {
  const stable = derive({});
  assert.equal(stable.status, 'STABLE');
  assert.equal(stable.label, 'Unofficial · no change since Nov 9');
  const counting = derive({ lastChangedAt: new Date('2026-11-11T03:00:00Z') });
  assert.equal(counting.status, 'COUNTING');
  // 03:00 UTC on Nov 11 is the evening of Nov 10 in Eastern time.
  assert.equal(counting.label, 'Unofficial · still counting · last change Nov 10');
  assert.equal(derive({ lastChangedAt: new Date(now.getTime() - 72 * 3_600_000) }).status, 'STABLE');
});

test('a recorded certification, recount or contest comes first, with its source', () => {
  const certified = derive({
    latestEvent: { type: 'CERTIFIED', certification: 'CERTIFIED', effectiveAt: new Date('2026-12-04T17:00:00Z'), sourceUrl: 'https://sos.wv.gov/results', notes: null },
    ballotCandidates: 1,
  });
  assert.equal(certified.status, 'CERTIFIED');
  assert.equal(certified.label, 'Certified Dec 4');
  assert.equal(certified.sourceUrl, 'https://sos.wv.gov/results');
  const recount = derive({ latestEvent: { type: 'RECOUNT_STARTED', certification: 'RECOUNT', effectiveAt: new Date('2026-11-20T15:00:00Z'), sourceUrl: 'https://www.sos.state.mn.us/', notes: ' Automatic: margin under 0.25% ' } });
  assert.equal(recount.status, 'RECOUNT');
  assert.equal(recount.notes, 'Automatic: margin under 0.25%');
  assert.equal(derive({ latestEvent: { type: 'CONTESTED', certification: 'CONTESTED', effectiveAt: now, sourceUrl: 'https://example.gov/', notes: null } }).status, 'CONTESTED');
  // A recount completed and certified again is certified.
  assert.equal(derive({ latestEvent: { type: 'RECOUNT_COMPLETED', certification: 'CERTIFIED', effectiveAt: now, sourceUrl: 'https://example.gov/', notes: null } }).status, 'CERTIFIED');
  // An event that settles nothing (canvass started) leaves the count-based status.
  assert.equal(derive({ latestEvent: { type: 'CANVASS_STARTED', certification: 'CANVASSING', effectiveAt: now, sourceUrl: 'https://example.gov/', notes: null } }).status, 'STABLE');
});

test('unopposed, runoff and ranked-choice races get their own words, never a share or a zero', () => {
  assert.equal(derive({ ballotCandidates: 1 }).label, 'Unopposed');
  assert.equal(derive({ stateCode: 'LA', hasWinnerCall: false, hasAdvancedCall: true }).status, 'RUNOFF');
  const firstChoice = derive({ stateCode: 'AK', hasWinnerCall: false });
  assert.equal(firstChoice.status, 'RANKED_CHOICE');
  assert.equal(firstChoice.label, 'First-choice votes · ranked-choice count by the state');
  // A Maine race won outright on first choices is an ordinary race.
  assert.equal(derive({ stateCode: 'ME', hasWinnerCall: true }).status, 'STABLE');
  const round = { round: 3, sourceUrl: 'https://www.elections.alaska.gov/', results: [{ candidateId: 'p1', candidacyId: 'c1', votes: 150_000, isWinner: true }] };
  const final = derive({ stateCode: 'AK', hasWinnerCall: true, rankedChoiceFinalRound: round });
  assert.equal(final.label, 'Ranked-choice final round · unofficial');
  assert.deepEqual(final.rankedChoiceFinalRound, round);
});

test('the certification deadline is passed through with its source', () => {
  const status = derive({ deadline: { deadline: new Date('2026-12-01T00:00:00Z'), sourceUrl: 'https://www.ncsl.org/' } });
  assert.equal(status.certificationDeadline, '2026-12-01');
  assert.equal(status.certificationDeadlineSourceUrl, 'https://www.ncsl.org/');
});
