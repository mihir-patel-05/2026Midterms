import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CivicApiError, type FetchedDocument } from '../../features/election-results/civicapi/client.js';
import { earlyVoteStateParams } from '../../routes/early-vote.routes.js';
import {
  EarlyVoteParseError,
  EarlyVoteTracker,
  EarlyVoteUnavailableError,
  parseEarlyVoteDocument,
  partyKey,
} from './early-vote.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const leaf = (votes: number) => ({ votes, color: '#999999' });

test('the recorded national document reads every state, and its total is civicAPI\'s own', () => {
  const doc = parseEarlyVoteDocument(fixture('us-returned.json'), { region: 'US', category: 'returned' });
  assert.equal(doc.snapshotDate, '2026-11-02');
  assert.equal(Object.keys(doc.areas).length, 45);
  assert.deepEqual(doc.areas.AZ, { total: 597182 + 396639 + 609406, parties: { dem: 597182, rep: 609406, npa: 0, other: 396639, unknown: 0 } });
  // Georgia publishes no party: every ballot is "Unspecified", never Democratic or Republican.
  assert.equal(doc.areas.GA.parties.unknown, doc.areas.GA.total);
  assert.equal(doc.areas.GA.parties.dem, 0);
  const sum = Object.values(doc.areas).reduce((total, tally) => total + tally.total, 0);
  assert.equal(doc.total.total, sum);
  assert.deepEqual(doc.unknownLabels, []);
});

test('the recorded Arizona document has its counties, and they add up to the state', () => {
  const doc = parseEarlyVoteDocument(fixture('az-returned.json'), { region: 'AZ', category: 'returned' });
  assert.equal(Object.keys(doc.areas).length, 15);
  assert.ok(doc.areas.Maricopa.total > 0);
  assert.equal(Object.values(doc.areas).reduce((total, tally) => total + tally.total, 0), doc.total.total);
});

test('party labels map to fixed buckets, and an unknown label is other, never no party', () => {
  assert.equal(partyKey('Democratic'), 'dem');
  assert.equal(partyKey('REPUBLICAN'), 'rep');
  assert.equal(partyKey('No Party Affiliation'), 'npa');
  assert.equal(partyKey('Unaffiliated'), 'npa');
  assert.equal(partyKey('Unspecified'), 'unknown');
  assert.equal(partyKey('Green'), 'other');
  assert.equal(partyKey('Other'), 'other');
  assert.equal(partyKey('Forward'), null);
  const doc = parseEarlyVoteDocument(
    { state: 'NV', category: 'returned', snapshot_date: '2026-10-31', regions: { Clark: { Forward: leaf(5), Democratic: leaf(10) } } },
    { region: 'NV', category: 'returned' },
  );
  assert.deepEqual(doc.total.parties, { dem: 10, rep: 0, npa: 0, other: 5, unknown: 0 });
  assert.deepEqual(doc.unknownLabels, ['Forward']);
});

test('a document for another place or category, or of the wrong shape, is rejected', () => {
  const body = { state: 'PA', category: 'returned', snapshot_date: '2026-11-02', regions: { Adams: { Democratic: leaf(1) } } };
  assert.throws(() => parseEarlyVoteDocument(body, { region: 'NC', category: 'returned' }), EarlyVoteParseError);
  assert.throws(() => parseEarlyVoteDocument(body, { region: 'PA', category: 'inperson' }), EarlyVoteParseError);
  assert.throws(() => parseEarlyVoteDocument({ ...body, regions: { Adams: { Democratic: { votes: -3 } } } }, { region: 'PA', category: 'returned' }), EarlyVoteParseError);
  assert.throws(() => parseEarlyVoteDocument({ error: 'early-vote data not found' }, { region: 'PA', category: 'returned' }), EarlyVoteParseError);
});

test('a national document drops places that are not states, and an unreadable date is null', () => {
  const doc = parseEarlyVoteDocument(
    { state: 'US', category: 'inperson', snapshot_date: 'yesterday', regions: { pa: { Democratic: leaf(3) }, ZZ: { Democratic: leaf(9) } } },
    { region: 'US', category: 'inperson' },
  );
  assert.deepEqual(Object.keys(doc.areas), ['PA']);
  assert.equal(doc.snapshotDate, null);
  assert.equal(doc.total.total, 3);
});

test('state codes for the route: any case; never the nation or an unknown code', () => {
  assert.equal(earlyVoteStateParams.safeParse({ state: 'pa' }).data?.state, 'PA');
  assert.equal(earlyVoteStateParams.safeParse({ state: 'DC' }).success, true);
  assert.equal(earlyVoteStateParams.safeParse({ state: 'US' }).success, false);
  assert.equal(earlyVoteStateParams.safeParse({ state: 'ZZ' }).success, false);
});

