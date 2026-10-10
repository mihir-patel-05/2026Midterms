/**
 * Demographics for a user's selection of counties and House districts in one state.
 *
 * - Counties only: the selected counties combined.
 * - Districts only: the selected districts combined.
 * - Both: the overlap, meaning only the pieces of the selected counties that lie
 *   inside the selected districts. Each piece is listed alongside the total.
 */
import type { AreaDemographics, PrismaClient } from '@prisma/client';
import { computeMetrics, type AreaValues, type MetricValue } from './census/acs-metrics.js';
import { STATE_FIPS_TO_POSTAL } from './census/census-client.js';
import { ACS_SOURCE_KEY } from './census/acs-sync.js';

export const MAX_SELECTED_COUNTIES = 300;
export const MAX_SELECTED_DISTRICTS = 60;

const POSTAL_TO_STATE_FIPS = Object.fromEntries(Object.entries(STATE_FIPS_TO_POSTAL).map(([fips, postal]) => [postal, fips]));

export type SelectionMode = 'counties' | 'districts' | 'overlap';

export interface DemographicsQuery {
  state: string;
  counties: string[];
  districts: string[];
  year: number;
}

export interface DemographicArea {
  geoType: AreaDemographics['geoType'];
  geoid: string;
  /** Census name, e.g. "Harris County (part), Congressional District 7 (119th Congress), Texas". */
  name: string;
  /** Short label, e.g. "Harris County · TX-07". */
  label: string;
  countyFips: string | null;
  districtCode: string | null;
  metrics: MetricValue[];
}

export interface DemographicsResult {
  selection: { state: string; counties: string[]; districts: string[]; mode: SelectionMode };
  acsYear: number;
  /** Congress whose district lines the figures use. */
  congress: number | null;
  /** The whole selection taken together; null when nothing in it has data. */
  combined: MetricValue[] | null;
  areas: DemographicArea[];
  /** Requested areas with no Census row for this vintage. */
  missing: { counties: string[]; districts: string[] };
  /** Overlap mode: selected areas that do not touch any selected area of the other kind. */
  noOverlap: { counties: string[]; districts: string[] };
  benchmarks: { state: { name: string; metrics: MetricValue[] } | null; nation: { name: string; metrics: MetricValue[] } | null };
  source: { name: string; attribution: string; homepageUrl: string | null; dataset: string; fetchedAt: string | null };
}

export class DemographicsNotLoadedError extends Error {
  constructor(state: string, year: number) {
    super(`ACS ${year} demographics have not been loaded for ${state}`);
    this.name = 'DemographicsNotLoadedError';
  }
}

export function stateFipsFor(state: string): string | null {
  return POSTAL_TO_STATE_FIPS[state] ?? null;
}

export function districtLabel(state: string, district: string): string {
  return district === '00' ? `${state} at-large` : `${state}-${district}`;
}

/** "Harris County, Texas" → "Harris County". */
const countyName = (row: Pick<AreaDemographics, 'name'>) => row.name.split(',')[0].trim();

const values = (row: AreaDemographics): AreaValues => ({
  estimates: row.estimates as Record<string, number | null>,
  moes: row.moes as Record<string, number | null>,
});

type Db = Pick<PrismaClient, 'areaDemographics' | 'dataSource'>;

