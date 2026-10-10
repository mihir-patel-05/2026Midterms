/**
 * ACS 5-year variables we store, and the metrics derived from them.
 *
 * Only counts are stored (plus two single-area medians), so several areas can be
 * added together and percentages recomputed from the sums. Percentages, combined
 * medians, and margins of error are derived in code, never fetched pre-computed.
 */

const range = (table: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${table}_${String(from + i).padStart(3, '0')}`);

/** B01001 (sex by age): male lines 3-25, female lines 27-49 cover the same ages. */
const ageLines = (fromMale: number, toMale: number) => [
  ...range('B01001', fromMale, toMale),
  ...range('B01001', fromMale + 24, toMale + 24),
];

export type AcsTopic = 'population' | 'age' | 'race' | 'income' | 'education' | 'economy' | 'housing' | 'background';

export interface CountMetric {
  kind: 'count';
  key: string;
  label: string;
  topic: AcsTopic;
  table: string;
  /** Summed to produce the value. */
  vars: string[];
}

export interface ShareMetric {
  kind: 'share';
  key: string;
  label: string;
  topic: AcsTopic;
  table: string;
  numerator: string[];
  denominator: string[];
}

/** Published for one area; for several areas a median cannot be summed, see `medianFromBrackets`. */
export interface MedianMetric {
  kind: 'median';
  key: string;
  label: string;
  topic: AcsTopic;
  table: string;
  variable: string;
  /** Distribution used to estimate the median of a combined area, if any. */
  brackets?: { table: string; total: string; bins: Array<{ variable: string; lower: number; upper: number | null }> };
}

export type AcsMetric = CountMetric | ShareMetric | MedianMetric;

/** B19001 household income brackets, in dollars. The top bracket is open-ended. */
const INCOME_BRACKETS: Array<[number, number | null]> = [
  [0, 10_000], [10_000, 15_000], [15_000, 20_000], [20_000, 25_000], [25_000, 30_000], [30_000, 35_000],
  [35_000, 40_000], [40_000, 45_000], [45_000, 50_000], [50_000, 60_000], [60_000, 75_000], [75_000, 100_000],
  [100_000, 125_000], [125_000, 150_000], [150_000, 200_000], [200_000, null],
];
export const INCOME_BINS = INCOME_BRACKETS.map(([lower, upper], i) => ({
  variable: `B19001_${String(i + 2).padStart(3, '0')}`,
  lower,
  upper,
}));

const RACE_TOTAL = ['B03002_001'];
const race = (key: string, label: string, line: number): ShareMetric => ({
  kind: 'share', key, label, topic: 'race', table: 'B03002',
  numerator: [`B03002_${String(line).padStart(3, '0')}`], denominator: RACE_TOTAL,
});

const AGE_TOTAL = ['B01001_001'];
const age = (key: string, label: string, fromMale: number, toMale: number): ShareMetric => ({
  kind: 'share', key, label, topic: 'age', table: 'B01001', numerator: ageLines(fromMale, toMale), denominator: AGE_TOTAL,
});

const HOUSEHOLDS = ['B19001_001'];
const income = (key: string, label: string, from: number, to: number): ShareMetric => ({
  kind: 'share', key, label, topic: 'income', table: 'B19001', numerator: range('B19001', from, to), denominator: HOUSEHOLDS,
});

export const ACS_METRICS: AcsMetric[] = [
  { kind: 'count', key: 'population', label: 'Total population', topic: 'population', table: 'B01003', vars: ['B01003_001'] },
  { kind: 'count', key: 'cvap', label: 'Citizens of voting age', topic: 'population', table: 'B29001', vars: ['B29001_001'] },
  { kind: 'count', key: 'households', label: 'Households', topic: 'population', table: 'B19001', vars: HOUSEHOLDS },

  age('age_under_18', 'Under 18', 3, 6),
  age('age_18_29', '18 to 29', 7, 11),
  age('age_30_44', '30 to 44', 12, 14),
  age('age_45_64', '45 to 64', 15, 19),
  age('age_65_plus', '65 and over', 20, 25),

  race('race_hispanic', 'Hispanic or Latino (any race)', 12),
  race('race_white', 'White', 3),
  race('race_black', 'Black', 4),
  race('race_asian', 'Asian', 6),
  race('race_native', 'American Indian and Alaska Native', 5),
  race('race_pacific', 'Native Hawaiian and Pacific Islander', 7),
  race('race_other', 'Some other race', 8),
  race('race_multiracial', 'Two or more races', 9),

  {
    kind: 'median', key: 'median_household_income', label: 'Median household income', topic: 'income', table: 'B19013',
    variable: 'B19013_001', brackets: { table: 'B19001', total: 'B19001_001', bins: INCOME_BINS },
  },
  income('income_under_25k', 'Under $25,000', 2, 5),
  income('income_25k_50k', '$25,000 to $49,999', 6, 10),
  income('income_50k_75k', '$50,000 to $74,999', 11, 12),
  income('income_75k_100k', '$75,000 to $99,999', 13, 13),
  income('income_100k_150k', '$100,000 to $149,999', 14, 15),
  income('income_150k_200k', '$150,000 to $199,999', 16, 16),
  income('income_200k_plus', '$200,000 or more', 17, 17),
  {
    kind: 'share', key: 'poverty_rate', label: 'Below the poverty line', topic: 'income', table: 'B17001',
    numerator: ['B17001_002'], denominator: ['B17001_001'],
  },

  {
    kind: 'share', key: 'education_hs_plus', label: 'High school graduate or higher (25+)', topic: 'education', table: 'B15003',
    numerator: range('B15003', 17, 25), denominator: ['B15003_001'],
  },
  {
    kind: 'share', key: 'education_ba_plus', label: "Bachelor's degree or higher (25+)", topic: 'education', table: 'B15003',
    numerator: range('B15003', 22, 25), denominator: ['B15003_001'],
  },

  {
    kind: 'share', key: 'unemployment_rate', label: 'Unemployment rate', topic: 'economy', table: 'B23025',
    numerator: ['B23025_005'], denominator: ['B23025_003'],
  },

  {
    kind: 'share', key: 'owner_occupied', label: 'Homes owner-occupied', topic: 'housing', table: 'B25003',
    numerator: ['B25003_002'], denominator: ['B25003_001'],
  },
  { kind: 'median', key: 'median_home_value', label: 'Median home value', topic: 'housing', table: 'B25077', variable: 'B25077_001' },

  {
    kind: 'share', key: 'veterans', label: 'Veterans (adults)', topic: 'background', table: 'B21001',
    numerator: ['B21001_002'], denominator: ['B21001_001'],
  },
  {
    kind: 'share', key: 'foreign_born', label: 'Born outside the U.S.', topic: 'background', table: 'B05002',
    numerator: ['B05002_013'], denominator: ['B05002_001'],
  },
];

/** Every Census variable the metrics read, without the E/M suffix, deduplicated and sorted. */
export const ACS_VARIABLES: string[] = [...new Set(ACS_METRICS.flatMap((metric) => {
  if (metric.kind === 'count') return metric.vars;
  if (metric.kind === 'share') return [...metric.numerator, ...metric.denominator];
  return [metric.variable, ...(metric.brackets ? [metric.brackets.total, ...metric.brackets.bins.map((bin) => bin.variable)] : [])];
}))].sort();

/** Bumped when the variable list or a metric definition changes, so stored rows can be traced. */
export const ACS_CATALOG_VERSION = 'acs-demographics-v1';
