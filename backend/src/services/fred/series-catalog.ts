/**
 * FRED series we store, and how each one is shown (PLAN.md section 4.11).
 *
 * Values are stored as FRED publishes them (levels). Year-over-year and
 * month-over-month changes are computed in code from the stored levels, never
 * fetched pre-computed, so a revised level revises its change too.
 */
import type { IndicatorFrequency } from '@prisma/client';

export const FRED_SOURCE_KEY = 'fred';

/** Bump when the catalog or the stored shape changes; recorded as the IngestionRun parser version. */
export const FRED_CATALOG_VERSION = 'fred-indicators-v1';

/**
 * - `level`: the value as published.
 * - `yoy`: percent change from the observation a year earlier.
 * - `mom_change`: difference from the previous observation (payrolls).
 */
export type IndicatorTransform = 'level' | 'yoy' | 'mom_change';

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
}

const series = (
  fredId: string,
  name: string,
  unit: string,
  frequency: IndicatorFrequency,
  originalSource: string,
  transform: IndicatorTransform = 'level',
  restricted = false,
): FredSeriesDef => ({ fredId, key: `fred.${fredId}`, name, unit, frequency, originalSource, transform, restricted });

export const FRED_SERIES: readonly FredSeriesDef[] = [
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
  series('SP500', 'S&P 500', 'Index', 'DAILY', 'S&P Dow Jones Indices', 'level', true),
  series('VIXCLS', 'Cboe Volatility Index (VIX)', 'Index', 'DAILY', 'Cboe', 'level', true),
];

export function seriesByKey(catalog: readonly FredSeriesDef[] = FRED_SERIES): Map<string, FredSeriesDef> {
  return new Map(catalog.map((def) => [def.key, def]));
}
