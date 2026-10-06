import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, verify } from 'node:crypto';
import { test } from 'node:test';
import { authHeaders, loadPrivateKey, signRequest } from './auth.js';
import { buildCatalog, eventMarkets, parseHouseEventTicker, type JsonFetcher } from './catalog.js';
import { KalshiLiveFeed } from './live-feed.js';
import { quotePrice } from './shared.js';

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
  assert.equal(parseHouseEventTicker('KXHOUSERACE-PA07-28'), null);
  assert.equal(parseHouseEventTicker('KXHOUSERACE-XX01-26'), null);
});

test('quotes use the bid/ask midpoint, else the last trade, and ignore 0/1 prices', () => {
  assert.deepEqual(quotePrice('0.45', '0.53', '0.40'), { pricePercent: 49, priceType: 'MIDPOINT' });
  assert.deepEqual(quotePrice('0', '0.53', '0.40'), { pricePercent: 40, priceType: 'LAST_TRADE' });
  assert.equal(quotePrice(undefined, undefined, '1.0000'), null);
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
    if (path.endsWith('/events') && !new URL(url).searchParams.get('cursor')) return { events: [alabama1], cursor: 'page2' } as T;
    if (path.endsWith('/events')) return { events: [delawareAtLarge], cursor: '' } as T;
    return null;
  };
  const markets = await buildCatalog('https://kalshi.test/trade-api/v2', fetcher);
  assert.deepEqual([...new Set(markets.map((market) => market.race))], ['US-HOUSE', 'OH-SEN', 'AL-01', 'DE-00']);
  assert.ok(requested.some((url) => url.includes('/events/SENATEGA-26?')));
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
