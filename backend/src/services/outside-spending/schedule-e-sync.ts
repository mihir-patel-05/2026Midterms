/**
 * Syncs OpenFEC Schedule E (independent expenditures) for one cycle.
 *
 * Each run does two things within one page budget:
 *
 * 1. Recent window. Re-fetches every line dated in the last SCHEDULE_E_WINDOW_DAYS
 *    days. New 24/48-hour notices and new regular reports mostly land here.
 *    When the window is fetched completely, lines in it that OpenFEC no longer
 *    returns (replaced by an amendment) are deleted.
 * 2. Backfill. Walks everything older than the window, newest first, resuming
 *    from a stored keyset cursor so a large cycle loads over several runs. A
 *    finished backfill is restarted weekly to pick up late amendments.
 *
 * Requests use `most_recent=true`, so only the latest version of an amended
 * report comes back.
 */
import type { PrismaClient, Prisma } from '@prisma/client';
import type { FECKeysetBatch, FECKeysetCursor } from '../../config/fec-client.js';
import { scheduleERow, type FECScheduleE } from './schedule-e.js';

export const SCHEDULE_E_ENDPOINT = '/schedules/schedule_e/';
const PAGES_PER_BATCH = 10;
const UPSERT_CHUNK = 100;
const BACKFILL_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleEClient {
  getKeysetBatch<T>(endpoint: string, params: Record<string, unknown>, maxPages: number, initialCursor?: FECKeysetCursor): Promise<FECKeysetBatch<T>>;
}

export interface ScheduleESyncOptions {
  cycle: number;
  windowDays: number;
  maxPages: number;
  /** Lines per OpenFEC page, for counting pages used by a batch that ends early. */
  pageSize?: number;
  now?: Date;
  log?: (message: string) => void;
}

export interface ScheduleESyncStats {
  cycle: number;
  pages: number;
  window: { rows: number; skipped: number; complete: boolean; deleted: number; from: string };
  backfill: { rows: number; skipped: number; complete: boolean; deleted: number; before: string | null };
}

/** "2026-09-10": OpenFEC's date filters take ISO dates. */
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const startOfDay = (date: Date) => new Date(`${isoDay(date)}T00:00:00Z`);

type Db = Pick<PrismaClient, 'independentExpenditure' | 'scheduleESyncState' | '$transaction'>;

async function storeLines(db: Db, lines: FECScheduleE[], cycle: number, fetchedAt: Date) {
  const rows = lines.map((line) => scheduleERow(line, cycle, fetchedAt)).filter((row): row is Prisma.IndependentExpenditureCreateInput => row !== null);
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    await db.$transaction(rows.slice(i, i + UPSERT_CHUNK).map((row) => db.independentExpenditure.upsert({
      where: { subId: row.subId },
      create: row,
      update: row,
    })));
  }
  return { stored: rows.length, skipped: lines.length - rows.length };
}

/**
 * Fetch a keyset-paginated query in batches, storing each batch as it arrives,
 * until it is exhausted or the page budget runs out.
 */
async function walk(
  db: Db,
  client: ScheduleEClient,
  params: Record<string, unknown>,
  budget: { pages: number; pageSize: number },
  cycle: number,
  fetchedAt: Date,
  cursor: FECKeysetCursor = {},
  onBatch?: (nextCursor: FECKeysetCursor | null) => Promise<void>,
) {
  let rows = 0;
  let skipped = 0;
  let next: FECKeysetCursor | null = cursor;
  while (next && budget.pages > 0) {
    const pages = Math.min(PAGES_PER_BATCH, budget.pages);
    const batch: FECKeysetBatch<FECScheduleE> = await client.getKeysetBatch<FECScheduleE>(SCHEDULE_E_ENDPOINT, params, pages, next);
    // A batch that ends early used fewer pages; count what a full page of results implies.
    budget.pages -= batch.exhausted ? Math.min(pages, Math.max(1, Math.ceil(batch.results.length / budget.pageSize))) : pages;
    const stored = await storeLines(db, batch.results, cycle, fetchedAt);
    rows += stored.stored;
    skipped += stored.skipped;
    next = batch.exhausted ? null : batch.nextCursor;
    await onBatch?.(next);
  }
  return { rows, skipped, complete: next === null };
}

