import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeMovers, groupHistory, parseRaceKey, type MoverRow } from './history.js';

const hour = (h: number) => new Date(Date.UTC(2026, 9, 13, 0) + h * 3_600_000);

test('race keys parse to the scope and geography stored on snapshots', () => {
  assert.deepEqual(parseRaceKey('US-HOUSE'), { race: 'US-HOUSE', scope: 'NATIONAL_HOUSE', stateCode: null, districtCode: null });
  assert.deepEqual(parseRaceKey('us-senate'), { race: 'US-SENATE', scope: 'NATIONAL_SENATE', stateCode: null, districtCode: null });
  assert.deepEqual(parseRaceKey('pa-sen'), { race: 'PA-SEN', scope: 'STATE_SENATE', stateCode: 'PA', districtCode: null });
  assert.deepEqual(parseRaceKey('PA-07'), { race: 'PA-07', scope: 'HOUSE_DISTRICT', stateCode: 'PA', districtCode: '07' });
  // At-large seats are 00 and nothing else.
  assert.deepEqual(parseRaceKey('DE-00'), { race: 'DE-00', scope: 'HOUSE_DISTRICT', stateCode: 'DE', districtCode: '00' });
  for (const bad of ['DE-01', 'PA-00', 'PA-18', 'PA-7', 'XX-01', 'DC-00', 'PA', 'PA-HOUSE', '']) {
    assert.equal(parseRaceKey(bad), null, bad);
  }
});

test('history groups by race and market, keeps request order, and leaves gaps as gaps', () => {
  const races = [parseRaceKey('PA-07')!, parseRaceKey('US-HOUSE')!, parseRaceKey('AZ-06')!];
  const row = (ticker: string, outcome: string, h: number, price: string, scope = 'HOUSE_DISTRICT' as const) => ({
    scope, stateCode: 'PA', districtCode: '07', sourceMarketId: ticker, outcome, price, capturedHour: hour(h),
  });
  const grouped = groupHistory([
    row('HOUSEPA7-26-R', 'Republican Party', 1, '0.5500'),
    row('HOUSEPA7-26-D', 'Democratic Party', 3, '0.4710'),
    row('HOUSEPA7-26-D', 'Democratic Party', 0, '0.4500'),
    // Hour 2 is missing: the feed was down.
    row('HOUSEPA7-26-D', 'Democratic Party', 1, '0.4625'),
    { scope: 'NATIONAL_HOUSE', stateCode: null, districtCode: null, sourceMarketId: 'CONTROLH-2026-D', outcome: 'Democratic Party', price: 0.8, capturedHour: hour(0) },
    // A race nobody asked for is ignored.
    { ...row('HOUSEPA8-26-D', 'Democratic Party', 0, '0.3'), districtCode: '08' },
  ], races);

  assert.deepEqual(grouped.map((race) => race.race), ['PA-07', 'US-HOUSE', 'AZ-06']);
  const [pa07, control, az06] = grouped;
  assert.deepEqual(pa07.markets.map((market) => market.party), ['D', 'R']);
  assert.deepEqual(pa07.markets[0].points, [[hour(0).getTime(), 45], [hour(1).getTime(), 46.3], [hour(3).getTime(), 47.1]]);
  assert.deepEqual(control.markets[0].points, [[hour(0).getTime(), 80]]);
  assert.deepEqual(az06.markets, []);
});

let ticker = 0;
function snap(overrides: Partial<MoverRow> & { h: number; price: number }): MoverRow {
  const { h, price, ...rest } = overrides;
  return {
    scope: 'HOUSE_DISTRICT',
    stateCode: 'PA',
    districtCode: '07',
    sourceMarketId: `T${++ticker}`,
    outcome: 'Democratic Party',
    priceType: 'MIDPOINT',
    yesBid: price - 0.01,
    yesAsk: price + 0.01,
    sourceUrl: 'https://kalshi.com/x',
    capturedHour: hour(h),
    price,
    ...rest,
  };
}

/** A two-outcome race whose D price moves from `from` to `to` over the window ending at hour 30. */
function race(state: string, district: string, from: number, to: number, opts: { thenHour?: number; nowHour?: number } = {}) {
  const base = { stateCode: state, districtCode: district };
  const d = `HOUSE${state}${district}-26-D`;
  const r = `HOUSE${state}${district}-26-R`;
  return {
    latest: [
      snap({ ...base, sourceMarketId: d, h: opts.nowHour ?? 30, price: to }),
      snap({ ...base, sourceMarketId: r, outcome: 'Republican Party', h: opts.nowHour ?? 30, price: 1 - to }),
    ],
    baseline: [
      snap({ ...base, sourceMarketId: d, h: opts.thenHour ?? 6, price: from }),
      snap({ ...base, sourceMarketId: r, outcome: 'Republican Party', h: opts.thenHour ?? 6, price: 1 - from }),
    ],
  };
}

