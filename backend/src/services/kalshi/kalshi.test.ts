import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, verify } from 'node:crypto';
import { test } from 'node:test';
import { authHeaders, loadPrivateKey, signRequest } from './auth.js';
import { assignParties, buildCatalog, eventMarkets, parseHouseEventTicker, parseStateElectionEvent, tickersTried, type JsonFetcher } from './catalog.js';
import { KalshiLiveFeed, rateLimitDelay } from './live-feed.js';
import { isStateCode, knownStateCode, quotePrice } from './shared.js';
import { hourStart, snapshotRows, type SnapshotInput } from './snapshots.js';

// Trimmed Kalshi /events responses recorded on 2026-10-06.
const control = {
  event_ticker: 'CONTROLH-2026', title: 'Which party will win the U.S. House?',
  markets: [
    { ticker: 'CONTROLH-2026-D', yes_sub_title: 'Democratic Party', status: 'active', yes_bid_dollars: '0.9140', yes_ask_dollars: '0.9150' },
    { ticker: 'CONTROLH-2026-R', yes_sub_title: 'Republican Party', status: 'active', yes_bid_dollars: '0.0870', yes_ask_dollars: '0.0880' },
  ],
};
const ohioSpecial = {
  event_ticker: 'SENATEOHS-26', title: 'Ohio Senate winner?',
  markets: [
    { ticker: 'SENATEOHS-26-R', yes_sub_title: 'Jon Husted', status: 'active', yes_bid_dollars: '0.3500', yes_ask_dollars: '0.3600' },
    { ticker: 'SENATEOHS-26-D', yes_sub_title: 'Sherrod Brown', status: 'active', yes_bid_dollars: '0.6300', yes_ask_dollars: '0.6400' },
  ],
};
const delawareAtLarge = {
  event_ticker: 'KXHOUSERACE-DEAL-26', title: 'DE-AL House winner?',
  markets: [
    { ticker: 'KXHOUSERACE-DEAL-26-D', yes_sub_title: 'Democratic party', status: 'active', last_price_dollars: '0.9500' },
    { ticker: 'KXHOUSERACE-DEAL-26-R', yes_sub_title: 'Republican party', status: 'finalized', last_price_dollars: '0.0500' },
  ],
};
const alabama1 = {
  event_ticker: 'KXHOUSERACE-AL01-26', title: 'AL-01 House winner?',
  markets: [{ ticker: 'KXHOUSERACE-AL01-26-D', yes_sub_title: 'Clyde Jones', status: 'active', yes_bid_dollars: '0.0370', yes_ask_dollars: '0.0640' }],
};
const california22 = {
  event_ticker: 'HOUSECA22-26', title: 'CA-22 House winner?',
  markets: [
    { ticker: 'HOUSECA22-26-D', yes_sub_title: 'Randy Villegas', status: 'active', yes_bid_dollars: '0.8900', yes_ask_dollars: '0.9160' },
    { ticker: 'HOUSECA22-26-R', yes_sub_title: 'David Valadao', status: 'active', yes_bid_dollars: '0.0910', yes_ask_dollars: '0.1000' },
  ],
};

test('signatures are RSA-PSS SHA-256 over timestamp + method + path', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { timestamp, signature } = signRequest(privateKey, 'GET', '/trade-api/ws/v2', 1_700_000_000_000);
  assert.equal(timestamp, '1700000000000');
  assert.ok(verify('sha256', Buffer.from('1700000000000GET/trade-api/ws/v2'), {
    key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  }, Buffer.from(signature, 'base64')));
  assert.deepEqual(Object.keys(authHeaders('key-id', privateKey, 'GET', '/trade-api/ws/v2')).sort(),
    ['KALSHI-ACCESS-KEY', 'KALSHI-ACCESS-SIGNATURE', 'KALSHI-ACCESS-TIMESTAMP']);
});