/** A civicAPI stand-in: path → payload, an Error to throw, or nothing (404). */
function fakeClient(routes: Record<string, unknown>) {
  const calls: string[] = [];
  return {
    calls,
    routes,
    /** State documents wait for this while it is set, so a test can look before they arrive. */
    gate: null as Promise<void> | null,
    async get(path: string): Promise<FetchedDocument> {
      calls.push(path);
      if (this.gate && !path.startsWith('early-vote/US/')) await this.gate;
      const value = routes[path];
      if (value instanceof Error) throw value;
      if (value === undefined) throw new CivicApiError(`civicAPI /${path} returned 404`, 404);
      return { providerKey: 'civicapi', fetchedAt: new Date().toISOString(), sourceUrl: path, payload: value, bytes: Buffer.alloc(0), httpStatus: 200, notModified: false };
    },
  };
}

const nationalDoc = (category: string, regions: Record<string, Record<string, number>>, date = '2026-11-02') => ({
  state: 'US', category, election_name: `US ${category}`, snapshot_date: date,
  regions: Object.fromEntries(Object.entries(regions).map(([state, parties]) => [state, Object.fromEntries(Object.entries(parties).map(([party, votes]) => [party, leaf(votes)]))])),
});
const stateDoc = (state: string, category: string, date: string, counties: Record<string, Record<string, number>>) => ({
  state, category, election_name: `${state} ${category}`, snapshot_date: date,
  regions: Object.fromEntries(Object.entries(counties).map(([county, parties]) => [county, Object.fromEntries(Object.entries(parties).map(([party, votes]) => [party, leaf(votes)]))])),
});

