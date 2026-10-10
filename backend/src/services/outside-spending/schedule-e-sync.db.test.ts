import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import type { FECKeysetCursor } from '../../config/fec-client.js';
import type { FECScheduleE } from './schedule-e.js';
import { syncScheduleE, type ScheduleEClient } from './schedule-e-sync.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// A cycle no real sync uses, so the test never touches real rows.
const CYCLE = 2096;
const NOW = new Date('2026-10-10T09:00:00Z');
let db: PrismaClient;

const line = (subId: string, date: string, overrides: Partial<FECScheduleE> = {}): FECScheduleE => ({
  sub_id: subId,
  committee_id: 'C00000001',
  committee: { name: 'EXAMPLE ACTION FUND' },
  candidate_id: 'H6PA07001',
  candidate_name: 'DOE, JANE',
  candidate_office: 'H',
  candidate_office_state: 'PA',
  candidate_office_district: '07',
  support_oppose_indicator: 'S',
  expenditure_amount: 1000,
  expenditure_date: date,
  expenditure_description: 'TV AD',
  is_notice: false,
  ...overrides,
});

/** Pages newest first, two lines per page, with OpenFEC-style keyset cursors. */
function fakeFec(data: () => FECScheduleE[]) {
  const calls: Array<Record<string, unknown>> = [];
  const client: ScheduleEClient = {
    async getKeysetBatch<T>(_endpoint: string, params: Record<string, unknown>, maxPages: number, initialCursor: FECKeysetCursor = {}) {
      calls.push({ ...params, ...initialCursor });
      const sorted = data()
        .filter((item) => (!params.min_date || item.expenditure_date! >= String(params.min_date)) && (!params.max_date || item.expenditure_date! <= String(params.max_date)))
        .sort((a, b) => b.expenditure_date!.localeCompare(a.expenditure_date!) || String(b.sub_id).localeCompare(String(a.sub_id)));
      let start = 0;
      if (initialCursor.last_index) start = sorted.findIndex((item) => item.sub_id === initialCursor.last_index) + 1;
      const results = sorted.slice(start, start + maxPages * 2);
      const end = start + results.length;
      const exhausted = end >= sorted.length;
      const last = results[results.length - 1];
      return {
        results: results as T[],
        exhausted,
        nextCursor: exhausted || !last ? null : { last_index: String(last.sub_id), last_expenditure_date: last.expenditure_date! },
      };
    },
  };
  return { client, calls };
}

const stored = async () => (await db.independentExpenditure.findMany({ where: { cycle: CYCLE }, orderBy: { subId: 'asc' } })).map((row) => row.subId);
const options = (overrides: Partial<Parameters<typeof syncScheduleE>[2]> = {}) => ({ cycle: CYCLE, windowDays: 30, maxPages: 100, pageSize: 2, now: NOW, log: () => {}, ...overrides });

before(() => {
  if (testDatabaseUrl) db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
});
beforeEach(async () => {
  if (!testDatabaseUrl) return;
  await db.independentExpenditure.deleteMany({ where: { cycle: CYCLE } });
  await db.scheduleESyncState.deleteMany({ where: { cycle: CYCLE } });
});
after(async () => {
  if (!testDatabaseUrl) return;
  await db.independentExpenditure.deleteMany({ where: { cycle: CYCLE } });
  await db.scheduleESyncState.deleteMany({ where: { cycle: CYCLE } });
  await db.$disconnect();
});

// Window starts 2026-09-10 for NOW = 2026-10-10 and 30 days.
const dataset = [
  line('e1', '2026-10-05'), line('e2', '2026-09-20'), line('e3', '2026-09-12', { is_notice: true }),
  line('o1', '2026-08-01'), line('o2', '2026-06-15'), line('o3', '2026-03-01'), line('o4', '2025-11-30'),
  line('bad', '2026-10-01', { support_oppose_indicator: null }),
];

test('one run stores the recent window and the full backfill', { skip: !testDatabaseUrl }, async () => {
  const { client, calls } = fakeFec(() => dataset);
  const stats = await syncScheduleE(db, client, options());
  assert.deepEqual(await stored(), ['e1', 'e2', 'e3', 'o1', 'o2', 'o3', 'o4']);
  assert.equal(stats.window.rows, 3);
  assert.equal(stats.window.skipped, 1);
  assert.equal(stats.window.from, '2026-09-10');
  assert.equal(stats.backfill.rows, 4);
  assert.equal(stats.backfill.complete, true);
  assert.equal(calls[0].min_date, '2026-09-10');
  assert.equal(calls[0].most_recent, true);
  // The backfill stops the day before the window, since max_date is inclusive.
  assert(calls.some((call) => call.max_date === '2026-09-09'));
});

test('a backfill larger than the page budget resumes on the next run', { skip: !testDatabaseUrl }, async () => {
  const { client } = fakeFec(() => dataset);
  // Window: 2 pages (4 lines incl. the bad one). Budget 3 leaves 1 page of backfill.
  const first = await syncScheduleE(db, client, options({ maxPages: 3 }));
  assert.equal(first.backfill.complete, false);
  assert.deepEqual(await stored(), ['e1', 'e2', 'e3', 'o1', 'o2']);
  const state = await db.scheduleESyncState.findUniqueOrThrow({ where: { cycle: CYCLE } });
  assert.deepEqual(state.backfillCursor, { last_index: 'o2', last_expenditure_date: '2026-06-15' });

  const second = await syncScheduleE(db, client, options({ maxPages: 3 }));
  assert.equal(second.backfill.complete, true);
  assert.deepEqual(await stored(), ['e1', 'e2', 'e3', 'o1', 'o2', 'o3', 'o4']);
});

test('lines replaced by an amendment disappear from the window and, after a full pass, the backfill', { skip: !testDatabaseUrl }, async () => {
  let data = dataset;
  const { client } = fakeFec(() => data);
  await syncScheduleE(db, client, options());

  // e2 is amended (new sub_id) and o3 is withdrawn.
  data = dataset.filter((item) => item.sub_id !== 'e2' && item.sub_id !== 'o3').concat(line('e2a', '2026-09-20', { expenditure_amount: 1500 }));
  // Eight days later, the weekly backfill restart runs a fresh full pass.
  const later = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
  const stats = await syncScheduleE(db, client, options({ now: later }));
  assert.equal(stats.window.deleted, 1);
  assert.equal(stats.backfill.deleted, 1);
  assert.deepEqual(await stored(), ['e1', 'e2a', 'e3', 'o1', 'o2', 'o4']);
});

test('an unfinished window deletes nothing', { skip: !testDatabaseUrl }, async () => {
  const { client } = fakeFec(() => dataset);
  await syncScheduleE(db, client, options());
  // A 400-day window spans all 8 lines (4 pages); a one-page budget cannot finish it,
  // so lines it did not reach this time must survive.
  const stats = await syncScheduleE(db, client, options({ maxPages: 1, windowDays: 400, now: new Date(NOW.getTime() + 1000) }));
  assert.equal(stats.window.complete, false);
  assert.equal(stats.window.deleted, 0);
  assert.deepEqual(await stored(), ['e1', 'e2', 'e3', 'o1', 'o2', 'o3', 'o4']);
});