test('Ed25519 keys sign the same message without a digest', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const { signature } = signRequest(privateKey, 'GET', '/trade-api/ws/v2', 1_700_000_000_000);
  assert.ok(verify(null, Buffer.from('1700000000000GET/trade-api/ws/v2'), publicKey, Buffer.from(signature, 'base64')));
});

test('private keys load from a PEM, an escaped one-line PEM, or the bare base64 body', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  for (const inline of [pem, pem.replace(/\n/g, '\\n'), body]) {
    assert.equal(loadPrivateKey(inline, undefined)?.asymmetricKeyType, 'ed25519');
  }
});

test('House event tickers map to our state and two-digit district', () => {
  assert.deepEqual(parseHouseEventTicker('KXHOUSERACE-PA07-26'), { stateCode: 'PA', district: '07' });
  assert.deepEqual(parseHouseEventTicker('KXHOUSERACE-DEAL-26'), { stateCode: 'DE', district: '00' });
  assert.deepEqual(parseHouseEventTicker('HOUSECA22-26'), { stateCode: 'CA', district: '22' });
  assert.deepEqual(parseHouseEventTicker('HOUSEPA7-26'), { stateCode: 'PA', district: '07' });
  assert.deepEqual(parseHouseEventTicker('HOUSEAKAL-26'), { stateCode: 'AK', district: '00' });
  assert.equal(parseHouseEventTicker('HOUSEPA07-26'), null);
  assert.equal(parseHouseEventTicker('KXHOUSERACE-PA07-28'), null);
  assert.equal(parseHouseEventTicker('KXHOUSERACE-XX01-26'), null);
});

test('quotes use the bid/ask midpoint, else the last trade, and ignore 0/1 prices', () => {
  assert.deepEqual(quotePrice('0.45', '0.53', '0.40'), { pricePercent: 49, priceType: 'MIDPOINT' });
  assert.deepEqual(quotePrice('0', '0.53', '0.40'), { pricePercent: 40, priceType: 'LAST_TRADE' });
  assert.equal(quotePrice(undefined, undefined, '1.0000'), null);
});

// Shaped like kalshi.com/markets/kxcaelection/california-general-elections-/kxcaelection-2607.
// Not recorded: the market tickers and the second candidate's name are illustrative.
const california7 = {
  event_ticker: 'KXCAELECTION-2607', title: 'California 7th District general election winner?',
  markets: [
    { ticker: 'KXCAELECTION-2607-DMAT', yes_sub_title: 'Doris Matsui', status: 'active', yes_bid_dollars: '0.9000', yes_ask_dollars: '0.9200' },
    { ticker: 'KXCAELECTION-2607-JDOE', yes_sub_title: 'Jane Doe', status: 'active', yes_bid_dollars: '0.0800', yes_ask_dollars: '0.1000' },
  ],
};
const californiaGovernor = {
  event_ticker: 'KXCAELECTION-26GOV', title: 'California Governor general election winner?',
  markets: [{ ticker: 'KXCAELECTION-26GOV-A', yes_sub_title: 'Someone', status: 'active', last_price_dollars: '0.5000' }],
};

// Illustrative, not recorded: the shapes the catalog notes instead of dropping silently.
const kentuckyNotOpen = {
  event_ticker: 'SENATEKY-26', title: 'Kentucky Senate winner?',
  markets: [{ ticker: 'SENATEKY-26-R', yes_sub_title: 'Republican', status: 'initialized' }],
};
const texasRedrawn = {
  event_ticker: 'KXHOUSERACE-TX09N-26', title: 'TX-09 House winner?',
  markets: [{ ticker: 'KXHOUSERACE-TX09N-26-R', yes_sub_title: 'Republican party', status: 'active' }],
};

test('the no-market log names every ticker a race was looked for under', () => {
  assert.deepEqual(tickersTried('KY-SEN'), ['SENATEKY-26', 'SENATEKYS-26']);
  assert.deepEqual(tickersTried('TX-09'), ['KXHOUSERACE-TX09-26', 'KXTXELECTION-2609', 'HOUSETX9-26']);
  assert.deepEqual(tickersTried('VT-00'), ['KXHOUSERACE-VTAL-26', 'KXVTELECTION-26AL', 'HOUSEVTAL-26']);
});