export async function syncScheduleE(db: Db, client: ScheduleEClient, options: ScheduleESyncOptions): Promise<ScheduleESyncStats> {
  const { cycle, windowDays, maxPages } = options;
  const now = options.now ?? new Date();
  const log = options.log ?? console.log;
  const runStart = new Date(now);
  const budget = { pages: maxPages, pageSize: options.pageSize ?? 100 };
  const windowStart = startOfDay(new Date(now.getTime() - windowDays * DAY_MS));
  const base = { cycle, most_recent: true, sort: '-expenditure_date' };

  let state = await db.scheduleESyncState.upsert({ where: { cycle }, create: { cycle }, update: {} });

  // 1. Recent window, fetched in full every run.
  log(`  Schedule E ${cycle}: recent window from ${isoDay(windowStart)}`);
  const window = await walk(db, client, { ...base, min_date: isoDay(windowStart) }, budget, cycle, runStart);
  let windowDeleted = 0;
  if (window.complete) {
    // Lines in the window that this pass did not see were replaced or withdrawn.
    windowDeleted = (await db.independentExpenditure.deleteMany({
      where: { cycle, expenditureDate: { gte: windowStart }, fetchedAt: { lt: runStart } },
    })).count;
    state = await db.scheduleESyncState.update({ where: { cycle }, data: { lastWindowSyncedAt: now, lastError: null } });
  } else {
    log(`  Schedule E ${cycle}: recent window not finished within ${maxPages} pages; raise SCHEDULE_E_MAX_PAGES`);
  }

  // 2. Backfill, resuming from the stored cursor. Restart it weekly once finished.
  const stale = state.backfillComplete && (!state.backfillDoneAt || now.getTime() - state.backfillDoneAt.getTime() > BACKFILL_REFRESH_MS);
  if (!state.backfillBefore || stale) {
    state = await db.scheduleESyncState.update({
      where: { cycle },
      data: { backfillBefore: windowStart, backfillCursor: {}, backfillStartedAt: now, backfillComplete: false, backfillDoneAt: null },
    });
  }

  const backfill = { rows: 0, skipped: 0, complete: state.backfillComplete, deleted: 0 };
  if (!state.backfillComplete && state.backfillBefore && budget.pages > 0) {
    const before = state.backfillBefore;
    const startedAt = state.backfillStartedAt ?? now;
    // OpenFEC's max_date is inclusive, so stop the day before the window began.
    const params = { ...base, max_date: isoDay(new Date(before.getTime() - DAY_MS)) };
    log(`  Schedule E ${cycle}: backfill before ${isoDay(before)}`);
    const result = await walk(
      db, client, params, budget, cycle, runStart,
      (state.backfillCursor as FECKeysetCursor | null) ?? {},
      async (nextCursor) => {
        await db.scheduleESyncState.update({
          where: { cycle },
          data: nextCursor ? { backfillCursor: nextCursor } : { backfillCursor: {}, backfillComplete: true, backfillDoneAt: now },
        });
      },
    );
    backfill.rows = result.rows;
    backfill.skipped = result.skipped;
    backfill.complete = result.complete;
    if (result.complete) {
      // A full pass is done: older lines it never saw were replaced or withdrawn.
      backfill.deleted = (await db.independentExpenditure.deleteMany({
        where: { cycle, expenditureDate: { lt: before }, fetchedAt: { lt: startedAt } },
      })).count;
    }
  }

  return {
    cycle,
    pages: maxPages - budget.pages,
    window: { rows: window.rows, skipped: window.skipped, complete: window.complete, deleted: windowDeleted, from: isoDay(windowStart) },
    backfill: { ...backfill, before: state.backfillBefore ? isoDay(state.backfillBefore) : null },
  };
}

export async function recordScheduleEError(db: Db, cycle: number, error: unknown) {
  await db.scheduleESyncState.upsert({
    where: { cycle },
    create: { cycle, lastError: error instanceof Error ? error.message : String(error) },
    update: { lastError: error instanceof Error ? error.message : String(error) },
  });
}
