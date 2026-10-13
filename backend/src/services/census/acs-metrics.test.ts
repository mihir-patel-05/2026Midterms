import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeMetrics, medianFromBrackets, shareOf, sumAreas, type AreaValues } from './acs-metrics.js';
import { ACS_METRICS, ACS_VARIABLES, INCOME_BINS } from './acs-variables.js';

const metric = (key: string) => ACS_METRICS.filter((item) => item.key === key);

test('the variable catalog stays within what one sync can request', () => {
  assert.equal(new Set(ACS_VARIABLES).size, ACS_VARIABLES.length);
  for (const variable of ACS_VARIABLES) assert.match(variable, /^[BC]\d{5}_\d{3}$/);
  assert.equal(new Set(ACS_METRICS.map((item) => item.key)).size, ACS_METRICS.length);
  // Five 49-column requests per geography keep a full sync near 300 requests.
  assert(ACS_VARIABLES.length * 2 <= 49 * 5);
});

test('sums add estimates and combine margins as root-sum-of-squares', () => {
  const summed = sumAreas([
    { estimates: { a: 100, b: 5 }, moes: { a: 30, b: 0 } },
    { estimates: { a: 50, b: null }, moes: { a: 40, b: 1 } },
  ]);
  assert.equal(summed.estimates.a, 150);
  assert.equal(summed.moes.a, 50);
  // One missing piece makes the whole total missing, never a smaller number.
  assert.equal(summed.estimates.b, null);
});

test('share margins follow the Census proportion formula, falling back to the ratio form', () => {
  const share = shareOf({ value: 25, moe: 6 }, { value: 100, moe: 8 });
  assert.equal(share.value, 0.25);
  assert.equal(Math.round(share.moe! * 10_000) / 10_000, Math.round((Math.sqrt(36 - 0.0625 * 64) / 100) * 10_000) / 10_000);
  const ratio = shareOf({ value: 90, moe: 2 }, { value: 100, moe: 10 });
  assert.equal(Math.round(ratio.moe! * 10_000) / 10_000, Math.round((Math.sqrt(4 + 0.81 * 100) / 100) * 10_000) / 10_000);
  assert.deepEqual(shareOf({ value: 5, moe: 1 }, { value: 0, moe: 0 }), { value: null, moe: null });
});

test('a combined median is interpolated within the bracket holding the middle household', () => {
  const bins = [
    { count: 20, lower: 0, upper: 10_000 },
    { count: 40, lower: 10_000, upper: 20_000 },
    { count: 40, lower: 20_000, upper: null },
  ];
  // 100 households: the 50th falls 30/40 of the way through $10k-$20k.
  assert.deepEqual(medianFromBrackets(bins), { value: 17_500, topCoded: false });
  assert.deepEqual(medianFromBrackets([{ count: 1, lower: 0, upper: 10 }, { count: 9, lower: 200_000, upper: null }]), { value: 200_000, topCoded: true });
  assert.deepEqual(medianFromBrackets([{ count: null, lower: 0, upper: 10 }]), { value: null, topCoded: false });
});

function incomeArea(counts: number[], published: number): AreaValues {
  const estimates: Record<string, number | null> = { B19013_001: published, B19001_001: counts.reduce((a, b) => a + b, 0) };
  const moes: Record<string, number | null> = { B19013_001: 500, B19001_001: 10 };
  INCOME_BINS.forEach((bin, i) => {
    estimates[bin.variable] = counts[i] ?? 0;
    moes[bin.variable] = 5;
  });
  return { estimates, moes };
}

test('one area uses the published median; several areas get an estimated one', () => {
  const counts = Array.from({ length: 16 }, () => 10);
  const [single] = computeMetrics([incomeArea(counts, 61_234)], metric('median_household_income'));
  assert.equal(single.value, 61_234);
  assert.equal(single.moe, 500);
  assert.equal(single.estimated, undefined);

  const [combined] = computeMetrics([incomeArea(counts, 61_234), incomeArea(counts, 59_000)], metric('median_household_income'));
  assert.equal(combined.estimated, true);
  assert.equal(combined.moe, null);
  // 320 households, the 160th sits at the end of the 8th bracket ($40k-$45k).
  assert.equal(combined.value, 45_000);

  const [home] = computeMetrics([incomeArea(counts, 1), incomeArea(counts, 2)], metric('median_home_value'));
  assert.equal(home.value, null);
});

test('shares carry their count and flag low-reliability estimates', () => {
  const area: AreaValues = {
    estimates: { B03002_001: 1000, B03002_012: 400, B03002_007: 10 },
    moes: { B03002_001: 0, B03002_012: 50, B03002_007: 12 },
  };
  const [hispanic, pacific] = computeMetrics([area], [...metric('race_hispanic'), ...metric('race_pacific')]);
  assert.equal(hispanic.value, 0.4);
  assert.equal(hispanic.count, 400);
  assert.equal(hispanic.lowReliability, false);
  assert.equal(pacific.value, 0.01);
  assert.equal(pacific.lowReliability, true);
});

test('no areas means no values, not zeros', () => {
  for (const item of computeMetrics([])) assert.equal(item.value, null);
});
