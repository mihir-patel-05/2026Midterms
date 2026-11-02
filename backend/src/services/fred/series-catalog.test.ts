import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FRED_NATIONAL_SERIES,
  FRED_SERIES,
  FRED_STATE_CODES,
  FRED_STATE_SERIES,
  nationalSeries,
  stateSeries,
  stateSeriesKey,
} from './series-catalog.js';

test('the catalog has unique keys and IDs, and only S&P 500 and VIX are restricted', () => {
  const keys = FRED_SERIES.map((def) => def.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(FRED_SERIES.map((def) => def.fredId)).size, FRED_SERIES.length);
  assert(keys.every((key, i) => key === `fred.${FRED_SERIES[i].fredId}`));
  assert.deepEqual(FRED_SERIES.filter((def) => def.restricted).map((def) => def.fredId), ['SP500', 'VIXCLS']);
});

test('seven series for each of the 50 states and DC (two without tiles), and none for Puerto Rico', () => {
  assert.equal(FRED_STATE_CODES.length, 51);
  assert(FRED_STATE_CODES.includes('DC') && !FRED_STATE_CODES.includes('PR'));
  assert.equal(FRED_STATE_SERIES.length, 51 * 7);
  assert.equal(FRED_SERIES.length, FRED_NATIONAL_SERIES.length + FRED_STATE_SERIES.length);

  assert.deepEqual(stateSeries('CA').map((def) => [def.fredId, def.transform]), [
    ['CAUR', 'level'],
    ['CANA', 'mom_change'],
    ['CAICLAIMS', 'level'],
    ['CARQGSP', 'qoq_annualized'],
    ['CASTHPI', 'yoy'],
    ['CAMFG', 'level'],
    ['CANQGSP', 'level'],
  ]);
  assert.deepEqual(stateSeries('CA').filter((def) => def.noTile).map((def) => def.fredId), ['CAMFG', 'CANQGSP']);
  assert(stateSeries('CA').every((def) => def.stateCode === 'CA' && def.key === `fred.${def.fredId}`));
  assert.equal(stateSeries('CA').find((def) => def.fredId === 'CAICLAIMS')?.staleAfterDays, 21);
  assert.deepEqual(stateSeries('PR'), []);
  assert.deepEqual(stateSeries('ca'), []);
});

test('Alabama and DC manufacturing jobs use the IDs FRED has, under keys the tariff score finds', () => {
  assert.equal(stateSeries('AL').find((def) => def.key === stateSeriesKey('AL', 'MFG'))?.fredId, 'SMS01000003000000001');
  assert.equal(stateSeries('DC').find((def) => def.key === stateSeriesKey('DC', 'MFG'))?.fredId, 'SMU11000003000000001SA');
  assert.equal(stateSeriesKey('CA', 'MFG'), 'fred.CAMFG');
  assert.equal(stateSeriesKey('AL', 'NQGSP'), 'fred.ALNQGSP');
  assert(FRED_STATE_CODES.every((code) => stateSeries(code).some((def) => def.key === stateSeriesKey(code, 'MFG'))));
});

test('national series carry no state, and include the U.S. home price index', () => {
  assert.deepEqual(nationalSeries(), [...FRED_NATIONAL_SERIES]);
  assert(FRED_NATIONAL_SERIES.every((def) => def.stateCode === null));
  assert.equal(FRED_NATIONAL_SERIES.find((def) => def.fredId === 'USSTHPI')?.transform, 'yoy');
});
