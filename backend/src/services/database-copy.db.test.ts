import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { copyDatabase, planCopy } from './database-copy.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
// Two throwaway schemas in the test database stand in for the old and new databases.
const SOURCE = 'copy_test_old';
const TARGET = 'copy_test_new';
let admin: PrismaClient;
let source: PrismaClient;
let target: PrismaClient;

function clientFor(schema: string): PrismaClient {
  const url = new URL(testDatabaseUrl!);
  url.searchParams.set('schema', schema);
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}

// A cut-down schema with what makes the copy hard: contests and snapshots that point
// at each other, a self-reference, BigInt and Decimal values, JSON, arrays, a lease,
// and (in the new database only) a column added by a later migration.
function schemaSql(schema: string, newer: boolean): string[] {
  return [
    `DROP SCHEMA IF EXISTS ${schema} CASCADE`,
    `CREATE SCHEMA ${schema}`,
    `CREATE TABLE ${schema}._prisma_migrations (id TEXT PRIMARY KEY, migration_name TEXT NOT NULL, finished_at TIMESTAMPTZ, rolled_back_at TIMESTAMPTZ)`,
    `CREATE TABLE ${schema}.contests (id TEXT PRIMARY KEY, name TEXT NOT NULL, current_snapshot_id TEXT UNIQUE)`,
    `CREATE TABLE ${schema}.result_snapshots (
       id TEXT PRIMARY KEY, contest_id TEXT NOT NULL REFERENCES ${schema}.contests(id),
       votes BIGINT NOT NULL, share DECIMAL(15,2), payload JSONB, cycles INTEGER[], captured_at TIMESTAMP(3) NOT NULL
       ${newer ? ", label TEXT NOT NULL DEFAULT 'unlabelled'" : ''})`,
    `ALTER TABLE ${schema}.contests ADD FOREIGN KEY (current_snapshot_id) REFERENCES ${schema}.result_snapshots(id)`,
    `CREATE TABLE ${schema}.reporting_units (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES ${schema}.reporting_units(id))`,
    `CREATE TABLE ${schema}.receipts (id TEXT PRIMARY KEY, amount DECIMAL(15,2) NOT NULL)`,
    `CREATE TABLE ${schema}.sync_leases (name TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at TIMESTAMP(3) NOT NULL)`,
    `CREATE TABLE ${schema}.sync_logs (id TEXT PRIMARY KEY, status TEXT NOT NULL, error_message TEXT, completed_at TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL)`,
    `INSERT INTO ${schema}._prisma_migrations VALUES ('1', 'm1_init', NOW(), NULL)`,
    ...(newer ? [`INSERT INTO ${schema}._prisma_migrations VALUES ('2', 'm2_label', NOW(), NULL)`] : []),
  ];
}

async function run(statements: string[]): Promise<void> {
  for (const statement of statements) await admin.$executeRawUnsafe(statement);
}

before(async () => {
  if (!testDatabaseUrl) return;
  admin = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  source = clientFor(SOURCE);
  target = clientFor(TARGET);
});

beforeEach(async () => {
  if (!testDatabaseUrl) return;
  await run([...schemaSql(SOURCE, false), ...schemaSql(TARGET, true)]);
  await run([
    `INSERT INTO ${SOURCE}.contests (id, name) VALUES ('c1', 'PA-SEN')`,
    `INSERT INTO ${SOURCE}.result_snapshots VALUES
       ('s1', 'c1', 9007199254740993, 1234567890123.45, '{"precincts":{"in":10,"of":12},"note":null}', '{2024,2026}', '2026-11-03 23:59:59.123')`,
    `UPDATE ${SOURCE}.contests SET current_snapshot_id = 's1' WHERE id = 'c1'`,
    // After the update, the parent's row sits after its child's in physical order.
    `INSERT INTO ${SOURCE}.reporting_units VALUES ('state', NULL), ('county', 'state')`,
    `UPDATE ${SOURCE}.reporting_units SET parent_id = NULL WHERE id = 'state'`,
    // More than one batch.
    `INSERT INTO ${SOURCE}.receipts SELECT 'r' || n, n + 0.25 FROM generate_series(1, 1203) n`,
    `INSERT INTO ${SOURCE}.sync_leases VALUES ('fec-full', 'old-deployment', NOW() + INTERVAL '12 hours')`,
    `INSERT INTO ${SOURCE}.sync_logs VALUES ('l1', 'running', NULL, NULL, NOW()), ('l2', 'completed', NULL, '2026-10-28 02:00:00', NOW())`,
  ]);
});

