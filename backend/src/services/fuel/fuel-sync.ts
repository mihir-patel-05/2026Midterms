/**
 * Loads EIA weekly gasoline and diesel prices into indicator_series and indicator_observations
 * (PLAN.md §4.8). Keeps the last 3 years. New weeks are inserted; a stored week is updated only
 * when EIA revised it. One failing series is recorded and the run moves on (PARTIAL).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type { EiaClient } from './eia-client.js';
import { EIA_SOURCE_KEY, FUEL_CATALOG_VERSION, FUEL_SERIES, type FuelSeriesDef } from './fuel-catalog.js';

const KEEP_YEARS = 3;

export interface FuelSyncStats {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  inserted: number;
  updated: number;
  failures: Array<{ eiaId: string; error: string }>;
}

export async function syncFuel(db: PrismaClient, client: EiaClient, options: { catalog?: readonly FuelSeriesDef[]; sourceKey?: string; now?: Date } = {}): Promise<FuelSyncStats> {
  const { catalog = FUEL_SERIES, sourceKey = EIA_SOURCE_KEY, now = new Date() } = options;
  await db.dataSource.createMany({
    skipDuplicates: true,
    data: {
      key: sourceKey,
      name: 'U.S. Energy Information Administration',
      type: 'OFFICIAL_FEDERAL',
      authority: 'EIA',
      homepageUrl: 'https://www.eia.gov/petroleum/gasdiesel/',
      attributionText: 'Fuel prices: U.S. Energy Information Administration, weekly retail gasoline and diesel prices.',
      licenseName: 'Public domain (U.S. government work)',
      coverageDescription: 'Weekly retail regular gasoline and diesel prices for the U.S., the states EIA prices on their own, and the PADD regions.',
      expectedCadenceSeconds: 7 * 24 * 3600,
    },
  });
  const source = await db.dataSource.findUniqueOrThrow({ where: { key: sourceKey } });
  const run = await db.ingestionRun.create({
    data: { sourceId: source.id, status: 'RUNNING', parserVersion: FUEL_CATALOG_VERSION, startedAt: now, metadata: { urls: catalog.map((def) => client.publicUrl(def.eiaId)) } },
  });
  const since = new Date(Date.UTC(now.getUTCFullYear() - KEEP_YEARS, now.getUTCMonth(), now.getUTCDate()));
  const stats: FuelSyncStats = { status: 'SUCCEEDED', inserted: 0, updated: 0, failures: [] };

  for (const def of catalog) {
    try {
      const points = (await client.weekly(def.eiaId)).filter((point) => new Date(`${point.date}T00:00:00Z`) >= since);
      if (points.length === 0) throw new Error('no observations in the last 3 years');
      const series = await db.indicatorSeries.upsert({
        where: { key: def.key },
        create: { key: def.key, name: def.name, unit: 'Dollars per gallon', frequency: 'WEEKLY', sourceId: source.id, description: `EIA series ${def.eiaId} (${def.area.name}).` },
        update: { name: def.name },
        select: { id: true },
      });
      const stored = new Map((await db.indicatorObservation.findMany({
        where: { seriesId: series.id, observedAt: { gte: since } },
        select: { id: true, observedAt: true, value: true },
      })).map((row) => [row.observedAt.toISOString().slice(0, 10), row]));
      const fresh = points.filter((point) => !stored.has(point.date));
      const revised = points.filter((point) => {
        const row = stored.get(point.date);
        // Compared at the stored precision (6 places), so float noise is never a revision.
        return row && !row.value.equals(new Prisma.Decimal(point.value).toDecimalPlaces(6));
      });
      if (fresh.length) {
        const result = await db.indicatorObservation.createMany({
          skipDuplicates: true,
          data: fresh.map((point) => ({ seriesId: series.id, observedAt: new Date(`${point.date}T00:00:00Z`), value: new Prisma.Decimal(point.value), fetchedAt: now })),
        });
        stats.inserted += result.count;
      }
      for (const point of revised) {
        await db.indicatorObservation.update({ where: { id: stored.get(point.date)!.id }, data: { value: new Prisma.Decimal(point.value), fetchedAt: now } });
        stats.updated++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stats.failures.push({ eiaId: def.eiaId, error: message });
      await db.ingestionError.create({ data: { ingestionRunId: run.id, severity: 'ERROR', code: 'EIA_SERIES_FAILED', message: `${def.eiaId}: ${message}`.slice(0, 2000), recordKey: def.key } });
    }
  }
  stats.status = stats.failures.length === 0 ? 'SUCCEEDED' : stats.failures.length === catalog.length ? 'FAILED' : 'PARTIAL';
  await db.ingestionRun.update({
    where: { id: run.id },
    data: {
      status: stats.status, completedAt: new Date(), recordsFetched: catalog.length, recordsAccepted: stats.inserted + stats.updated, recordsRejected: stats.failures.length,
      errorSummary: stats.failures.slice(0, 5).map((failure) => `${failure.eiaId}: ${failure.error}`).join('; ') || null,
    },
  });
  await db.dataSource.update({
    where: { id: source.id },
    data: {
      lastCheckedAt: now,
      ...(stats.status !== 'FAILED' ? { lastSuccessfulAt: now } : {}),
      healthStatus: stats.status === 'SUCCEEDED' ? 'CURRENT' : stats.status === 'PARTIAL' ? 'DEGRADED' : 'UNAVAILABLE',
    },
  });
  return stats;
}
