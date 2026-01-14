#!/usr/bin/env tsx
/**
 * Analyze data coverage - states, candidates, and financial data
 */

import { prisma } from '../config/database.js';

async function analyzeDataCoverage() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected\n');

    // Get all candidates with their financial data status
    const candidates = await prisma.candidate.findMany({
      select: {
        id: true,
        candidateId: true,
        name: true,
        state: true,
        office: true,
        party: true,
        financials: {
          select: {
            id: true,
            cycle: true,
          }
        }
      }
    });

    // Count unique states
    const uniqueStates = new Set(candidates.map(c => c.state));
    const statesWithData = Array.from(uniqueStates).sort();

    // Separate candidates with and without financial data
    const candidatesWithFinancials = candidates.filter(c => c.financials.length > 0);
    const candidatesWithoutFinancials = candidates.filter(c => c.financials.length === 0);

    // Group by state
    const stateBreakdown = new Map<string, {
      total: number;
      withFinancials: number;
      withoutFinancials: number;
    }>();

    for (const candidate of candidates) {
      const state = candidate.state;
      if (!stateBreakdown.has(state)) {
        stateBreakdown.set(state, {
          total: 0,
          withFinancials: 0,
          withoutFinancials: 0
        });
      }

      const stats = stateBreakdown.get(state)!;
      stats.total++;

      if (candidate.financials.length > 0) {
        stats.withFinancials++;
      } else {
        stats.withoutFinancials++;
      }
    }

    // Print results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('               DATA COVERAGE ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📍 STATES WITH CANDIDATE DATA:');
    console.log(`   Total States: ${statesWithData.length}`);
    console.log(`   States: ${statesWithData.join(', ')}\n`);

    console.log('👥 CANDIDATE SUMMARY:');
    console.log(`   Total Candidates: ${candidates.length}`);
    console.log(`   ✅ With Financial Data: ${candidatesWithFinancials.length}`);
    console.log(`   ❌ Missing Financial Data: ${candidatesWithoutFinancials.length}`);

    if (candidates.length > 0) {
      const coveragePercent = ((candidatesWithFinancials.length / candidates.length) * 100).toFixed(1);
      console.log(`   Coverage: ${coveragePercent}%\n`);
    } else {
      console.log('   Coverage: 0%\n');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('           STATE-BY-STATE BREAKDOWN');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Sort states alphabetically
    const sortedStates = Array.from(stateBreakdown.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [state, stats] of sortedStates) {
      const coveragePercent = stats.total > 0
        ? ((stats.withFinancials / stats.total) * 100).toFixed(0)
        : '0';

      console.log(`${state}:`);
      console.log(`  Total: ${stats.total} | With Financials: ${stats.withFinancials} | Missing: ${stats.withoutFinancials} (${coveragePercent}% coverage)`);
    }

    console.log('\n');

    // Show candidates missing financial data if there are any
    if (candidatesWithoutFinancials.length > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('       CANDIDATES MISSING FINANCIAL DATA');
      console.log('═══════════════════════════════════════════════════════════\n');

      // Group by state for easier reading
      const missingByState = new Map<string, typeof candidatesWithoutFinancials>();

      for (const candidate of candidatesWithoutFinancials) {
        if (!missingByState.has(candidate.state)) {
          missingByState.set(candidate.state, []);
        }
        missingByState.get(candidate.state)!.push(candidate);
      }

      const sortedMissingStates = Array.from(missingByState.entries()).sort((a, b) => a[0].localeCompare(b[0]));

      for (const [state, stateCandidates] of sortedMissingStates) {
        console.log(`\n${state} (${stateCandidates.length} missing):`);
        for (const candidate of stateCandidates) {
          console.log(`  - ${candidate.name} (${candidate.office}) [${candidate.party || 'N/A'}] - ID: ${candidate.candidateId}`);
        }
      }
    }

    console.log('\n');
    await prisma.$disconnect();

  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

analyzeDataCoverage();
