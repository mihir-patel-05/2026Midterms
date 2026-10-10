import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PER_PAGE, normalizePagination } from './pagination.js';

test('normalizePagination caps perPage and floors page', () => {
  assert.deepEqual(normalizePagination(1, 100_000_000), { page: 1, perPage: MAX_PER_PAGE });
  assert.deepEqual(normalizePagination(-3, -5), { page: 1, perPage: 1 });
  assert.deepEqual(normalizePagination(2.7, 6.2), { page: 2, perPage: 6 });
});

test('normalizePagination falls back to defaults for missing or non-numeric input', () => {
  assert.deepEqual(normalizePagination(undefined, undefined), { page: 1, perPage: 50 });
  assert.deepEqual(normalizePagination(Number.NaN, Number.NaN, 20), { page: 1, perPage: 20 });
});
