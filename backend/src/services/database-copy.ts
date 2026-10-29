import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Copy every row of the old main database into a new one with the same schema.
 * Used once, when the main database moves to a new PostgreSQL service because the
 * old one is full (COPY_FROM_DATABASE_URL, see scripts/copy-database.ts).
 *
 * The target must have every migration the source has, and no rows yet. The copy
 * is one transaction, so it either loads everything or nothing, and a database
 * that already holds data is never written to. That makes it safe to leave in the
 * pre-deploy step: after the first run it skips.
 */

// _prisma_migrations: the target has its own from `prisma migrate deploy`.
// sync_leases: locks the old deployment may hold for a running sync. Copied, they
// would block the new deployment's syncs until they expire (up to 12 hours).
const SKIPPED_TABLES = new Set(['_prisma_migrations', 'sync_leases']);
const BATCH_ROWS = 500;
const TRANSACTION_MS = 60 * 60 * 1000;

export interface CopyPlan {
  /** Source migrations the target lacks. The copy refuses to run until this is empty. */
  missingMigrations: string[];
  /** Target tables that already have rows. The copy only writes into an empty database. */
  filledTargetTables: string[];
  /** Source tables the target no longer has; their rows are not copied. */
  droppedTables: string[];
  /** Tables to copy, with the columns both databases have, in the target's order. */
  tables: { table: string; columns: string[] }[];
}

export type CopyResult =
  | { status: 'copied'; tables: { table: string; rows: number }[] }
  | { status: 'skipped'; reason: string };

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

async function appliedMigrations(db: PrismaClient, label: string): Promise<Set<string>> {
  const [{ found }] = await db.$queryRawUnsafe<{ found: boolean }[]>(`SELECT to_regclass('_prisma_migrations') IS NOT NULL AS found`);
  if (!found) throw new Error(`The ${label} database has no tables yet; run \`prisma migrate deploy\` against it first`);
  const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  return new Set(rows.map((row) => row.migration_name));
}