export async function getDemographics(db: Db, query: DemographicsQuery): Promise<DemographicsResult> {
  const { state, year } = query;
  const counties = [...new Set(query.counties)].sort();
  const districts = [...new Set(query.districts)].sort();
  const stateFips = stateFipsFor(state);
  if (!stateFips) throw new DemographicsNotLoadedError(state, year);

  const [stateRow, nationRow, countyRows, districtRows] = await Promise.all([
    db.areaDemographics.findUnique({ where: { geoType_geoid_acsYear: { geoType: 'STATE', geoid: stateFips, acsYear: year } } }),
    db.areaDemographics.findUnique({ where: { geoType_geoid_acsYear: { geoType: 'NATION', geoid: '1', acsYear: year } } }),
    counties.length
      ? db.areaDemographics.findMany({ where: { geoType: 'COUNTY', acsYear: year, geoid: { in: counties } }, orderBy: { geoid: 'asc' } })
      : Promise.resolve([]),
    districts.length
      ? db.areaDemographics.findMany({ where: { geoType: 'CONGRESSIONAL_DISTRICT', acsYear: year, stateCode: state, districtCode: { in: districts } }, orderBy: { geoid: 'asc' } })
      : Promise.resolve([]),
  ]);
  if (!stateRow) throw new DemographicsNotLoadedError(state, year);

  const mode: SelectionMode = counties.length && districts.length ? 'overlap' : counties.length ? 'counties' : 'districts';
  const missing = {
    counties: counties.filter((fips) => !countyRows.some((row) => row.geoid === fips)),
    districts: districts.filter((code) => !districtRows.some((row) => row.districtCode === code)),
  };
  const noOverlap = { counties: [] as string[], districts: [] as string[] };
  const countyNames = new Map(countyRows.map((row) => [row.geoid, countyName(row)]));

  let areaRows: AreaDemographics[];
  if (mode === 'overlap') {
    areaRows = await db.areaDemographics.findMany({
      where: { geoType: 'COUNTY_DISTRICT_PART', acsYear: year, stateCode: state, countyFips: { in: counties }, districtCode: { in: districts } },
      orderBy: [{ countyFips: 'asc' }, { districtCode: 'asc' }],
    });
    noOverlap.counties = countyRows.map((row) => row.geoid).filter((fips) => !areaRows.some((row) => row.countyFips === fips));
    noOverlap.districts = districtRows.map((row) => row.districtCode!).filter((code) => !areaRows.some((row) => row.districtCode === code));
  } else {
    areaRows = mode === 'counties' ? countyRows : districtRows;
  }

  const label = (row: AreaDemographics) => {
    if (row.geoType === 'CONGRESSIONAL_DISTRICT') return districtLabel(state, row.districtCode!);
    if (row.geoType === 'COUNTY') return countyName(row);
    return `${countyNames.get(row.countyFips!) ?? row.countyFips} · ${districtLabel(state, row.districtCode!)}`;
  };

  const source = await db.dataSource.findUnique({ where: { key: ACS_SOURCE_KEY } });
  const fetchedAt = [stateRow, ...areaRows].reduce<Date | null>((latest, row) => (!latest || row.fetchedAt > latest ? row.fetchedAt : latest), null);

  return {
    selection: { state, counties, districts, mode },
    acsYear: year,
    congress: districtRows[0]?.congress ?? areaRows.find((row) => row.congress)?.congress ?? null,
    combined: areaRows.length ? computeMetrics(areaRows.map(values)) : null,
    areas: areaRows.map((row) => ({
      geoType: row.geoType,
      geoid: row.geoid,
      name: row.name,
      label: label(row),
      countyFips: row.countyFips,
      districtCode: row.districtCode,
      metrics: computeMetrics([values(row)]),
    })),
    missing,
    noOverlap,
    benchmarks: {
      state: { name: stateRow.name, metrics: computeMetrics([values(stateRow)]) },
      nation: nationRow ? { name: nationRow.name, metrics: computeMetrics([values(nationRow)]) } : null,
    },
    source: {
      name: source?.name ?? 'U.S. Census Bureau, American Community Survey 5-year estimates',
      attribution: source?.attributionText ?? 'U.S. Census Bureau, American Community Survey 5-year estimates.',
      homepageUrl: source?.homepageUrl ?? 'https://www.census.gov/programs-surveys/acs',
      dataset: `ACS ${year - 4}–${year} 5-year estimates`,
      fetchedAt: fetchedAt?.toISOString() ?? null,
    },
  };
}