test('per-state election events map to House districts and refuse other offices', () => {
  assert.deepEqual(parseStateElectionEvent('KXCAELECTION-2607', california7.title), { stateCode: 'CA', district: '07' });
  assert.deepEqual(parseStateElectionEvent('KXWAELECTION-2609'), { stateCode: 'WA', district: '09' });
  assert.deepEqual(parseStateElectionEvent('KXDEELECTION-26AL'), { stateCode: 'DE', district: '00' });
  assert.equal(parseStateElectionEvent('KXCAELECTION-26GOV', californiaGovernor.title), null);
  assert.equal(parseStateElectionEvent('KXCAELECTION-2653'), null, 'CA has 52 seats');
  assert.equal(parseStateElectionEvent('KXCAELECTION-2607', 'California State Senate District 7'), null);
  assert.equal(parseStateElectionEvent('KXCAELECTION-2807'), null);
  assert.equal(parseStateElectionEvent('KXXXELECTION-2601'), null);
});

test('candidate markets get a party from a tag or from the race\'s candidates, and nobody else does', () => {
  const markets = assignParties(eventMarkets(california7, 'HOUSE_DISTRICT', 'CA', '07'), new Map([
    ['CA-07', [{ name: 'MATSUI, DORIS O', party: 'DEM' }, { name: 'Jane Doe', party: 'Democratic' }]],
  ]));
  assert.deepEqual(markets.map((market) => [market.outcome, market.party]), [['Doris Matsui', 'D'], ['Jane Doe', 'D']]);

  const tagged = eventMarkets({ event_ticker: 'KXWAELECTION-2604', markets: [{ ticker: 'X-1', yes_sub_title: 'Dan Newhouse (R)', status: 'active' }] }, 'HOUSE_DISTRICT', 'WA', '04');
  assert.equal(assignParties(tagged, new Map())[0].party, 'R');

  const independent = eventMarkets({ event_ticker: 'SENATENE-26', markets: [{ ticker: 'SENATENE-26-DO', yes_sub_title: 'Dan Osborn', status: 'active' }] }, 'STATE_SENATE', 'NE', null);
  assert.equal(assignParties(independent, new Map([['NE-SEN', [{ name: 'OSBORN, DAN', party: 'IND' }]]]))[0].party, null);
  // A party already on the ticker is kept, whatever the candidate list says.
  const ohio = assignParties(eventMarkets(ohioSpecial, 'STATE_SENATE', 'OH', null), new Map([['OH-SEN', [{ name: 'Jon Husted', party: 'Democratic' }]]]));
  assert.equal(ohio[0].party, 'R');
});

test('event markets keep candidate names, normalise party names, and skip closed markets', () => {
  const senate = eventMarkets(ohioSpecial, 'STATE_SENATE', 'OH', null);
  assert.deepEqual(senate.map((market) => [market.race, market.outcome, market.party]), [['OH-SEN', 'Jon Husted', 'R'], ['OH-SEN', 'Sherrod Brown', 'D']]);
  const house = eventMarkets(delawareAtLarge, 'HOUSE_DISTRICT', 'DE', '00');
  assert.deepEqual(house.map((market) => [market.race, market.outcome]), [['DE-00', 'Democratic Party']]);
});

