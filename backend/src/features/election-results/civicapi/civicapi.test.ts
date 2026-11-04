import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CivicApiClient } from './client.js';
import { calledCandidates, parseAggregateResults, parseDetailResults, raceSignature, totalVotes } from './parser.js';
import { normalizeLabel } from './tiers.js';

// Recorded from civicapi.org on Oct 31, 2026, while it served test data. Public data, credited to civicAPI.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('the Senate aggregate gives every 2026 Senate race, keyed by state, with civicAPI ids', () => {
  const parsed = parseAggregateResults(fixture('senate-aggregate.json'), 'SENATE', 2026);
  assert.equal(parsed.kind, 'aggregate');
  assert.equal(parsed.testData, true);
  assert.equal(parsed.races.length, 35);
  assert.equal(parsed.issues.filter((issue) => issue.severity === 'ERROR').length, 0);
  const ga = parsed.races.find((race) => race.label === 'GA-SEN');
  assert(ga);
  assert.equal(ga.sourceContestId, '87087');
  assert.equal(ga.percentReporting, 99.3);
  assert.equal(ga.lastUpdated, parsed.lastUpdated);
  assert.equal(ga.counties, null);
  assert.deepEqual(ga.candidates.map((candidate) => [candidate.name, candidate.partyCode, candidate.sourceCandidateId]), [
    ['Jon Ossoff', 'D', '220200'], ['Mike Collins', 'R', '220201'],
  ]);
  // Ohio and Florida are specials, each the state's only Senate race.
  assert(parsed.races.some((race) => race.label === 'OH-SEN'));
  assert(parsed.races.some((race) => race.label === 'FL-SEN'));
});

test('declared write-ins keep the ballot sync ids and placeholder rows only add to the total', () => {
  const body = fixture('senate-aggregate.json');
  const ohio = parseAggregateResults(body, 'SENATE', 2026).races.find((race) => race.label === 'OH-SEN')!;
  const writeIn = ohio.candidates.find((candidate) => candidate.name === 'Stephen Faris')!;
  assert.equal(writeIn.writeIn, true);
  assert.equal(writeIn.party, null);

  body.region_results.ga.candidates.push({ name: 'Write-ins', party: 'Write-In', votes: 120, percent: 0 });
  const ga = parseAggregateResults(body, 'SENATE', 2026).races.find((race) => race.label === 'GA-SEN')!;
  assert.equal(ga.candidates.length, 2);
  assert.equal(ga.otherVotes, 120);
  assert.equal(totalVotes(ga), 2_361_727 + 2_162_175 + 120);
});

test('House keys map to districts, with -al as the at-large seat', () => {
  const parsed = parseAggregateResults(fixture('house-aggregate.trimmed.json'), 'HOUSE', 2026);
  assert.deepEqual(parsed.races.map((race) => race.label).sort(), ['AK-00', 'CA-22', 'DE-00', 'GA-13', 'NE-02', 'NY-01', 'PA-01', 'PA-07', 'TX-28', 'VA-02']);
  assert.equal(parsed.races.find((race) => race.label === 'PA-07')?.sourceContestId, '87382');
});

test('a detail document carries the call time and counties linked to the race candidates by name', () => {
  const parsed = parseDetailResults(fixture('race-ga-sen.trimmed.json'), { state: 'GA', officeType: 'SENATE', district: null }, '87087');
  assert.equal(parsed.kind, 'detail');
  const [ga] = parsed.races;
  assert.equal(ga.calledAt, '2026-10-31T21:30:45.847Z');
  assert.equal(ga.counties?.length, 6);
  const appling = ga.counties!.find((county) => county.fips === '13001')!;
  assert.equal(appling.percentReporting, 100);
  assert.deepEqual(appling.candidates.map((candidate) => [candidate.sourceCandidateId, candidate.votes]).sort(), [['220200', 1503], ['220201', 6659]]);
  // County rows never carry a call.
  assert(appling.candidates.every((candidate) => !candidate.winner));
  assert.deepEqual(calledCandidates(ga), [{ sourceCandidateId: '220200', kind: 'WINNER' }]);

  const pa = parseDetailResults(fixture('race-pa-07.json'), { state: 'PA', officeType: 'HOUSE', district: '07' }, '87382').races[0];
  assert.deepEqual(pa.counties?.map((county) => county.fips), ['42025', '42077', '42089', '42095']);
  assert.equal(pa.calledAt, null);
});

test('impossible numbers reject one race and leave the others', () => {
  const body = fixture('senate-aggregate.json');
  body.region_results.ga.candidates[0].votes = -5;
  body.region_results.me.percent_reporting = 140;
  const parsed = parseAggregateResults(body, 'SENATE', 2026);
  assert.equal(parsed.races.length, 33);
  assert(!parsed.races.some((race) => race.label === 'GA-SEN' || race.label === 'ME-SEN'));
  assert.deepEqual(parsed.issues.filter((issue) => issue.severity === 'ERROR').map((issue) => issue.code).sort(), ['INVALID_VOTES', 'PERCENT_OUT_OF_RANGE']);
});

