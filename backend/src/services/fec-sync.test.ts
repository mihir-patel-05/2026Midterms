import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bulkTotalsData } from './finance.service.js';
import type { FECCandidateTotalsSummary } from './fec-api.service.js';

const syncedAt = new Date('2026-10-05T12:00:00.000Z');
const row: FECCandidateTotalsSummary = {
  candidate_id: 'S6GA00119',
  name: 'OSSOFF, T. JONATHAN',
  party: 'DEM',
  office: 'S',
  state: 'GA',
  district: '00',
  cycle: 2026,
  candidate_election_year: 2026,
  receipts: 97986263.04,
  disbursements: 60123456.78,
  cash_on_hand_end_period: '42587451.00',
  debts_owed_by_committee: '0.00',
  individual_itemized_contributions: 51000000,
  other_political_committee_contributions: 1200000,
  transfers_from_other_authorized_committee: 300000,
  coverage_start_date: '2025-01-01T00:00:00',
  coverage_end_date: '2026-09-30T00:00:00',
};

test('bulk totals map headline figures, keeping decimal strings intact', () => {
  const data = bulkTotalsData(row, syncedAt);
  assert.equal(data.receipts, 97986263.04);
  assert.equal(data.disbursements, 60123456.78);
  assert.equal(data.cashOnHand, '42587451.00');
  assert.equal(data.debtsOwed, '0.00');
  assert.equal(data.pacContributions, 1200000);
  assert.equal(data.transfersFromAffiliatedCommittee, 300000);
  assert.deepEqual(data.coverageEndDate, new Date('2026-09-30T00:00:00'));
  assert.equal(data.lastUpdated, syncedAt);
});

test('bulk totals never write the per-candidate source breakdown', () => {
  const data = bulkTotalsData(row, syncedAt) as Record<string, unknown>;
  for (const field of ['individualContributions', 'partyContributions', 'candidateContribution', 'contributions', 'detailedSyncedAt']) {
    assert.equal(field in data, false, `${field} must be left to the detailed sync`);
  }
});

test('candidates with no filings get zero totals and no coverage dates', () => {
  const data = bulkTotalsData({ candidate_id: 'H6CA12345', name: 'NEW, FILER', cycle: 2026 }, syncedAt);
  assert.equal(data.receipts, 0);
  assert.equal(data.cashOnHand, 0);
  assert.equal(data.coverageStartDate, null);
  assert.equal(data.coverageEndDate, null);
});

test('House districts are validated against apportionment', async () => {
  const { houseDistrict } = await import('./election.service.js');
  assert.equal(houseDistrict('CA', '12'), '12');
  assert.equal(houseDistrict('CA', '7'), '07');
  assert.equal(houseDistrict('GA', '23'), null); // GA has 14 seats
  assert.equal(houseDistrict('NM', '66'), null);
  assert.equal(houseDistrict('MD', null), null);
  assert.equal(houseDistrict('MD', ''), null);
  assert.equal(houseDistrict('WY', '01'), '00'); // at-large
  assert.equal(houseDistrict('GU', null), '00'); // delegate seat
  assert.equal(houseDistrict('MP', '01'), '00');
  assert.equal(houseDistrict('XX', '01'), null);
});

test('a single committee passes its totals through unchanged', async () => {
  const { combineCommitteeTotals, detailedTotalsData } = await import('./finance.service.js');
  const principal = {
    committee_id: 'C00718866', committee_designation: 'P', cycle: 2026,
    receipts: 77279766.48, individual_contributions: 67764725.1, candidate_contribution: 0,
    last_cash_on_hand_end_period: 42587451, coverage_start_date: '2025-01-01T00:00:00',
    coverage_end_date: '2026-06-30T00:00:00', last_report_type_full: 'JULY QUARTERLY',
  };
  const data = detailedTotalsData(combineCommitteeTotals([principal]), syncedAt);
  assert.equal(data.receipts, 77279766.48);
  assert.equal(data.individualContributions, 67764725.1);
  assert.equal(data.cashOnHand, 42587451);
  assert.equal(data.electionFull, false);
  assert.equal(data.detailedSyncedAt, syncedAt);
});

test("a candidate's committees are summed, with last-report details from the latest filer", async () => {
  const { combineCommitteeTotals } = await import('./finance.service.js');
  const combined = combineCommitteeTotals([
    {
      committee_id: 'C1', committee_designation: 'P', cycle: 2026, last_report_year: 2026,
      receipts: 1000, last_cash_on_hand_end_period: 400, coverage_start_date: '2025-01-01T00:00:00',
      coverage_end_date: '2026-06-30T00:00:00', last_report_type_full: 'JULY QUARTERLY',
    },
    {
      committee_id: 'C2', committee_designation: 'A', cycle: 2026, last_report_year: 2026,
      receipts: 250.5, last_cash_on_hand_end_period: 100, coverage_start_date: '2025-04-01T00:00:00',
      coverage_end_date: '2026-09-30T00:00:00', last_report_type_full: 'OCTOBER QUARTERLY',
    },
  ]);
  assert.equal(combined.receipts, 1250.5);
  assert.equal(combined.last_cash_on_hand_end_period, 500);
  assert.equal(combined.cycle, 2026);
  assert.equal(combined.last_report_year, 2026);
  assert.equal(combined.coverage_start_date, '2025-01-01T00:00:00');
  assert.equal(combined.coverage_end_date, '2026-09-30T00:00:00');
  assert.equal(combined.last_report_type_full, 'OCTOBER QUARTERLY');
});
