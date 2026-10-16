/**
 * FRED series we store, and how each one is shown (PLAN.md section 4.11).
 *
 * Values are stored as FRED publishes them (levels). Year-over-year and
 * month-over-month changes are computed in code from the stored levels, never
 * fetched pre-computed, so a revised level revises its change too.
 */
import type { IndicatorFrequency } from '@prisma/client';
import { STATE_FIPS_TO_POSTAL } from '../census/census-client.js';

export const FRED_SOURCE_KEY = 'fred';

/** Bump when the catalog or the stored shape changes; recorded as the IngestionRun parser version. */
export const FRED_CATALOG_VERSION = 'fred-indicators-v2';

/**
 * - `level`: the value as published.
 * - `yoy`: percent change from the observation a year earlier.
 * - `mom_change`: difference from the previous observation (payrolls).
 * - `qoq_annualized`: percent change from the prior quarter at an annual rate
 *   (state real GDP, which FRED publishes only as a level).
 */
export type IndicatorTransform = 'level' | 'yoy' | 'mom_change' | 'qoq_annualized';

export interface FredSeriesDef {
  fredId: string;
  /** `indicator_series.key`. */
  key: string;
  name: string;
  unit: string;
  frequency: IndicatorFrequency;
  /** The agency that publishes the data FRED redistributes. */
  originalSource: string;
  transform: IndicatorTransform;
  /**
   * FRED's copy carries a notice barring reproduction without permission. Ingested,
   * but only served when FRED_RESTRICTED_SERIES_ENABLED is on.
   */
  restricted: boolean;
  /** Postal code for a state series; null for a national one. */
  stateCode: string | null;
  /** Overrides STALE_AFTER_DAYS for this series' frequency. */
  staleAfterDays?: number;
}

const series = (
  fredId: string,
  name: string,
  unit: string,
  frequency: IndicatorFrequency,
  originalSource: string,
  transform: IndicatorTransform = 'level',
  restricted = false,
): FredSeriesDef => ({ fredId, key: `fred.${fredId}`, name, unit, frequency, originalSource, transform, restricted, stateCode: null });

export const FRED_NATIONAL_SERIES: readonly FredSeriesDef[] = [
  series('A191RL1Q225SBEA', 'Real GDP growth', 'Percent, annualized', 'QUARTERLY', 'BEA'),
  series('GDPNOW', 'GDPNow estimate', 'Percent, annualized', 'QUARTERLY', 'Atlanta Fed'),
  series('DCOILWTICO', 'WTI crude oil', 'Dollars per barrel', 'DAILY', 'EIA'),
  series('DCOILBRENTEU', 'Brent crude oil', 'Dollars per barrel', 'DAILY', 'EIA'),
  series('GASREGW', 'Regular gasoline, U.S.', 'Dollars per gallon', 'WEEKLY', 'EIA', 'yoy'),
  series('CPIAUCSL', 'Consumer prices (CPI)', 'Index 1982-1984=100', 'MONTHLY', 'BLS', 'yoy'),
  series('CPILFESL', 'Core CPI (less food and energy)', 'Index 1982-1984=100', 'MONTHLY', 'BLS', 'yoy'),
  // No tile: the inflation-adjusted gas toggle in section 4.8 reads it.
  series('CPILEGSL', 'CPI, all items less energy', 'Index 1982-1984=100', 'MONTHLY', 'BLS'),
  series('UNRATE', 'Unemployment rate', 'Percent', 'MONTHLY', 'BLS'),
  series('PAYEMS', 'Nonfarm payrolls', 'Thousands of persons', 'MONTHLY', 'BLS', 'mom_change'),
  series('ICSA', 'Initial jobless claims', 'Number', 'WEEKLY', 'Department of Labor'),
  series('DFEDTARL', 'Fed funds target, lower bound', 'Percent', 'DAILY', 'Federal Reserve Board'),
  series('DFEDTARU', 'Fed funds target, upper bound', 'Percent', 'DAILY', 'Federal Reserve Board'),
  series('MORTGAGE30US', '30-year fixed mortgage rate', 'Percent', 'WEEKLY', 'Freddie Mac'),
  series('DGS10', '10-year Treasury yield', 'Percent', 'DAILY', 'Federal Reserve H.15'),
  series('DGS2', '2-year Treasury yield', 'Percent', 'DAILY', 'Federal Reserve H.15'),
  series('T10Y2Y', '10-year minus 2-year Treasury', 'Percentage points', 'DAILY', 'Federal Reserve H.15'),
  series('A229RX0', 'Real disposable income per person', 'Chained 2017 dollars', 'MONTHLY', 'BEA', 'yoy'),
  series('UMCSENT', 'Consumer sentiment', 'Index 1966:Q1=100', 'MONTHLY', 'University of Michigan'),
  // The U.S. line for the state home price tiles; its own tile too.
  series('USSTHPI', 'House price index, U.S.', 'Index 1980:Q1=100', 'QUARTERLY', 'FHFA', 'yoy'),
  series('SP500', 'S&P 500', 'Index', 'DAILY', 'S&P Dow Jones Indices', 'level', true),
  series('VIXCLS', 'Cboe Volatility Index (VIX)', 'Index', 'DAILY', 'Cboe', 'level', true),
];

