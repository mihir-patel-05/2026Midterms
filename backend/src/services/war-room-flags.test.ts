import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flagsFromRows, isWarRoomFlag, WAR_ROOM_FLAG_NAMES } from './war-room-flags.service.js';

test('War Room flags are on unless a row turns them off', () => {
  const flags = flagsFromRows([
    { key: 'war_room_flag:watchlist_alerts', value: 'off' },
    { key: 'war_room_flag:runoff_labels', value: 'on' },
    { key: 'war_room_flag:nonsense', value: 'off' },
    { key: 'live_streams_panel', value: 'hidden' },
  ]);
  assert.equal(flags.watchlist_alerts, false);
  assert.equal(flags.runoff_labels, true);
  assert.equal(flags.stale_prices, true);
  assert.deepEqual(Object.keys(flags).sort(), [...WAR_ROOM_FLAG_NAMES].sort());
});

test('only known flag names are accepted', () => {
  assert.equal(isWarRoomFlag('control_banner'), true);
  assert.equal(isWarRoomFlag('toString'), false);
  assert.equal(isWarRoomFlag('nonsense'), false);
});