test('movers list each race once, by the outcome that gained, largest first', () => {
  const up = race('PA', '07', 0.40, 0.46); // D +6
  const down = race('AZ', '06', 0.55, 0.47); // R +8
  const flat = race('CO', '08', 0.50, 0.505); // under 1 point
  const result = computeMovers(
    [...up.latest, ...down.latest, ...flat.latest],
    [...up.baseline, ...down.baseline, ...flat.baseline],
    { window: '24h', limit: 10 },
  );
  assert.equal(result.asOf, hour(30).toISOString());
  assert.deepEqual(result.movers.map((mover) => [mover.race, mover.party, mover.fromPct, mover.toPct, mover.changePts]), [
    ['AZ-06', 'R', 45, 53, 8],
    ['PA-07', 'D', 40, 46, 6],
  ]);
  assert.equal(result.movers[1].fromHour, hour(6).toISOString());
  assert.deepEqual(result.excluded, { noBaseline: 0, thinQuote: 0 });
  assert.equal(computeMovers([...up.latest, ...down.latest], [...up.baseline, ...down.baseline], { window: '24h', limit: 1 }).movers.length, 1);
});

test('a market without a baseline in the tolerance band is excluded, never treated as zero', () => {
  const tooOld = race('PA', '07', 0.10, 0.60, { thenHour: -1 }); // 7 h before the 24 h mark
  const tooNew = race('AZ', '06', 0.10, 0.60, { thenHour: 7 }); // after the 24 h mark
  const inBand = race('CO', '08', 0.40, 0.45, { thenHour: 0 }); // exactly 6 h before
  const result = computeMovers(
    [...tooOld.latest, ...tooNew.latest, ...inBand.latest],
    [...tooOld.baseline, ...tooNew.baseline, ...inBand.baseline],
    { window: '24h', limit: 10 },
  );
  assert.deepEqual(result.movers.map((mover) => mover.race), ['CO-08']);
  assert.deepEqual(result.excluded, { noBaseline: 4, thinQuote: 0 });
});

test('stale markets, last-trade prices, and wide spreads are left out', () => {
  const stale = race('PA', '07', 0.40, 0.60, { nowHour: 26 }); // 4 h older than the newest hour
  const fresh = race('AZ', '06', 0.40, 0.45);
  const lastTrade = race('CO', '08', 0.40, 0.60);
  lastTrade.latest = lastTrade.latest.map((row) => ({ ...row, priceType: 'LAST_TRADE' as const, yesBid: null, yesAsk: null }));
  const wide = race('NE', '02', 0.40, 0.60);
  wide.baseline = wide.baseline.map((row) => ({ ...row, yesBid: Number(row.price) - 0.08, yesAsk: Number(row.price) + 0.08 }));
  const result = computeMovers(
    [...stale.latest, ...fresh.latest, ...lastTrade.latest, ...wide.latest],
    [...stale.baseline, ...fresh.baseline, ...lastTrade.baseline, ...wide.baseline],
    { window: '24h', limit: 10 },
  );
  assert.deepEqual(result.movers.map((mover) => mover.race), ['AZ-06']);
  assert.deepEqual(result.excluded, { noBaseline: 0, thinQuote: 4 });
});

test('ties sort by race and the state filter applies to both ends', () => {
  const a = race('PA', '08', 0.40, 0.45);
  const b = race('PA', '07', 0.40, 0.45);
  const other = race('AZ', '06', 0.40, 0.60);
  const latest = [...a.latest, ...b.latest, ...other.latest];
  const baseline = [...a.baseline, ...b.baseline, ...other.baseline];
  assert.deepEqual(computeMovers(latest, baseline, { window: '24h', limit: 10, state: 'PA' }).movers.map((mover) => mover.race), ['PA-07', 'PA-08']);
  assert.deepEqual(computeMovers(latest, baseline, { window: '24h', limit: 10 }).movers.map((mover) => mover.race), ['AZ-06', 'PA-07', 'PA-08']);
});

test('the 7-day window and an empty table', () => {
  const week = race('PA', '07', 0.40, 0.50, { thenHour: 30 - 168, nowHour: 30 });
  assert.deepEqual(computeMovers(week.latest, week.baseline, { window: '7d', limit: 10 }).movers.map((mover) => mover.changePts), [10]);
  // The same baseline is too old for 24 h.
  assert.equal(computeMovers(week.latest, week.baseline, { window: '24h', limit: 10 }).movers.length, 0);
  assert.deepEqual(computeMovers([], [], { window: '24h', limit: 10 }), { window: '24h', asOf: null, movers: [], excluded: { noBaseline: 0, thinQuote: 0 } });
});
