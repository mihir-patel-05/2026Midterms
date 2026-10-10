/**
 * Loads ACS 5-year estimates into area_demographics for the nation, states,
 * counties, congressional districts, and the county pieces inside each district.
 * The district rows also fill district_profiles for race pages.
 *
 * ACS publishes once a year, so this runs on demand (`npm run sync:acs`), not on
 * a schedule. Re-running the same year updates rows in place.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { computeMetrics } from './acs-metrics.js';
import { ACS_CATALOG_VERSION, ACS_VARIABLES } from './acs-variables.js';
import { STATE_FIPS_TO_POSTAL, type AcsAreaRow, type AcsGeographyQuery, type CensusClient } from './census-client.js';

export const ACS_SOURCE_KEY = 'census-acs5';

/** Congress whose district lines each ACS vintage tabulates. */
const CONGRESS_BY_ACS_YEAR: Record<number, number> = { 2022: 118, 2023: 118, 2024: 119 };

const UPSERT_BATCH = 250;

export interface AcsSyncStats {
  year: number;
  rows: Record<string, number>;
  districtProfiles: number;
  requests: number;
}

export function nationalQueries(): AcsGeographyQuery[] {
  return [
    { geoType: 'NATION', for: 'us:1' },
    { geoType: 'STATE', for: 'state:*' },
    { geoType: 'COUNTY', for: 'county:*', in: 'state:*' },
    { geoType: 'CONGRESSIONAL_DISTRICT', for: 'congressional district:*', in: 'state:*' },
  ];
}

/** County pieces within districts are only published state by state. */
export function countyPartQuery(stateFips: string): AcsGeographyQuery {
  return { geoType: 'COUNTY_DISTRICT_PART', for: 'county (or part):*', in: `state:${stateFips} congressional district:*` };
}

export async function syncAcs(
  db: PrismaClient,
  client: CensusClient,
  year: number,
  log: (message: string) => void = console.log,
): Promise<AcsSyncStats> {
  const startedAt = new Date();
  const source = await db.dataSource.upsert({
    where: { key: ACS_SOURCE_KEY },
    update: { lastCheckedAt: startedAt },
    create: {
      key: ACS_SOURCE_KEY,
      name: 'U.S. Census Bureau, American Community Survey 5-year estimates',
      type: 'OFFICIAL_FEDERAL',
      authority: 'U.S. Census Bureau',
      homepageUrl: 'https://www.census.gov/programs-surveys/acs',
      attributionText: 'U.S. Census Bureau, American Community Survey 5-year estimates. Estimates carry margins of error.',
      licenseName: 'Public domain (U.S. government work)',
      coverageDescription: 'Population, age, race and ethnicity, income, education, employment, and housing for the nation, states, counties, congressional districts, and county pieces within districts.',
      isEnabled: true,
      lastCheckedAt: startedAt,
    },
  });
  const run = await db.ingestionRun.create({
    data: {
      sourceId: source.id,
      status: 'RUNNING',
      parserVersion: ACS_CATALOG_VERSION,
      startedAt,
      metadata: { year, dataset: 'acs/acs5', variables: ACS_VARIABLES.length },
    },
  });

  const stats: AcsSyncStats = { year, rows: {}, districtProfiles: 0, requests: 0 };
  const congress = CONGRESS_BY_ACS_YEAR[year] ?? null;

  const store = async (query: AcsGeographyQuery) => {
    const fetchedAt = new Date();
    const areas = await client.fetchAreas(query, ACS_VARIABLES);
    // Identifies the dataset and geography; the variables are listed in acs-variables.ts.
    const sourceUrl = client.redactedUrl(query, ['NAME']);
    for (let i = 0; i < areas.length; i += UPSERT_BATCH) {
      await db.$transaction(areas.slice(i, i + UPSERT_BATCH).map((area) => {
        const data = rowData(area, { year, congress, sourceUrl, sourceId: source.id, ingestionRunId: run.id, fetchedAt });
        return db.areaDemographics.upsert({
          where: { geoType_geoid_acsYear: { geoType: area.geoType, geoid: area.geoid, acsYear: year } },
          update: data,
          create: data,
        });
      }));
    }
    stats.rows[query.geoType] = (stats.rows[query.geoType] ?? 0) + areas.length;
    return areas;
  };

  try {
    let districts: AcsAreaRow[] = [];
    for (const query of nationalQueries()) {
      const areas = await store(query);
      log(`  ${query.geoType}: ${areas.length} areas`);
      if (query.geoType === 'CONGRESSIONAL_DISTRICT') districts = areas;
    }

    const statesWithDistricts = [...new Set(districts.map((area) => area.stateFips).filter((fips): fips is string => Boolean(fips && STATE_FIPS_TO_POSTAL[fips])))].sort();
    for (const stateFips of statesWithDistricts) {
      const parts = await store(countyPartQuery(stateFips));
      log(`  ${STATE_FIPS_TO_POSTAL[stateFips]} county pieces: ${parts.length}`);
    }

    for (const area of districts) {
      if (!area.stateCode || !area.districtCode) continue;
      const metrics = computeMetrics([area]);
      const value = (key: string) => metrics.find((metric) => metric.key === key)?.value ?? null;
      const profile = {
        population: value('population'),
        medianHouseholdIncome: value('median_household_income'),
        demographics: metrics as unknown as Prisma.InputJsonValue,
        sourceId: source.id,
      };
      await db.districtProfile.upsert({
        where: { stateCode_districtCode_acsYear: { stateCode: area.stateCode, districtCode: area.districtCode, acsYear: year } },
        update: profile,
        create: { stateCode: area.stateCode, districtCode: area.districtCode, acsYear: year, ...profile },
      });
      stats.districtProfiles++;
    }

    stats.requests = client.requestCount;
    const accepted = Object.values(stats.rows).reduce((sum, count) => sum + count, 0);
    const completedAt = new Date();
    await db.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'SUCCEEDED', completedAt, recordsFetched: accepted, recordsAccepted: accepted, metadata: { ...stats, dataset: 'acs/acs5' } },
    });
    await db.dataSource.update({ where: { id: source.id }, data: { healthStatus: 'CURRENT', lastSuccessfulAt: completedAt } });
    return stats;
  } catch (error) {
    const accepted = Object.values(stats.rows).reduce((sum, count) => sum + count, 0);
    await db.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: accepted > 0 ? 'PARTIAL' : 'FAILED',
        completedAt: new Date(),
        recordsAccepted: accepted,
        errorSummary: error instanceof Error ? error.message : String(error),
      },
    });
    await db.dataSource.update({ where: { id: source.id }, data: { healthStatus: 'DEGRADED' } });
    throw error;
  }
}

function rowData(
  area: AcsAreaRow,
  context: { year: number; congress: number | null; sourceUrl: string; sourceId: string; ingestionRunId: string; fetchedAt: Date },
) {
  return {
    geoType: area.geoType,
    geoid: area.geoid,
    name: area.name,
    stateCode: area.stateCode,
    countyFips: area.countyFips,
    districtCode: area.districtCode,
    congress: area.districtCode ? context.congress : null,
    acsYear: context.year,
    catalogVersion: ACS_CATALOG_VERSION,
    estimates: area.estimates,
    moes: area.moes,
    sourceUrl: context.sourceUrl,
    sourceId: context.sourceId,
    ingestionRunId: context.ingestionRunId,
    fetchedAt: context.fetchedAt,
  };
}