test('the catalog covers control, regular and special Senate, and every House page', async () => {
  const requested: string[] = [];
  const fetcher: JsonFetcher = async <T>(url: string) => {
    requested.push(url);
    const path = new URL(url).pathname;
    if (path.endsWith('/events/CONTROLH-2026')) return { event: control } as T;
    if (path.endsWith('/events/SENATEOHS-26')) return { event: ohioSpecial } as T;
    if (path.endsWith('/events/HOUSECA22-26')) return { event: california22 } as T;
    const series = new URL(url).searchParams.get('series_ticker');
    if (path.endsWith('/events') && series === 'KXCAELECTION') return { events: [california7, californiaGovernor] } as T;
    if (path.endsWith('/events') && series !== 'KXHOUSERACE') return { events: [] } as T;
    if (path.endsWith('/events/SENATEKY-26')) return { event: kentuckyNotOpen } as T;
    if (path.endsWith('/events') && !new URL(url).searchParams.get('cursor')) return { events: [alabama1, texasRedrawn], cursor: 'page2' } as T;
    if (path.endsWith('/events')) return { events: [delawareAtLarge], cursor: '' } as T;
    return null;
  };
  const notes: string[] = [];
  const markets = await buildCatalog('https://kalshi.test/trade-api/v2', fetcher, (note) => notes.push(note));
  assert.deepEqual([...new Set(markets.map((market) => market.race))], ['US-HOUSE', 'OH-SEN', 'AL-01', 'DE-00', 'CA-07', 'CA-22']);
  assert.deepEqual(notes.sort(), [
    'KXCAELECTION-26GOV (California Governor general election winner?) is not a House race',
    'KXHOUSERACE-TX09N-26 (TX-09 House winner?) is not a district ticker we read',
    'SENATEKY-26 (Kentucky Senate winner?) has no open market (initialized)',
  ]);
  assert.ok(requested.some((url) => url.includes('series_ticker=KXWAELECTION')));
  // Fewer requests per refresh: no Senate lookups where no seat is up, and no state series
  // for a state whose seats KXHOUSERACE already covers (DE-00 here).
  assert.ok(!requested.some((url) => url.includes('/events/SENATECA-26?') || url.includes('/events/SENATECAS-26?')));
  assert.equal(requested.filter((url) => /\/events\/SENATE[A-Z]{2}S?-26\?/.test(url)).length, 70);
  assert.ok(!requested.some((url) => url.includes('series_ticker=KXDEELECTION')));
  // CA-07 came from the state series, so its per-district event is not probed.
  assert.ok(!requested.some((url) => url.includes('/events/HOUSECA7-26?')));
  assert.ok(requested.some((url) => url.includes('/events/SENATEGA-26?')));
  // Seats already covered by KXHOUSERACE are not probed again.
  assert.ok(!requested.some((url) => url.includes('/events/HOUSEAL1-26?') || url.includes('/events/HOUSEDEAL-26?')));
  assert.ok(requested.some((url) => url.includes('/events/HOUSEAL2-26?')));
  assert.equal(requested.filter((url) => url.includes('series_ticker=KXHOUSERACE')).length, 2);
});

test('the live board seeds from REST, applies ticks, and only reports real moves', () => {
  const feed = new KalshiLiveFeed();
  feed.setCatalog([...eventMarkets(control, 'NATIONAL_HOUSE', null, null), ...eventMarkets(alabama1, 'HOUSE_DISTRICT', 'AL', '01')], 0);
  const seeded = feed.snapshot().markets.find((market) => market.ticker === 'CONTROLH-2026-D');
  assert.equal(seeded?.pricePercent, 91.5);

  const moved = feed.applyTicker({ market_ticker: 'CONTROLH-2026-D', yes_bid_dollars: '0.9000', yes_ask_dollars: '0.9100', ts_ms: 1_000 });
  assert.deepEqual(moved, { ticker: 'CONTROLH-2026-D', pricePercent: 90.5, priceType: 'MIDPOINT', updatedAt: new Date(1_000).toISOString() });
  // A tick that only changes size leaves the shown price alone.
  assert.equal(feed.applyTicker({ market_ticker: 'CONTROLH-2026-D', ts_ms: 2_000 }), null);
  assert.equal(feed.applyTicker({ market_ticker: 'NOT-TRACKED', price_dollars: '0.5' }), null);
  // The socket is not live, so REST callers fall back.
  assert.equal(feed.eventQuotes('CONTROLH-2026'), null);
});