test('an unknown shape is an issue, never a crash', () => {
  const parsed = parseAggregateResults({ unexpected: true }, 'HOUSE', 2026);
  assert.equal(parsed.races.length, 0);
  assert(parsed.issues.some((issue) => issue.code === 'NO_REGIONS'));
  assert.equal(parseDetailResults(null, { state: 'PA', officeType: 'HOUSE', district: '07' }, '1').races.length, 0);
});

test('town units without a county FIPS are left out and logged once', () => {
  const body = fixture('race-pa-07.json');
  body.region_results.town = { name: 'Some Town', type: 'Town', percent_reporting: 10, candidates: [] };
  const parsed = parseDetailResults(body, { state: 'PA', officeType: 'HOUSE', district: '07' }, '87382');
  assert.equal(parsed.races[0].counties?.length, 4);
  assert.equal(parsed.issues.filter((issue) => issue.code === 'NON_COUNTY_UNITS').length, 1);
});

test('the signature changes with the numbers and ignores update times', () => {
  const body = fixture('senate-aggregate.json');
  const first = parseAggregateResults(body, 'SENATE', 2026).races.find((race) => race.label === 'GA-SEN')!;
  body.last_updated = '2026-11-04T03:00:00.000Z';
  const sameNumbers = parseAggregateResults(body, 'SENATE', 2026).races.find((race) => race.label === 'GA-SEN')!;
  assert.equal(raceSignature(first), raceSignature(sameNumbers));
  body.region_results.ga.candidates[0].votes += 1;
  const moved = parseAggregateResults(body, 'SENATE', 2026).races.find((race) => race.label === 'GA-SEN')!;
  assert.notEqual(raceSignature(first), raceSignature(moved));
});

test('tier labels accept the usual spellings', () => {
  assert.equal(normalizeLabel('pa-7'), 'PA-07');
  assert.equal(normalizeLabel('AK-AL'), 'AK-00');
  assert.equal(normalizeLabel('ga-sen'), 'GA-SEN');
  assert.equal(normalizeLabel('Georgia'), null);
});

test('the client retries a 5xx once, never a 4xx, and paces requests', async () => {
  const calls: string[] = [];
  const responses = [new Response('busy', { status: 503 }), new Response('{"ok":true}', { status: 200, headers: { etag: '"a"' } }), new Response('nope', { status: 404 })];
  const sleeps: number[] = [];
  const client = new CivicApiClient({
    baseUrl: 'https://civicapi.example/api/v2/', timeoutMs: 1000, maxRps: 1000,
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push(`${url} ${(init.headers as Record<string, string>)['If-None-Match'] ?? ''}`.trim());
      return responses.shift()!;
    }) as typeof fetch,
    sleep: async (ms) => { sleeps.push(ms); },
  });
  const doc = await client.get('race/1');
  assert.deepEqual(doc.payload, { ok: true });
  assert.equal(doc.sha256?.length, 64);
  assert.equal(calls.length, 2);
  await assert.rejects(client.get('race/1'), /404/);
  assert.equal(calls.length, 3);
  assert.match(calls[2], /If|"a"/);
  assert(sleeps.some((ms) => ms >= 250));
});

test('the client retries fast failures up to its attempts, and starts no try after its window', async () => {
  const make = (statuses: number[], options: { attempts?: number; retryWindowMs?: number }) => {
    const calls: number[] = [];
    const client = new CivicApiClient({
      baseUrl: 'https://civicapi.example/api/v2/', timeoutMs: 1000, maxRps: 1000, ...options,
      fetchImpl: (async () => {
        const status = statuses[calls.length] ?? 502;
        calls.push(status);
        return status === 200 ? new Response('{"ok":true}', { status }) : new Response('busy', { status });
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    return { client, calls };
  };
  const fourth = make([502, 502, 502, 200], { attempts: 4 });
  assert.deepEqual((await fourth.client.get('race/1')).payload, { ok: true });
  assert.equal(fourth.calls.length, 4);
  const down = make([502, 502, 502, 502, 502], { attempts: 4 });
  await assert.rejects(down.client.get('race/1'), /502/);
  assert.equal(down.calls.length, 4);
  const closed = make([502, 200], { attempts: 4, retryWindowMs: 0 });
  await assert.rejects(closed.client.get('race/1'), /502/);
  assert.equal(closed.calls.length, 1);
  const missing = make([404, 200], { attempts: 4 });
  await assert.rejects(missing.client.get('race/1'), /404/);
  assert.equal(missing.calls.length, 1);
});
