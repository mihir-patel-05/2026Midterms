#!/usr/bin/env tsx
/**
 * Copy the old main database (COPY_FROM_DATABASE_URL) into the new one
 * (DATABASE_URL), once. See src/services/database-copy.ts.
 *
 * The new database must already have its tables (`prisma migrate deploy`) and no
 * rows. On Railway, `npm run prisma:deploy` runs this right after the migrations
 * whenever COPY_FROM_DATABASE_URL is set, so it happens before the new deployment
 * starts writing. Once the new database has rows, it skips.
 *
 * Usage:
 *   npm run db:copy -- --dry-run          # check both databases and count rows; copy nothing
 *   npm run db:copy
 *   node dist/scripts/copy-database.js    # inside the Railway container
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { copyDatabase, planCopy } from '../services/database-copy.js';

async function dryRun(source: PrismaClient): Promise<void> {
  const plan = await planCopy(source, prisma);
  console.log('🗄️  Database copy dry run (nothing is written)');
  let total = 0;
  for (const { table } of plan.tables) {
    const [{ rows }] = await source.$queryRawUnsafe<{ rows: number }[]>(`SELECT count(*)::int AS rows FROM "${table.replaceAll('"', '""')}"`);
    if (rows > 0) console.log(`  ${table}: ${rows} rows`);
    total += rows;
  }
  console.log(`  ${total} rows in ${plan.tables.length} tables in the old database`);
  for (const table of plan.droppedTables) console.log(`  ⚠️  ${table} is not in the new database; its rows would not be copied`);
  if (plan.missingMigrations.length > 0) console.log(`  ⚠️  Would fail: the new database is missing migrations ${plan.missingMigrations.join(', ')}`);
  else if (plan.filledTargetTables.length > 0) console.log(`  ℹ️  Would skip: the new database already has rows (in ${plan.filledTargetTables.join(', ')})`);
  else console.log('  ✅ Would copy: the new database is empty and has every migration');
}

async function main(): Promise<void> {
  if (!env.COPY_FROM_DATABASE_URL) {
    console.log('🗄️  COPY_FROM_DATABASE_URL is not set; nothing to copy.');
    process.exit(0);
  }
  if (env.COPY_FROM_DATABASE_URL === env.DATABASE_URL) {
    console.log('🗄️  COPY_FROM_DATABASE_URL is the same as DATABASE_URL; nothing to copy.');
    process.exit(0);
  }

  const source = new PrismaClient({ datasources: { db: { url: env.COPY_FROM_DATABASE_URL } } });
  try {
    if (process.argv.includes('--dry-run')) {
      await dryRun(source);
    } else {
      console.log('🗄️  COPY_FROM_DATABASE_URL is set: copying the old database into the new one, if the new one is still empty');
      const started = Date.now();
      const result = await copyDatabase(source, prisma);
      if (result.status === 'skipped') {
        console.log(`🗄️  Copy skipped: ${result.reason}.`);
      } else {
        const rows = result.tables.reduce((sum, table) => sum + table.rows, 0);
        console.log(`✅ Copied ${rows} rows in ${result.tables.length} tables in ${Math.round((Date.now() - started) / 1000)}s. The old database was not changed.`);
      }
    }
    await Promise.allSettled([source.$disconnect(), prisma.$disconnect()]);
    process.exit(0);
  } catch (error) {
    console.error('❌ Database copy failed; the new database was left as it was:', error instanceof Error ? error.message : error);
    await Promise.allSettled([source.$disconnect(), prisma.$disconnect()]);
    process.exit(1);
  }
}

main();
