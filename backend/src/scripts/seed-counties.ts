#!/usr/bin/env tsx
/**
 * Seed County table from a FIPS gazetteer CSV.
 *
 * Expected CSV columns (case-insensitive header): fips, state, name
 *   - fips: 5-digit county FIPS (e.g. "06037" for Los Angeles, CA)
 *   - state: 2-letter postal code
 *   - name: county name without "County" suffix
 *
 * Usage:
 *   npm run seed:counties -- --file=./data/counties.csv
 *
 * Districts array is left empty here; the importer fills it as county/district
 * pairs are observed in MIT Election Lab data.
 */

import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { prisma } from '../config/database.js';

function arg(key: string): string | undefined {
  const flag = `--${key}=`;
  return process.argv.find(a => a.startsWith(flag))?.slice(flag.length);
}

async function main() {
  const file = arg('file');
  if (!file) {
    console.error('Usage: npm run seed:counties -- --file=<path-to-csv>');
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;

  const parser = createReadStream(file).pipe(parse({ columns: true, trim: true, skip_empty_lines: true }));

  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    const fips = (row.fips ?? row.FIPS ?? row.county_fips ?? '').padStart(5, '0');
    const state = (row.state ?? row.STATE ?? '').toUpperCase();
    const name = row.name ?? row.NAME ?? row.county ?? '';
    if (!fips || fips.length !== 5 || !state || !name) continue;

    const existing = await prisma.county.findUnique({ where: { fipsCode: fips } });
    await prisma.county.upsert({
      where: { fipsCode: fips },
      update: { state, name },
      create: { fipsCode: fips, state, name, districts: [] },
    });
    if (existing) updated++; else inserted++;
  }

  console.log(`✅ Seed complete. Inserted: ${inserted}, Updated: ${updated}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Seed failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
