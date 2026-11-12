import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSettlement } from './settlements.js';

test('settled markets read their result, value and time; open or unreadable ones are not settled', () => {
  assert.deepEqual(parseSettlement({ status: 'finalized', result: 'yes', settlement_value_dollars: '1.0000', settlement_ts: '2026-11-08T15:00:00Z' }), {
    result: 'YES', settlementValue: 1, settledAt: new Date('2026-11-08T15:00:00Z'), venueStatus: 'finalized',
  });
  // Cents when no dollar string is given.
  assert.equal(parseSettlement({ status: 'settled', result: 'no', settlement_value: 0 })?.settlementValue, 0);
  assert.equal(parseSettlement({ status: 'settled', result: 'NO', settlement_value: 0 })?.result, 'NO');
  assert.equal(parseSettlement({ status: 'determined', result: 'void' })?.result, 'VOID');
  // No value given stays null, never 0; an impossible value is dropped.
  assert.equal(parseSettlement({ status: 'settled', result: 'yes' })?.settlementValue, null);
  assert.equal(parseSettlement({ status: 'settled', result: 'yes', settlement_value_dollars: '7' })?.settlementValue, null);
  assert.equal(parseSettlement({ status: 'settled', result: 'yes', settlement_ts: 'not a date' })?.settledAt, null);
  for (const market of [{ status: 'active', result: '' }, { status: 'closed', result: '' }, { status: 'settled', result: '' }, { status: 'active', result: 'yes' }, {}]) {
    assert.equal(parseSettlement(market), null);
  }
});