/** The 50 states and DC. FRED has none of these series for Puerto Rico. */
export const FRED_STATE_CODES: readonly string[] = Object.values(STATE_FIPS_TO_POSTAL).filter((code) => code !== 'PR');

/** FRED IDs are the postal code followed by `suffix`, e.g. CAUR. */
const STATE_TEMPLATES: ReadonlyArray<Omit<FredSeriesDef, 'fredId' | 'key' | 'name' | 'restricted' | 'stateCode'> & { suffix: string; name: string }> = [
  { suffix: 'UR', name: 'Unemployment rate', unit: 'Percent', frequency: 'MONTHLY', originalSource: 'BLS', transform: 'level' },
  { suffix: 'NA', name: 'Nonfarm payrolls', unit: 'Thousands of persons', frequency: 'MONTHLY', originalSource: 'BLS', transform: 'mom_change' },
  // State claims come out a week after the national figure and are not seasonally
  // adjusted; 14 days would show them "Stale" every Wednesday.
  { suffix: 'ICLAIMS', name: 'Initial jobless claims, not seasonally adjusted', unit: 'Number', frequency: 'WEEKLY', originalSource: 'Department of Labor', transform: 'level', staleAfterDays: 21 },
  { suffix: 'RQGSP', name: 'Real GDP', unit: 'Millions of chained 2017 dollars', frequency: 'QUARTERLY', originalSource: 'BEA', transform: 'qoq_annualized' },
  { suffix: 'STHPI', name: 'House price index', unit: 'Index 1980:Q1=100', frequency: 'QUARTERLY', originalSource: 'FHFA', transform: 'yoy' },
];

export const FRED_STATE_SERIES: readonly FredSeriesDef[] = FRED_STATE_CODES.flatMap((stateCode) =>
  STATE_TEMPLATES.map(({ suffix, name, ...template }): FredSeriesDef => ({
    ...template,
    fredId: `${stateCode}${suffix}`,
    key: `fred.${stateCode}${suffix}`,
    name: `${name}, ${stateCode}`,
    restricted: false,
    stateCode,
  })));

/** Everything the sync loads. */
export const FRED_SERIES: readonly FredSeriesDef[] = [...FRED_NATIONAL_SERIES, ...FRED_STATE_SERIES];

/** A state's series in `catalog`, or none for a code FRED has no state series for (PR). */
export function stateSeries(code: string, catalog: readonly FredSeriesDef[] = FRED_STATE_SERIES): FredSeriesDef[] {
  return catalog.filter((def) => def.stateCode === code);
}

export function nationalSeries(catalog: readonly FredSeriesDef[] = FRED_SERIES): FredSeriesDef[] {
  return catalog.filter((def) => def.stateCode === null);
}

export function seriesByKey(catalog: readonly FredSeriesDef[] = FRED_SERIES): Map<string, FredSeriesDef> {
  return new Map(catalog.map((def) => [def.key, def]));
}