function setup() {
  let clock = Date.parse('2026-11-02T15:00:00Z');
  const client = fakeClient({
    'early-vote/US/returned': nationalDoc('returned', { PA: { Democratic: 30, Republican: 20 }, GA: { Unspecified: 100 } }),
    'early-vote/US/inperson': nationalDoc('inperson', { GA: { Unspecified: 40 } }),
    'early-vote/US/requested': nationalDoc('requested', { PA: { Democratic: 60, Republican: 40 } }),
    'early-vote/PA/returned': stateDoc('PA', 'returned', '2026-11-02', { Adams: { Democratic: 5, Republican: 12 }, Allegheny: { Democratic: 25, Republican: 8 } }),
    'early-vote/GA/returned': stateDoc('GA', 'returned', '2026-10-31', { Fulton: { Unspecified: 100 } }),
    'early-vote/GA/inperson': stateDoc('GA', 'inperson', '2026-10-31', { Fulton: { Unspecified: 40 } }),
    'early-vote/PA/requested': stateDoc('PA', 'requested', '2026-11-01', { Adams: { Democratic: 60, Republican: 40 } }),
  });
  const logs: string[] = [];
  const tracker = new EarlyVoteTracker(client, { refreshMs: 120_000, now: () => clock, log: (message) => logs.push(message) });
  return { client, tracker, logs, tick: (ms: number) => { clock += ms; } };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('national numbers come first, undated; each state then shows its own document\'s numbers and date', async () => {
  const { tracker, client } = setup();
  let open = () => {};
  client.gate = new Promise((resolve) => { open = resolve; });
  const first = await tracker.national();
  assert.equal(first.categories.returned.total.total, 150);
  assert.equal(first.categories.returned.states, 2);
  assert.equal(first.categories.returned.partyStates, 1);
  assert.equal(first.categories.returned.undated, 2);
  assert.equal(first.categories.returned.asOfRange, null);
  assert.equal(first.states.find((row) => row.state === 'PA')!.categories.returned!.asOf, null);
  client.gate = null;
  open();
  await tracker.sweepStates();
  const after = await tracker.national();
  const ga = after.states.find((row) => row.state === 'GA')!;
  assert.equal(ga.categories.returned?.asOf, '2026-10-31');
  assert.equal(ga.categories.requested, undefined);
  assert.equal(after.states.find((row) => row.state === 'PA')!.categories.requested?.asOf, '2026-11-01');
  assert.deepEqual(after.categories.returned.asOfRange, { oldest: '2026-10-31', newest: '2026-11-02' });
  assert.equal(after.categories.returned.undated, 0);
  assert.equal(after.changedAt, null);
});

test('a state document fresher than the national one wins, and national totals are the sum of the rows', async () => {
  const { tracker, client } = setup();
  client.routes['early-vote/PA/returned'] = stateDoc('PA', 'returned', '2026-11-02', { Adams: { Democratic: 10, Republican: 12 }, Allegheny: { Democratic: 25, Republican: 8 } });
  await tracker.national();
  await tracker.sweepStates();
  const data = await tracker.national();
  const pa = data.states.find((row) => row.state === 'PA')!.categories.returned!;
  assert.equal(pa.total, 55);
  assert.equal(pa.asOf, '2026-11-02');
  assert.equal(data.categories.returned.total.total, 155);
  assert.equal(data.categories.returned.total.parties.dem, 35);
  // Switching from the national number to the state's own is not a change in the count.
  assert.equal(pa.changedAt, null);
});

test('when a state\'s number moves it is read again, no sooner than a refresh, and the change is timed', async () => {
  const { client, tracker, tick } = setup();
  await tracker.national();
  await tracker.sweepStates();
  const reads = () => client.calls.filter((path) => path === 'early-vote/PA/returned').length;
  assert.equal(reads(), 1);
  client.routes['early-vote/US/returned'] = nationalDoc('returned', { PA: { Democratic: 35, Republican: 20 }, GA: { Unspecified: 100 } });
  client.routes['early-vote/PA/returned'] = stateDoc('PA', 'returned', '2026-11-03', { Adams: { Democratic: 10, Republican: 12 }, Allegheny: { Democratic: 25, Republican: 8 } });
  // Too soon: the held answer is fresh, so neither document is read again.
  await tracker.state('PA');
  assert.equal(reads(), 1);
  tick(121_000);
  await tracker.national(); // serves the held answer and refreshes behind it
  await settle();
  await tracker.sweepStates();
  assert.equal(reads(), 2);
  const moved = await tracker.national();
  const pa = moved.states.find((row) => row.state === 'PA')!.categories.returned!;
  assert.equal(pa.total, 55);
  assert.equal(pa.asOf, '2026-11-03');
  assert.equal(pa.changedAt, new Date(Date.parse('2026-11-02T15:00:00Z') + 121_000).toISOString());
  assert.equal(moved.changedAt, pa.changedAt);
  assert.equal(moved.states.find((row) => row.state === 'GA')!.categories.returned!.changedAt, null);
});

test('civicAPI is read again only after the refresh interval, and a failed refresh keeps the last good answer', async () => {
  const { client, tracker, tick } = setup();
  await tracker.national();
  const reads = () => client.calls.filter((path) => path.startsWith('early-vote/US/')).length;
  assert.equal(reads(), 3);
  await tracker.national();
  assert.equal(reads(), 3);
  client.routes['early-vote/US/returned'] = new CivicApiError('civicAPI /early-vote/US/returned returned 502', 502);
  tick(121_000);
  await tracker.national();
  await settle();
  assert.equal(reads(), 6);
  assert.equal((await tracker.national()).categories.returned.total.total, 150);
});

test('with nothing read yet and civicAPI down, the tracker says unavailable rather than serving zeros', async () => {
  const down = new CivicApiError('down', null);
  const tracker = new EarlyVoteTracker(fakeClient({ 'early-vote/US/returned': down, 'early-vote/US/inperson': down, 'early-vote/US/requested': down }), { refreshMs: 60_000, log: () => {} });
  await assert.rejects(() => tracker.national(), EarlyVoteUnavailableError);
});

test('a state\'s detail lists its counties, largest first; a state civicAPI does not list has no categories', async () => {
  const { tracker, client } = setup();
  const [pa] = await Promise.all([tracker.state('PA'), tracker.state('PA'), tracker.sweepStates()]);
  assert.deepEqual(Object.keys(pa.categories).sort(), ['requested', 'returned']);
  assert.deepEqual(pa.categories.returned!.counties.map((county) => county.name), ['Allegheny', 'Adams']);
  assert.equal(pa.categories.returned!.asOf, '2026-11-02');
  assert.equal(pa.categories.returned!.label, 'Mail ballots returned');
  // Two viewers and the sweep at once still read the document once.
  assert.equal(client.calls.filter((path) => path === 'early-vote/PA/returned').length, 1);
  const nc = await tracker.state('NC');
  assert.deepEqual(nc.categories, {});
  assert.ok(!client.calls.includes('early-vote/NC/returned'));
});

test('when a state\'s own document fails, its national number still shows, with no date and no counties', async () => {
  const { tracker, client, logs } = setup();
  client.routes['early-vote/GA/inperson'] = new CivicApiError('civicAPI /early-vote/GA/inperson returned 500', 500);
  const ga = await tracker.state('GA');
  assert.equal(ga.categories.inperson!.total, 40);
  assert.equal(ga.categories.inperson!.asOf, null);
  assert.deepEqual(ga.categories.inperson!.counties, []);
  assert.ok(logs.some((line) => line.includes('GA inperson failed')));
});
