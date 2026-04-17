#!/usr/bin/env tsx
/**
 * Import county-level election results from MIT Election Lab CSVs.
 *
 * Source: MIT Election Data + Science Lab (MEDSL), Harvard Dataverse.
 *   - US House: "countypres_XXXX_XXXX.csv"-style files (per race, per county)
 *   - US Senate: "senate-candidate-county-level-results.csv"
 *   Please check license / terms before redistributing. We do not bundle data.
 *
 * Expected columns (headers, case-insensitive):
 *   year, state_po, county_fips, county_name, office, district?, party, candidate, candidatevotes, totalvotes
 *
 * Usage:
 *   npm run import:county-results -- --office=HOUSE --cycle=2022 --file=./data/house-2022.csv
 *   npm run import:county-results -- --office=SENATE --cycle=2022 --file=./data/senate-2022.csv
 */

import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { prisma } from '../config/database.js';

function arg(key: string): string | undefined {
  const flag = `--${key}=`;
  return process.argv.find(a => a.startsWith(flag))?.slice(flag.length);
}

function normalizeParty(raw: string): string {
  const p = raw.trim().toUpperCase();
  if (p.startsWith('DEM')) return 'DEMOCRAT';
  if (p.startsWith('REP')) return 'REPUBLICAN';
  return 'OTHER';
}

async function main() {
  const office = arg('office')?.toUpperCase();
  const cycleStr = arg('cycle');
  const file = arg('file');

  if (!office || !cycleStr || !file || !['HOUSE', 'SENATE'].includes(office)) {
    console.error('Usage: npm run import:county-results -- --office=HOUSE|SENATE --cycle=YYYY --file=<csv>');
    process.exit(1);
  }
  const cycle = parseInt(cycleStr, 10);

  let processed = 0;
  let skipped = 0;
  const countyDistricts = new Map<string, Set<string>>();

  const parser = createReadStream(file).pipe(parse({ columns: (h: string[]) => h.map(x => x.toLowerCase().trim()), trim: true, skip_empty_lines: true }));

  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    const year = parseInt(row.year ?? row.cycle ?? '', 10);
    if (year !== cycle) { skipped++; continue; }

    const state: string = (row.state_po ?? row.state ?? '').toUpperCase();
    const fips: string = (row.county_fips ?? row.fips ?? '').toString().padStart(5, '0');
    const countyName: string = row.county_name ?? row.county ?? '';
    const rawOffice: string = (row.office ?? office ?? '').toString();
    const rowOffice: string = rawOffice.toUpperCase();
    if (rowOffice !== office && !(rowOffice === 'US HOUSE' && office === 'HOUSE') && !(rowOffice === 'US SENATE' && office === 'SENATE')) {
      skipped++; continue;
    }

    const district: string = office === 'HOUSE'
      ? (row.district?.toString().replace(/^0+/, '') || '1')
      : '';
    const party = normalizeParty(row.party ?? '');
    const candidate = (row.candidate ?? '').trim();
    const votes = parseInt(row.candidatevotes ?? row.votes ?? '0', 10);

    if (!state || !fips || fips === '00000' || !candidate || isNaN(votes)) { skipped++; continue; }

    // Ensure County row exists
    await prisma.county.upsert({
      where: { fipsCode: fips },
      update: { state, name: countyName || undefined },
      create: { fipsCode: fips, state, name: countyName || 'Unknown', districts: [] },
    });

    if (office === 'HOUSE' && district !== '') {
      const set = countyDistricts.get(fips) ?? new Set<string>();
      set.add(district);
      countyDistricts.set(fips, set);
    }

    // Compute votePct later from all candidates in this county/race; for now, store absolute votes and zero pct; we'll backfill pct in a second pass.
    await prisma.countyResult.upsert({
      where: {
        countyFips_cycle_officeType_district_candidateName: {
          countyFips: fips,
          cycle,
          officeType: office,
          district: district,
          candidateName: candidate,
        },
      },
      update: { votes, party, state },
      create: {
        countyFips: fips,
        cycle,
        state,
        officeType: office,
        district,
        party,
        candidateName: candidate,
        votes,
        votePct: 0,
      },
    });

    processed++;
    if (processed % 500 === 0) console.log(`  ... imported ${processed} rows`);
  }

  console.log(`📝 Imported ${processed} rows (skipped ${skipped}). Backfilling vote percentages...`);

  // Backfill votePct per (county, cycle, office, district)
  const groups = await prisma.countyResult.groupBy({
    by: ['countyFips', 'cycle', 'officeType', 'district'],
    where: { cycle, officeType: office },
    _sum: { votes: true },
  });

  for (const g of groups) {
    const total = g._sum.votes ?? 0;
    if (total === 0) continue;
    const rows = await prisma.countyResult.findMany({
      where: {
        countyFips: g.countyFips,
        cycle: g.cycle,
        officeType: g.officeType,
        district: g.district,
      },
    });
    await Promise.all(rows.map(r =>
      prisma.countyResult.update({
        where: { id: r.id },
        data: { votePct: (r.votes / total) * 100 },
      }),
    ));
  }

  // Update districts[] array on each county for House imports
  for (const [fips, set] of countyDistricts) {
    const county = await prisma.county.findUnique({ where: { fipsCode: fips } });
    if (!county) continue;
    const merged = Array.from(new Set([...county.districts, ...Array.from(set)])).sort();
    await prisma.county.update({ where: { fipsCode: fips }, data: { districts: merged } });
  }

  console.log('✅ Import complete');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Import failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