async function tableColumns(db: PrismaClient): Promise<Map<string, string[]>> {
  const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position`);
  const tables = new Map<string, string[]>();
  for (const row of rows) tables.set(row.table_name, [...(tables.get(row.table_name) ?? []), row.column_name]);
  return tables;
}

async function hasRows(db: PrismaClient | Prisma.TransactionClient, table: string): Promise<boolean> {
  const [row] = await db.$queryRawUnsafe<{ filled: boolean }[]>(`SELECT EXISTS (SELECT 1 FROM ${quoteIdent(table)}) AS filled`);
  return row.filled;
}

async function filledTables(db: PrismaClient, tables: Iterable<string>): Promise<string[]> {
  const filled: string[] = [];
  for (const table of tables) {
    if (table !== '_prisma_migrations' && (await hasRows(db, table))) filled.push(table);
  }
  return filled;
}

function skippedBecauseFilled(tables: string[]): CopyResult {
  const named = tables.length > 3 ? `${tables.slice(0, 3).join(', ')} and ${tables.length - 3} more tables` : tables.join(', ');
  return { status: 'skipped', reason: `the new database already has rows (in ${named}), and the copy only writes into an empty one` };
}

export async function planCopy(source: PrismaClient, target: PrismaClient): Promise<CopyPlan> {
  const [sourceMigrations, targetMigrations] = await Promise.all([
    appliedMigrations(source, 'old'),
    appliedMigrations(target, 'new'),
  ]);
  const [sourceTables, targetTables] = await Promise.all([tableColumns(source), tableColumns(target)]);

  const filledTargetTables = await filledTables(target, targetTables.keys());

  const tables: CopyPlan['tables'] = [];
  const droppedTables: string[] = [];
  for (const [table, sourceColumns] of sourceTables) {
    if (SKIPPED_TABLES.has(table)) continue;
    const targetColumns = targetTables.get(table);
    if (!targetColumns) droppedTables.push(table);
    else tables.push({ table, columns: targetColumns.filter((column) => sourceColumns.includes(column)) });
  }

  return {
    missingMigrations: [...sourceMigrations].filter((name) => !targetMigrations.has(name)).sort(),
    filledTargetTables,
    droppedTables,
    tables,
  };
}

async function copyTable(
  source: Prisma.TransactionClient,
  target: Prisma.TransactionClient,
  table: string,
  columns: string[],
): Promise<number> {
  const name = quoteIdent(table);
  const list = columns.map(quoteIdent).join(', ');
  let after = '(0,0)';
  let copied = 0;
  for (;;) {
    // Walk the table in physical order. TID range scans keep each batch cheap.
    const rows = await source.$queryRawUnsafe<{ ctid: string; row: string }[]>(
      `SELECT src_row.ctid::text AS ctid, row_to_json(src_row)::text AS row
       FROM ${name} src_row WHERE src_row.ctid > $1::tid ORDER BY src_row.ctid LIMIT ${BATCH_ROWS}`,
      after,
    );
    if (rows.length === 0) return copied;
    // The rows stay JSON text end to end, so BigInt and Decimal values keep every digit.
    await target.$executeRawUnsafe(
      `INSERT INTO ${name} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${name}, $1::json)`,
      `[${rows.map((row) => row.row).join(',')}]`,
    );
    copied += rows.length;
    after = rows[rows.length - 1].ctid;
  }
}

export async function copyDatabase(
  source: PrismaClient,
  target: PrismaClient,
  log: (message: string) => void = console.log,
): Promise<CopyResult> {
  // Checked before connecting to the old database, so a COPY_FROM_DATABASE_URL left set
  // after the move keeps working even once the old database is gone.
  const filled = await filledTables(target, (await tableColumns(target)).keys());
  if (filled.length > 0) return skippedBecauseFilled(filled);

  const plan = await planCopy(source, target);
  if (plan.missingMigrations.length > 0) {
    throw new Error(`The new database is missing ${plan.missingMigrations.length} migrations (${plan.missingMigrations.join(', ')}); run \`prisma migrate deploy\` against it first`);
  }
  if (plan.filledTargetTables.length > 0) return skippedBecauseFilled(plan.filledTargetTables);
  for (const table of plan.droppedTables) log(`  ⚠️  ${table} is not in the new database; its rows are not copied`);

  const options = { maxWait: 30_000, timeout: TRANSACTION_MS };
  const tables = await source.$transaction(async (sourceTx) => {
    // One snapshot of the old database, even while the old deployment keeps writing to it.
    await sourceTx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return target.$transaction(async (targetTx) => {
      // The rows come from a database that enforced the same foreign keys. Turning the
      // checks off lets tables load in any order, including the contests and result
      // snapshots that point at each other. It needs a superuser, as Railway's postgres is.
      await targetTx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const copied: { table: string; rows: number }[] = [];
      for (const { table, columns } of plan.tables) {
        // Checked again inside the transaction, in case something wrote meanwhile.
        if (await hasRows(targetTx, table)) throw new Error(`${table} in the new database got rows while the copy ran`);
        const rows = await copyTable(sourceTx, targetTx, table, columns);
        if (rows > 0) log(`  ${table}: ${rows} rows`);
        copied.push({ table, rows });
      }
      if (plan.tables.some(({ table }) => table === 'sync_logs')) {
        // A sync the old deployment was running never finishes in the new database.
        // Left as running, it would make the admin dashboard refuse new syncs for 12 hours.
        await targetTx.$executeRawUnsafe(`
          UPDATE "sync_logs"
          SET "status" = 'failed', "completed_at" = NOW(), "updated_at" = NOW(),
              "error_message" = 'Stopped when the main database moved to a new PostgreSQL service.'
          WHERE "status" IN ('started', 'running')`);
      }
      return copied;
    }, options);
  }, { ...options, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  // Fresh planner statistics, so the first queries on the new database are not slow.
  await target.$executeRawUnsafe('ANALYZE').catch((error: unknown) => {
    log(`  ⚠️  ANALYZE failed; autovacuum will gather the statistics instead (${error instanceof Error ? error.message : error})`);
  });
  return { status: 'copied', tables };
}