after(async () => {
  if (!testDatabaseUrl) return;
  await run([`DROP SCHEMA IF EXISTS ${SOURCE} CASCADE`, `DROP SCHEMA IF EXISTS ${TARGET} CASCADE`]);
  await Promise.all([admin.$disconnect(), source.$disconnect(), target.$disconnect()]);
});

test('copies every row exactly into the empty new database', { skip: !testDatabaseUrl }, async () => {
  const result = await copyDatabase(source, target, () => {});
  assert.equal(result.status, 'copied');
  assert.deepEqual(
    result.status === 'copied' && Object.fromEntries(result.tables.map(({ table, rows }) => [table, rows])),
    { contests: 1, result_snapshots: 1, reporting_units: 2, receipts: 1203, sync_logs: 2 },
  );

  const [snapshot] = await target.$queryRawUnsafe<Record<string, string>[]>(
    `SELECT votes::text, share::text, payload::text, cycles::text, captured_at::text, label FROM result_snapshots`,
  );
  assert.deepEqual(snapshot, {
    votes: '9007199254740993',
    share: '1234567890123.45',
    payload: '{"note": null, "precincts": {"in": 10, "of": 12}}',
    cycles: '{2024,2026}',
    captured_at: '2026-11-03 23:59:59.123',
    // A column only the new database has gets its default.
    label: 'unlabelled',
  });
  const [contest] = await target.$queryRawUnsafe<{ current_snapshot_id: string }[]>('SELECT current_snapshot_id FROM contests');
  assert.equal(contest.current_snapshot_id, 's1');
  const [receipts] = await target.$queryRawUnsafe<{ total: string }[]>('SELECT sum(amount)::text AS total FROM receipts');
  assert.equal(receipts.total, String((1203 * 1204) / 2 + 1203 * 0.25));
});

test('leaves out sync leases and stops copied syncs that were still running', { skip: !testDatabaseUrl }, async () => {
  await copyDatabase(source, target, () => {});
  const leases = await target.$queryRawUnsafe<unknown[]>('SELECT * FROM sync_leases');
  assert.equal(leases.length, 0);
  const logs = await target.$queryRawUnsafe<{ id: string; status: string; error_message: string | null }[]>(
    'SELECT id, status, error_message FROM sync_logs ORDER BY id',
  );
  assert.deepEqual(logs.map(({ id, status }) => [id, status]), [['l1', 'failed'], ['l2', 'completed']]);
  assert.match(logs[0].error_message ?? '', /new PostgreSQL service/);
  const [old] = await source.$queryRawUnsafe<{ status: string }[]>(`SELECT status FROM sync_logs WHERE id = 'l1'`);
  assert.equal(old.status, 'running', 'the old database is never written to');
});

test('skips once the new database has rows, and changes nothing', { skip: !testDatabaseUrl }, async () => {
  await copyDatabase(source, target, () => {});
  await admin.$executeRawUnsafe(`INSERT INTO ${SOURCE}.receipts VALUES ('late', 1)`);
  const again = await copyDatabase(source, target, () => {});
  assert.equal(again.status, 'skipped');
  const [receipts] = await target.$queryRawUnsafe<{ rows: number }[]>('SELECT count(*)::int AS rows FROM receipts');
  assert.equal(receipts.rows, 1203);

  // A COPY_FROM_DATABASE_URL left set after the old database is deleted must not break deploys.
  const url = new URL(testDatabaseUrl!);
  url.pathname = '/copy_test_deleted_database';
  const gone = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  assert.equal((await copyDatabase(gone, target, () => {})).status, 'skipped');
  await gone.$disconnect();
});

test('refuses to copy into a database that is missing migrations', { skip: !testDatabaseUrl }, async () => {
  await admin.$executeRawUnsafe(`DELETE FROM ${TARGET}._prisma_migrations WHERE migration_name = 'm1_init'`);
  assert.deepEqual((await planCopy(source, target)).missingMigrations, ['m1_init']);
  await assert.rejects(copyDatabase(source, target, () => {}), /missing 1 migrations \(m1_init\)/);
  const [receipts] = await target.$queryRawUnsafe<{ rows: number }[]>('SELECT count(*)::int AS rows FROM receipts');
  assert.equal(receipts.rows, 0);
});

test('a failed copy leaves the new database empty', { skip: !testDatabaseUrl }, async () => {
  // A value the new database rejects, partway through.
  await run([`ALTER TABLE ${TARGET}.receipts ADD CHECK (amount < 1000)`]);
  await assert.rejects(copyDatabase(source, target, () => {}));
  const [contests] = await target.$queryRawUnsafe<{ rows: number }[]>('SELECT count(*)::int AS rows FROM contests');
  assert.equal(contests.rows, 0);
  assert.equal((await planCopy(source, target)).filledTargetTables.length, 0, 'the next deploy can try again');
});
