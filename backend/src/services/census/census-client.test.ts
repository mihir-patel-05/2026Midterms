import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acsEstimate, acsMoe, CensusClient, CensusRequestError, normalizeDistrict, parseAcsTable, toAreaRows } from './census-client.js';

test('Census sentinels become null, and controlled margins become zero', () => {
  assert.equal(acsEstimate('4731145'), 4731145);
  assert.equal(acsEstimate('0'), 0);
  assert.equal(acsEstimate('-666666666'), null);
  assert.equal(acsEstimate(null), null);
  assert.equal(acsMoe('1520'), 1520);
  assert.equal(acsMoe('-555555555'), 0);
  assert.equal(acsMoe('-222222222'), null);
  assert.equal(acsMoe(''), null);
});

test('delegate seats normalize to 00 and undefined districts are dropped', () => {
  assert.equal(normalizeDistrict('07'), '07');
  assert.equal(normalizeDistrict('00'), '00');
  assert.equal(normalizeDistrict('98'), '00');
  assert.equal(normalizeDistrict('ZZ'), null);
});

test('chunks for the same geography are joined into one row', () => {
  const first = parseAcsTable([
    ['NAME', 'B01003_001E', 'B01003_001M', 'state', 'congressional district', 'county (or part)'],
    ['Harris County (part), Congressional District 7 (119th Congress), Texas', '760000', '-555555555', '48', '07', '201'],
    ['Harris County (part), Congressional District 9 (119th Congress), Texas', '770000', '-555555555', '48', '09', '201'],
  ]);
  const second = parseAcsTable([
    ['NAME', 'B19013_001E', 'B19013_001M', 'state', 'congressional district', 'county (or part)'],
    ['Harris County (part), Congressional District 9 (119th Congress), Texas', '-666666666', '-222222222', '48', '09', '201'],
    ['Harris County (part), Congressional District 7 (119th Congress), Texas', '81000', '1200', '48', '07', '201'],
  ]);
  const rows = toAreaRows('COUNTY_DISTRICT_PART', [first, second], ['B01003_001', 'B19013_001']);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    geoType: 'COUNTY_DISTRICT_PART',
    geoid: '4807201',
    name: 'Harris County (part), Congressional District 7 (119th Congress), Texas',
    stateFips: '48',
    stateCode: 'TX',
    countyFips: '48201',
    districtCode: '07',
    estimates: { B01003_001: 760000, B19013_001: 81000 },
    moes: { B01003_001: 0, B19013_001: 1200 },
  });
  assert.equal(rows[1].estimates.B19013_001, null);
  assert.equal(rows[1].moes.B19013_001, null);
});

test('district rows use Census GEOIDs and skip water-only "ZZ" districts', () => {
  const table = parseAcsTable([
    ['NAME', 'B01003_001E', 'B01003_001M', 'state', 'congressional district'],
    ['Delegate District (at Large) (119th Congress), District of Columbia', '678972', '-555555555', '11', '98'],
    ['Congressional District (at Large) (119th Congress), Wyoming', '581629', '-555555555', '56', '00'],
    ['Congressional Districts not defined (119th Congress), Michigan', '0', '-555555555', '26', 'ZZ'],
  ]);
  const rows = toAreaRows('CONGRESSIONAL_DISTRICT', [table], ['B01003_001']);
  assert.deepEqual(rows.map((row) => [row.geoid, row.stateCode, row.districtCode, row.countyFips]), [
    ['1198', 'DC', '00', null],
    ['5600', 'WY', '00', null],
  ]);
});

test('a missing variable column is an error rather than a silent null', () => {
  const table = parseAcsTable([['NAME', 'state'], ['Texas', '48']]);
  assert.throws(() => toAreaRows('STATE', [table], ['B01003_001']), /missing B01003_001E/);
});

function fakeCensus(handler: (url: URL) => { status: number; body: string }) {
  const urls: URL[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    urls.push(url);
    const { status, body } = handler(url);
    return new Response(status === 204 ? null : body, { status });
  }) as typeof fetch;
  return { urls, fetchImpl };
}

test('requests split variables into chunks of at most 50 columns and keep the key out of logged URLs', async () => {
  const variables = Array.from({ length: 30 }, (_, i) => `B01001_${String(i + 1).padStart(3, '0')}`);
  const { urls, fetchImpl } = fakeCensus((url) => {
    const columns = url.searchParams.get('get')!.split(',');
    const header = [...columns, 'state'];
    const row = [...columns.map((column) => (column === 'NAME' ? 'Texas' : '10')), '48'];
    return { status: 200, body: JSON.stringify([header, row]) };
  });
  const client = new CensusClient({ apiKey: 'secret-key', baseUrl: 'https://api.census.gov/data', year: 2024, fetchImpl });
  const rows = await client.fetchAreas({ geoType: 'STATE', for: 'state:48' }, variables);

  assert.equal(urls.length, 2);
  for (const url of urls) {
    assert(url.searchParams.get('get')!.split(',').length <= 50);
    assert.equal(url.searchParams.get('key'), 'secret-key');
    assert.equal(url.pathname, '/data/2024/acs/acs5');
  }
  assert.equal(rows.length, 1);
  assert.equal(Object.keys(rows[0].estimates).length, 30);
  const logged = client.redactedUrl({ geoType: 'COUNTY_DISTRICT_PART', for: 'county (or part):*', in: 'state:48 congressional district:*' }, ['NAME']);
  assert.equal(logged, 'https://api.census.gov/data/2024/acs/acs5?get=NAME&for=county%20(or%20part)%3A*&in=state%3A48%20congressional%20district%3A*');
  assert(!logged.includes('secret-key'));
});

test('server errors are retried; bad requests and invalid keys are not', async () => {
  let calls = 0;
  const flaky = fakeCensus(() => (++calls < 2 ? { status: 503, body: 'busy' } : { status: 200, body: JSON.stringify([['NAME', 'B01003_001E', 'B01003_001M', 'us'], ['United States', '1', '0', '1']]) }));
  const client = new CensusClient({ baseUrl: 'https://api.census.gov/data', year: 2024, fetchImpl: flaky.fetchImpl, retryDelayMs: 1 });
  assert.equal((await client.fetchAreas({ geoType: 'NATION', for: 'us:1' }, ['B01003_001'])).length, 1);
  assert.equal(calls, 2);

  const bad = fakeCensus(() => ({ status: 400, body: 'error: unknown variable' }));
  const badClient = new CensusClient({ baseUrl: 'https://api.census.gov/data', year: 2024, fetchImpl: bad.fetchImpl, retryDelayMs: 1 });
  await assert.rejects(badClient.fetchAreas({ geoType: 'NATION', for: 'us:1' }, ['B01003_001']), CensusRequestError);
  assert.equal(bad.urls.length, 1);

  const html = fakeCensus(() => ({ status: 200, body: '<html><title>Invalid Key</title></html>' }));
  const htmlClient = new CensusClient({ apiKey: 'nope', baseUrl: 'https://api.census.gov/data', year: 2024, fetchImpl: html.fetchImpl, retryDelayMs: 1 });
  await assert.rejects(htmlClient.fetchAreas({ geoType: 'NATION', for: 'us:1' }, ['B01003_001']), /check CENSUS_API_KEY/);
  assert.equal(html.urls.length, 1);
});
