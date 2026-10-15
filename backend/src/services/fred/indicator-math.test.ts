import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildIndicator,
  isStale,
  periodEnd,
  periodLabel,
  priorChange,
  servedSeries,
  sourceLine,
  weeklyReduce,
  yoyPercent,
  type Point,
} from './indicator-math.js';
import { FRED_SERIES, seriesByKey } from './series-catalog.js';

const at = (iso: string) => new Date(`${iso}T15:00:00Z`);

test('a period ends at the start of the next one', () => {
  assert.equal(periodEnd('2026-09-01', 'MONTHLY').toISOString().slice(0, 10), '2026-10-01');
  assert.equal(periodEnd('2026-12-01', 'MONTHLY').toISOString().slice(0, 10), '2027-01-01');
  assert.equal(periodEnd('2026-04-01', 'QUARTERLY').toISOString().slice(0, 10), '2026-07-01');
  // A weekly date is the last day of its week.
  assert.equal(periodEnd('2026-10-10', 'WEEKLY').toISOString().slice(0, 10), '2026-10-11');
  assert.equal(periodEnd('2026-10-14', 'DAILY').toISOString().slice(0, 10), '2026-10-15');
});

test('staleness counts from the end of the period, so normal release lags are not stale', () => {
  // August CPI (dated Aug 1) the day before September CPI comes out.
  assert.equal(isStale('2026-08-01', 'MONTHLY', at('2026-10-14')), false);
  // Q2 GDP (dated Apr 1) the day before the Q3 advance estimate.
  assert.equal(isStale('2026-04-01', 'QUARTERLY', at('2026-10-28')), false);
  // Consumer sentiment runs about a month later on FRED; 75 days after the period still passes.
  assert.equal(isStale('2026-07-01', 'MONTHLY', at('2026-10-14')), false);
  assert.equal(isStale('2026-07-01', 'MONTHLY', at('2026-10-16')), true);
  assert.equal(isStale('2026-10-09', 'DAILY', at('2026-10-15')), false);
  assert.equal(isStale('2026-10-02', 'DAILY', at('2026-10-15')), true);
  assert.equal(isStale('2026-10-03', 'WEEKLY', at('2026-10-15')), false);
  assert.equal(isStale('2026-09-28', 'WEEKLY', at('2026-10-15')), true);
  assert.equal(isStale('2026-01-01', 'QUARTERLY', at('2026-10-15')), true);
});

test('year-over-year change uses the observation a year earlier, or none', () => {
  const monthly: Point[] = [{ date: '2025-09-01', value: 320 }, { date: '2026-08-01', value: 328 }, { date: '2026-09-01', value: 329.6 }];
  assert.equal(yoyPercent(monthly, 2, 'MONTHLY')?.toFixed(2), '3.00');
  assert.equal(yoyPercent(monthly, 1, 'MONTHLY'), null);
  // Weekly dates drift by a day a year (364 days apart).
  const weekly: Point[] = [{ date: '2025-10-06', value: 3.0 }, { date: '2026-10-05', value: 3.15 }];
  assert.equal(yoyPercent(weekly, 1, 'WEEKLY')?.toFixed(2), '5.00');
  // A daily series falls back to the nearest trading day.
  const daily: Point[] = [{ date: '2025-10-10', value: 80 }, { date: '2025-10-13', value: 82 }, { date: '2026-10-12', value: 61.5 }];
  assert.equal(yoyPercent(daily, 2, 'DAILY')?.toFixed(2), '-25.00');
});

test('payroll change is the difference from the previous month', () => {
  const payrolls: Point[] = [{ date: '2026-08-01', value: 159_800 }, { date: '2026-09-01', value: 159_942 }];
  assert.equal(priorChange(payrolls, 1), 142);
  assert.equal(priorChange(payrolls, 0), null);
});

test('daily series are reduced to the last value of each week', () => {
  const days = ['2026-09-28', '2026-09-29', '2026-10-02', '2026-10-05', '2026-10-06'].map((date, i) => ({ date, value: i }));
  assert.deepEqual(weeklyReduce(days).map((point) => point.date), ['2026-10-02', '2026-10-06']);
  // A Sunday belongs to the week that started the Monday before.
  assert.deepEqual(weeklyReduce([{ date: '2026-10-04' }, { date: '2026-10-05' }]).map((point) => point.date), ['2026-10-04', '2026-10-05']);
});

test('periods and sources read naturally', () => {
  assert.equal(periodLabel('2026-10-14', 'DAILY'), 'Oct 14');
  assert.equal(periodLabel('2026-10-10', 'WEEKLY'), 'Week ending Oct 10');
  assert.equal(periodLabel('2026-08-01', 'MONTHLY'), 'Aug 2026');
  assert.equal(periodLabel('2026-04-01', 'QUARTERLY'), 'Q2 2026');
  assert.equal(sourceLine('BLS', new Date('2026-10-15T13:20:00Z')), 'BLS via FRED, fetched Oct 15');
  // Evening Eastern time is the next day in UTC.
  assert.equal(sourceLine('BLS', new Date('2026-10-16T02:00:00Z')), 'BLS via FRED, fetched Oct 15');
});

test('S&P 500 and VIX are left out unless their flag is on', () => {
  const ids = (on: boolean) => servedSeries(FRED_SERIES, on).map((def) => def.fredId);
  assert(!ids(false).includes('SP500') && !ids(false).includes('VIXCLS'));
  assert.equal(ids(false).length, FRED_SERIES.length - 2);
  assert(ids(true).includes('SP500') && ids(true).includes('VIXCLS'));
});

test('a series view trims history to the window but keeps a year-over-year change for every shown month', () => {
  const cpi = seriesByKey().get('fred.CPIAUCSL')!;
  const points: Point[] = [];
  for (let month = 0; month < 24; month++) {
    const date = new Date(Date.UTC(2024, 9 + month, 1)).toISOString().slice(0, 10);
    points.push({ date, value: 300 * 1.03 ** (month / 12) });
  }
  const view = buildIndicator(cpi, points, { since: '2025-10-01', now: at('2026-10-15'), fetchedAt: new Date('2026-10-15T13:20:00Z') });
  assert.equal(view.latest?.period, 'Sep 2026');
  assert.equal(view.change?.toFixed(2), '3.00');
  assert.equal(view.stale, false);
  assert.equal(view.history.length, 12);
  assert.equal(view.changeHistory?.length, 12);
  assert.equal(view.sourceLine, 'BLS via FRED, fetched Oct 15');

  const empty = buildIndicator(cpi, [], { since: '2025-10-01', now: at('2026-10-15'), fetchedAt: null });
  assert.equal(empty.latest, null);
  assert.equal(empty.change, null);
  assert.equal(empty.stale, true);

  const oil = seriesByKey().get('fred.DCOILWTICO')!;
  const days = [{ date: '2026-10-05', value: 61 }, { date: '2026-10-06', value: 62 }, { date: '2026-10-09', value: 60.5 }];
  const oilView = buildIndicator(oil, days, { since: '2026-10-01', now: at('2026-10-12'), fetchedAt: null });
  assert.deepEqual(oilView.history, [['2026-10-09', 60.5]]);
  assert.equal(oilView.change, -1.5);
  assert.equal(oilView.changeHistory, null);
});