test('snapshot rows keep 4-decimal prices and bid/ask, and skip unpriced markets', () => {
  const [dem, rep] = eventMarkets(control, 'NATIONAL_HOUSE', null, null);
  const [alDem] = eventMarkets(alabama1, 'HOUSE_DISTRICT', 'AL', '01');
  const hour = new Date('2026-10-10T14:00:00Z');
  const fetchedAt = new Date('2026-10-10T14:05:00Z');
  const rows = snapshotRows([
    { market: dem, bid: '0.9140', ask: '0.9150' },
    { market: rep },
    { market: alDem, bid: '0', ask: '0.0640', last: '0.0500' },
  ], 'source-1', hour, fetchedAt);
  assert.deepEqual(rows.map((row) => [row.sourceMarketId, row.price, row.priceType, row.yesBid, row.yesAsk]), [
    ['CONTROLH-2026-D', 0.9145, 'MIDPOINT', 0.914, 0.915],
    ['KXHOUSERACE-AL01-26-D', 0.05, 'LAST_TRADE', null, 0.064],
  ]);
  assert.equal(rows[1].stateCode, 'AL');
  assert.equal(rows[1].districtCode, '01');
  assert.equal(rows[0].capturedHour, hour);
  assert.equal(rows[0].fetchedAt, fetchedAt);
  assert.equal(hourStart(new Date('2026-10-10T14:59:59.999Z')).toISOString(), '2026-10-10T14:00:00.000Z');
});

test('hourly capture writes once per hour and only while the socket is live', async () => {
  const writes: Array<{ inputs: SnapshotInput[]; hour: string }> = [];
  const feed = new KalshiLiveFeed(async (inputs, hour) => { writes.push({ inputs, hour: hour.toISOString() }); return inputs.length; });
  feed.setCatalog(eventMarkets(control, 'NATIONAL_HOUSE', null, null), 0);

  assert.equal(await feed.captureHour(new Date('2026-10-10T14:05:00Z')), 0);
  feed.status = 'live';
  assert.equal(await feed.captureHour(new Date('2026-10-10T14:05:00Z')), 2);
  assert.equal(await feed.captureHour(new Date('2026-10-10T14:55:00Z')), 0);
  assert.equal(await feed.captureHour(new Date('2026-10-10T15:00:00Z')), 2);
  assert.deepEqual(writes.map((write) => write.hour), ['2026-10-10T14:00:00.000Z', '2026-10-10T15:00:00.000Z']);
  assert.equal(writes[0].inputs[0].bid, '0.9140');

  // A failed write is retried on the next check in the same hour.
  const flaky = new KalshiLiveFeed(async () => { throw new Error('db down'); });
  flaky.status = 'live';
  assert.equal(await flaky.captureHour(new Date('2026-10-10T14:05:00Z')), 0);
  let retried = false;
  (flaky as unknown as { writeSnapshots: () => Promise<number> }).writeSnapshots = async () => { retried = true; return 0; };
  await flaky.captureHour(new Date('2026-10-10T14:10:00Z'));
  assert.ok(retried);
});

test('state codes match only real states, never inherited object keys', () => {
  assert.equal(isStateCode('TX'), true);
  assert.equal(isStateCode('constructor'), false);
  assert.equal(knownStateCode('PA'), 'PA');
  assert.equal(knownStateCode('ZZ'), null);
  assert.equal(knownStateCode('toString'), null);
});

test('a rate-limited request waits for Retry-After, or backs off for longer each time', () => {
  assert.equal(rateLimitDelay('3', 0), 3000);
  assert.equal(rateLimitDelay('600', 0), 60_000);
  assert.deepEqual([0, 1, 2, 3].map((attempt) => rateLimitDelay(null, attempt)), [2000, 4000, 8000, 16_000]);
  assert.equal(rateLimitDelay('soon', 1), 4000);
});
