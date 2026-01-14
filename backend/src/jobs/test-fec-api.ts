#!/usr/bin/env tsx
/**
 * Test Script: FEC API Connection
 *
 * Quick test to verify FEC API connectivity and credentials
 *
 * Usage:
 *   tsx src/jobs/test-fec-api.ts
 */

import { fecApiService } from '../services/fec-api.service.js';
import { env } from '../config/env.js';

async function testFecApi() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing FEC API Connection');
  console.log('='.repeat(60));
  console.log(`🔑 API Key: ${env.FEC_API_KEY.substring(0, 10)}...`);
  console.log(`🌐 Base URL: ${env.FEC_API_BASE_URL}`);
  console.log('='.repeat(60) + '\n');

  try {
    // Test 1: Get Arizona Senate candidates for 2026
    console.log('📥 Test 1: Fetching Arizona Senate candidates for 2026...\n');

    const candidates = await fecApiService.getCandidates({
      state: 'AZ',
      office: 'S',
      cycle: 2026,
      page: 1,
      perPage: 10,
    });

    console.log(`✅ Success! Found ${candidates.length} candidates:\n`);

    candidates.forEach((candidate, index) => {
      console.log(`${index + 1}. ${candidate.name}`);
      console.log(`   Party: ${candidate.party_full || candidate.party || 'Unknown'}`);
      console.log(`   Office: ${candidate.office_full || candidate.office || 'Unknown'}`);
      console.log(`   Candidate ID: ${candidate.candidate_id}`);
      console.log(`   Status: ${candidate.candidate_status || 'Unknown'}`);
      console.log('');
    });

    // Test 2: Get details for the first candidate
    if (candidates.length > 0) {
      const firstCandidate = candidates[0];
      console.log(`\n📥 Test 2: Fetching committees for ${firstCandidate.name}...\n`);

      const committees = await fecApiService.getCommittees(firstCandidate.candidate_id);

      console.log(`✅ Success! Found ${committees.length} committees:\n`);

      committees.forEach((committee, index) => {
        console.log(`${index + 1}. ${committee.name}`);
        console.log(`   Committee ID: ${committee.committee_id}`);
        console.log(`   Type: ${committee.committee_type_full || committee.committee_type || 'Unknown'}`);
        console.log('');
      });

      // Test 3: Get financial summary for the first committee
      if (committees.length > 0) {
        const firstCommittee = committees[0];
        console.log(`\n📥 Test 3: Fetching financial summary for ${firstCommittee.name}...\n`);

        const financials = await fecApiService.getFinancialSummary(firstCommittee.committee_id, 2024);

        console.log(`✅ Success! Found ${financials.length} financial records:\n`);

        if (financials.length > 0) {
          const latest = financials[0];
          console.log(`Cycle: ${latest.cycle}`);
          console.log(`Total Receipts: $${latest.total_receipts?.toLocaleString() || '0'}`);
          console.log(`Total Disbursements: $${latest.total_disbursements?.toLocaleString() || '0'}`);
          console.log(`Cash on Hand: $${latest.cash_on_hand_end_period?.toLocaleString() || '0'}`);
          console.log(`Debt Owed: $${latest.debts_owed_by_committee?.toLocaleString() || '0'}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All FEC API Tests Passed!');
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ FEC API Test Failed:', error.message);

    if (error.response) {
      console.error('\n📊 Error Details:');
      console.error(`Status: ${error.response.status}`);
      console.error(`Status Text: ${error.response.statusText}`);
      console.error(`URL: ${error.response.config?.url}`);

      if (error.response.status === 403) {
        console.error('\n💡 Tip: Check that your FEC_API_KEY is valid');
        console.error('   Get a free API key at: https://api.data.gov/signup/');
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');
    process.exit(1);
  }
}

// Run the test
testFecApi();
