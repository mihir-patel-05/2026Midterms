import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DistrictLookupError, DistrictLookupService, parseGeocodioResult } from './district-lookup.service.js';

// Trimmed Geocodio v2 /geocode?fields=cd120 responses recorded on 2026-10-06.
const cd = (district_number: number, ocd: string, proportion = 1) => ({
  district_number, congress_number: '120th', ocd_id: `ocd-division/country:us/${ocd}`, proportion,
});
const austin = {
  formatted_address: '500 Congress Ave, Austin, TX 78701', accuracy_type: 'rooftop',
  location: { lat: 30.267437, lng: -97.743552 },
  fields: { congressional_districts: [cd(10, 'state:tx/cd:10')] },
};
const zip78701 = {
  formatted_address: 'Austin, TX 78701', accuracy_type: 'place',
  location: { lat: 30.268335, lng: -97.741382 },
  fields: { congressional_districts: [cd(37, 'state:tx/cd:37', 0.239), cd(10, 'state:tx/cd:10', 0.761)] },
};
const cheyenne = {
  formatted_address: '2001 Capitol Ave, Cheyenne, WY 82001', accuracy_type: 'rooftop',
  location: { lat: 41.136896, lng: -104.817621 },
  fields: { congressional_districts: [cd(0, 'state:wy/cd:at-large')] },
};
const whiteHouse = {
  formatted_address: '1600 Pennsylvania Ave NW, Washington, DC 20500', accuracy_type: 'rooftop',
  location: { lat: 38.897675, lng: -77.036547 },
  fields: { congressional_districts: [cd(98, 'district:dc/cd:at-large')] },
};

test('a rooftop match resolves to its 2026 district', () => {
  const result = parseGeocodioResult(austin);
  assert.deepEqual(result?.districts, [{ state: 'TX', district: '10', proportion: 1 }]);
  assert.equal(result?.congress, 120);
  assert.equal(result?.accuracyType, 'rooftop');
});

test('a ZIP spanning districts lists each, largest share first', () => {
  assert.deepEqual(parseGeocodioResult(zip78701)?.districts, [
    { state: 'TX', district: '10', proportion: 0.761 },
    { state: 'TX', district: '37', proportion: 0.239 },
  ]);
});

test('at-large seats and the DC delegate normalize to district 00', () => {
  assert.deepEqual(parseGeocodioResult(cheyenne)?.districts, [{ state: 'WY', district: '00', proportion: 1 }]);
  assert.deepEqual(parseGeocodioResult(whiteHouse)?.districts, [{ state: 'DC', district: '00', proportion: 1 }]);
});

test('results with no 2026 district are treated as unresolvable', () => {
  assert.equal(parseGeocodioResult(undefined), null);
  assert.equal(parseGeocodioResult({ ...austin, fields: { congressional_districts: [] } }), null);
  const only119 = { ...austin, fields: { congressional_districts: [{ ...cd(37, 'state:tx/cd:37'), congress_number: '119th' }] } };
  assert.equal(parseGeocodioResult(only119), null);
});

function service(responses: Array<{ status: number; body?: unknown }>, options: { dailyLookupLimit?: number; apiKey?: string } = {}) {
  const calls: string[] = [];
  let clock = Date.parse('2026-10-06T12:00:00Z');
  const lookup = new DistrictLookupService({
    apiKey: 'apiKey' in options ? options.apiKey : 'test-key',
    baseUrl: 'https://api.geocod.io/v2',
    dailyLookupLimit: options.dailyLookupLimit ?? 2000,
    now: () => clock,
    fetchImpl: (async (url: URL) => {
      calls.push(url.searchParams.get('q') ?? '');
      const next = responses.shift() ?? { status: 500 };
      return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
    }) as typeof fetch,
  });
  return { lookup, calls, advance: (ms: number) => { clock += ms; } };
}

test('repeat lookups are served from cache, ignoring case and spacing', async () => {
  const { lookup, calls } = service([{ status: 200, body: { results: [austin] } }]);
  await lookup.lookupAddress('500 Congress Ave, Austin, TX');
  const again = await lookup.lookupAddress('  500 congress ave,   austin, tx ');
  assert.equal(calls.length, 1);
  assert.equal(again.districts[0].district, '10');
});

test('cached results expire after a day', async () => {
  const { lookup, calls, advance } = service([
    { status: 200, body: { results: [austin] } },
    { status: 200, body: { results: [austin] } },
  ]);
  await lookup.lookupAddress('78701 test');
  advance(24 * 60 * 60 * 1000 + 1);
  await lookup.lookupAddress('78701 test');
  assert.equal(calls.length, 2);
});

test('the daily cap refuses lookups before Geocodio is called', async () => {
  const { lookup, calls } = service([{ status: 200, body: { results: [austin] } }], { dailyLookupLimit: 3 });
  await lookup.lookupAddress('first address');
  await assert.rejects(lookup.lookupAddress('second address'), (error: DistrictLookupError) => error.kind === 'unavailable');
  assert.equal(calls.length, 1);
});

test('the daily cap resets on the next UTC day', async () => {
  const { lookup, calls, advance } = service([
    { status: 200, body: { results: [austin] } },
    { status: 200, body: { results: [austin] } },
  ], { dailyLookupLimit: 2 });
  await lookup.lookupAddress('first address');
  advance(12 * 60 * 60 * 1000);
  await lookup.lookupAddress('second address');
  assert.equal(calls.length, 2);
});

test('Geocodio failures map to unresolvable or unavailable', async () => {
  const { lookup } = service([{ status: 422 }, { status: 403 }, { status: 200, body: { results: [] } }]);
  await assert.rejects(lookup.lookupAddress('nonsense words'), (error: DistrictLookupError) => error.kind === 'unresolvable');
  await assert.rejects(lookup.lookupAddress('rejected key'), (error: DistrictLookupError) => error.kind === 'unavailable');
  await assert.rejects(lookup.lookupAddress('no matches'), (error: DistrictLookupError) => error.kind === 'unresolvable');
});

test('without an API key the lookup is unavailable and nothing is sent', async () => {
  const { lookup, calls } = service([], { apiKey: undefined });
  await assert.rejects(lookup.lookupAddress('500 Congress Ave'), (error: DistrictLookupError) => error.kind === 'unavailable');
  assert.equal(calls.length, 0);
});
