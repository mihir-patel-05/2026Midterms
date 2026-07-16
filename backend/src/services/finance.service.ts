import { prisma } from '../config/database.js';
import { FinancialSummary, Receipt, Disbursement, CandidateFinancial } from '@prisma/client';
import {
  fecApiService,
  FECFinancialSummary,
  FECReceipt,
  FECDisbursement,
  FECCandidateTotals,
} from './fec-api.service.js';
import { getPaginationParams, createPaginationResult, PaginationResult } from '../utils/pagination.js';
import { createHash } from 'crypto';
import { env } from '../config/env.js';

function stableSourceId(kind: 'receipt' | 'disbursement', sourceId: string | number | undefined, fields: unknown[]): string {
  if (sourceId !== undefined && sourceId !== null && String(sourceId).trim()) {
    return `fec:${String(sourceId)}`;
  }
  return `fallback:${kind}:${createHash('sha256').update(JSON.stringify(fields)).digest('hex')}`;
}

function inferCycle(explicitCycle: number | undefined, transactionDate: string | undefined): number | null {
  if (explicitCycle) return explicitCycle;
  if (!transactionDate) return null;

  const year = new Date(transactionDate).getUTCFullYear();
  return Number.isFinite(year) ? year + (year % 2) : null;
}

/**
 * Service for managing campaign finance data
 */
export class FinanceService {
  /**
   * Incrementally refresh a bounded set of committees each run. This keeps the
   * itemized pipeline inside FEC rate limits while eventually backfilling every
   * active committee instead of leaving receipts/disbursements manual-only.
   */
  async syncItemizedBatch(cycle: number = 2026): Promise<{
    committeesProcessed: number;
    receiptsSynced: number;
    disbursementsSynced: number;
    errors: number;
  }> {
    const staleBefore = new Date(
      Date.now() - env.ITEMIZED_REFRESH_HOURS * 60 * 60 * 1000,
    );
    const committees = await prisma.committee.findMany({
      where: {
        candidateId: { not: null },
        candidate: { is: { cycles: { has: cycle } } },
        OR: [
          { itemizedLastSyncedAt: null },
          { itemizedLastSyncedAt: { lt: staleBefore } },
        ],
      },
      orderBy: { itemizedLastSyncedAt: { sort: 'asc', nulls: 'first' } },
      take: env.ITEMIZED_COMMITTEES_PER_RUN,
    });

    const stats = {
      committeesProcessed: 0,
      receiptsSynced: 0,
      disbursementsSynced: 0,
      errors: 0,
    };
    const minDate = `${cycle - 1}-01-01`;
    const maxDate = `${cycle}-12-31`;

    for (const committee of committees) {
      try {
        const [receipts, disbursements] = await Promise.all([
          this.syncReceipts({
            committeeId: committee.committeeId,
            twoYearTransactionPeriod: cycle,
            minDate,
            maxDate,
            maxPages: env.ITEMIZED_MAX_PAGES,
          }),
          this.syncDisbursements({
            committeeId: committee.committeeId,
            twoYearTransactionPeriod: cycle,
            minDate,
            maxDate,
            maxPages: env.ITEMIZED_MAX_PAGES,
          }),
        ]);

        const errors = receipts.errors + disbursements.errors;
        stats.committeesProcessed++;
        stats.receiptsSynced += receipts.synced;
        stats.disbursementsSynced += disbursements.synced;
        stats.errors += errors;

        await prisma.committee.update({
          where: { id: committee.id },
          data: {
            itemizedLastSyncedAt: new Date(),
            itemizedSyncError: errors > 0 ? `${errors} row(s) failed to import` : null,
          },
        });
      } catch (error) {
        stats.errors++;
        await prisma.committee.update({
          where: { id: committee.id },
          data: {
            itemizedLastSyncedAt: new Date(),
            itemizedSyncError: error instanceof Error ? error.message : 'Unknown sync error',
          },
        });
      }
    }

    return stats;
  }

  /**
   * Get candidate-level financial data
   */
  async getCandidateFinancials(candidateId: string, cycle?: number): Promise<CandidateFinancial | null> {
    const where: any = { candidateId };
    if (cycle) {
      where.cycle = cycle;
    }

    return prisma.candidateFinancial.findFirst({
      where,
      orderBy: { cycle: 'desc' },
    });
  }

  /**
   * Sync financial data directly for a candidate from FEC API
   * Uses the /candidate/{candidate_id}/totals/ endpoint
   */
  async syncCandidateFinancials(
    fecCandidateId: string,
    cycle?: number
  ): Promise<{ synced: number; errors: number }> {
    // OPTIMIZED: Reduced logging for faster sync
    try {
      const fecTotals = await fecApiService.getCandidateTotals(fecCandidateId, cycle);

      let synced = 0;
      let errors = 0;

      for (const fecTotal of fecTotals) {
        try {
          const financialData = {
            candidateElectionYear: fecTotal.candidate_election_year,

            // Receipt totals
            receipts: fecTotal.receipts || 0,
            contributions: fecTotal.contributions || 0,
            individualContributions: fecTotal.individual_contributions || 0,
            individualItemizedContributions: fecTotal.individual_itemized_contributions || 0,
            individualUnitemizedContributions: fecTotal.individual_unitemized_contributions || 0,
            pacContributions: fecTotal.other_political_committee_contributions || 0,
            partyContributions: fecTotal.political_party_committee_contributions || 0,
            candidateContribution: fecTotal.candidate_contribution || 0,
            otherReceipts: fecTotal.other_receipts || 0,
            transfersFromAffiliatedCommittee: fecTotal.transfers_from_affiliated_committee || 0,
            loansReceived: fecTotal.loans_received || 0,
            loansReceivedFromCandidate: fecTotal.loans_received_from_candidate || 0,
            otherLoansReceived: fecTotal.other_loans_received || 0,
            federalFunds: fecTotal.federal_funds || 0,

            // Disbursement totals
            disbursements: fecTotal.disbursements || 0,
            operatingExpenditures: fecTotal.operating_expenditures || 0,
            transfersToOtherAuthorizedCommittee: fecTotal.transfers_to_other_authorized_committee || 0,
            fundraisingDisbursements: fecTotal.fundraising_disbursements || 0,
            exemptLegalAccountingDisbursement: fecTotal.exempt_legal_accounting_disbursement || 0,
            loanRepaymentsMade: fecTotal.loan_repayments_made || 0,
            repaymentsLoansMadeByCandidate: fecTotal.repayments_loans_made_by_candidate || 0,
            repaymentsOtherLoans: fecTotal.repayments_other_loans || 0,
            otherDisbursements: fecTotal.other_disbursements || 0,

            // Refunds
            contributionRefunds: fecTotal.contribution_refunds || 0,
            refundedIndividualContributions: fecTotal.refunded_individual_contributions || 0,
            refundedOtherPoliticalCommitteeContributions: fecTotal.refunded_other_political_committee_contributions || 0,
            refundedPoliticalPartyCommitteeContributions: fecTotal.refunded_political_party_committee_contributions || 0,

            // Offsets
            offsetsToOperatingExpenditures: fecTotal.offsets_to_operating_expenditures || 0,
            totalOffsetsToOperatingExpenditures: fecTotal.total_offsets_to_operating_expenditures || 0,
            offsetsToFundraisingExpenditures: fecTotal.offsets_to_fundraising_expenditures || 0,
            offsetsToLegalAccounting: fecTotal.offsets_to_legal_accounting || 0,

            // Net calculations
            netContributions: fecTotal.net_contributions || 0,
            netOperatingExpenditures: fecTotal.net_operating_expenditures || 0,

            // End of period data (use last_* fields if available, otherwise fall back to legacy fields)
            cashOnHand: fecTotal.last_cash_on_hand_end_period || fecTotal.cash_on_hand_end_period || 0,
            debtsOwed: fecTotal.last_debts_owed_by_committee || fecTotal.debts_owed_by_committee || 0,
            debtsOwedToCommittee: fecTotal.last_debts_owed_to_committee || 0,

            // Coverage dates and metadata
            coverageStartDate: fecTotal.coverage_start_date ? new Date(fecTotal.coverage_start_date) : null,
            coverageEndDate: fecTotal.coverage_end_date ? new Date(fecTotal.coverage_end_date) : null,
            transactionCoverageDate: fecTotal.transaction_coverage_date ? new Date(fecTotal.transaction_coverage_date) : null,
            lastReportYear: fecTotal.last_report_year,
            lastReportTypeFull: fecTotal.last_report_type_full,
            lastBeginningImageNumber: fecTotal.last_beginning_image_number,
            electionFull: fecTotal.election_full,
            lastUpdated: new Date(),
          };

          await prisma.candidateFinancial.upsert({
            where: {
              candidateId_cycle: {
                candidateId: fecCandidateId,
                cycle: fecTotal.cycle,
              },
            },
            update: financialData,
            create: {
              candidateId: fecCandidateId,
              cycle: fecTotal.cycle,
              ...financialData,
            },
          });
          synced++;
        } catch (error) {
          // OPTIMIZED: Only log errors if they occur
          if (errors === 0) {
            console.error(`❌ Error syncing financials for ${fecCandidateId}`);
          }
          errors++;
        }
      }

      // OPTIMIZED: Removed success logging for faster sync

      return { synced, errors };
    } catch (error) {
      console.error('❌ Error syncing candidate financials:', error);
      throw error;
    }
  }

  /**
   * Get financial summary for a committee
   */
  async getFinancialSummary(committeeId: string, cycle?: number): Promise<FinancialSummary | null> {
    const where: any = { committeeId };
    if (cycle) {
      where.cycle = cycle;
    }

    return prisma.financialSummary.findFirst({
      where,
      orderBy: { cycle: 'desc' },
    });
  }

  /**
   * Get all financial summaries for a committee
   */
  async getFinancialSummaries(committeeId: string): Promise<FinancialSummary[]> {
    return prisma.financialSummary.findMany({
      where: { committeeId },
      orderBy: { cycle: 'desc' },
    });
  }

  /**
   * Get receipts for a committee with pagination
   */
  async getReceipts(params: {
    committeeIds: string[];
    cycle?: number;
    page?: number;
    perPage?: number;
  }): Promise<PaginationResult<Receipt>> {
    const { committeeIds, cycle, page = 1, perPage = 50 } = params;
    const { skip, take } = getPaginationParams(page, perPage);
    const dateFilter = cycle
      ? {
          gte: new Date(`${cycle - 1}-01-01T00:00:00Z`),
          lte: new Date(`${cycle}-12-31T23:59:59Z`),
        }
      : undefined;
    const where = {
      committeeId: { in: committeeIds },
      ...(dateFilter ? { contributionReceiptDate: dateFilter } : {}),
    };

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where,
        skip,
        take,
        orderBy: { contributionReceiptDate: 'desc' },
      }),
      prisma.receipt.count({ where }),
    ]);

    return createPaginationResult(receipts, total, page, perPage);
  }

  /**
   * Get disbursements for a committee with pagination
   */
  async getDisbursements(params: {
    committeeIds: string[];
    cycle?: number;
    page?: number;
    perPage?: number;
  }): Promise<PaginationResult<Disbursement>> {
    const { committeeIds, cycle, page = 1, perPage = 50 } = params;
    const { skip, take } = getPaginationParams(page, perPage);
    const dateFilter = cycle
      ? {
          gte: new Date(`${cycle - 1}-01-01T00:00:00Z`),
          lte: new Date(`${cycle}-12-31T23:59:59Z`),
        }
      : undefined;
    const where = {
      committeeId: { in: committeeIds },
      ...(dateFilter ? { disbursementDate: dateFilter } : {}),
    };

    const [disbursements, total] = await Promise.all([
      prisma.disbursement.findMany({
        where,
        skip,
        take,
        orderBy: { disbursementDate: 'desc' },
      }),
      prisma.disbursement.count({ where }),
    ]);

    return createPaginationResult(disbursements, total, page, perPage);
  }

  /**
   * Sync financial summary for a committee
   */
  async syncFinancialSummary(
    committeeId: string,
    cycle?: number
  ): Promise<{ synced: number; errors: number }> {
    console.log(`🔄 Syncing financial summary for committee ${committeeId}, cycle ${cycle || 'all'}`);

    try {
      const fecSummaries = await fecApiService.getFinancialSummary(committeeId, cycle);
      console.log(`📥 Found ${fecSummaries.length} financial summaries`);

      let synced = 0;
      let errors = 0;

      for (const fecSummary of fecSummaries) {
        try {
          await this.upsertFinancialSummary(fecSummary);
          synced++;
        } catch (error) {
          console.error(
            `❌ Error upserting financial summary for ${committeeId}, cycle ${fecSummary.cycle}:`,
            error
          );
          errors++;
        }
      }

      console.log(`✅ Synced ${synced} financial summaries, ${errors} errors`);

      return { synced, errors };
    } catch (error) {
      console.error('❌ Error syncing financial summary:', error);
      throw error;
    }
  }

  /**
   * Upsert financial summary
   */
  private async upsertFinancialSummary(
    fecSummary: FECFinancialSummary
  ): Promise<FinancialSummary> {
    return prisma.financialSummary.upsert({
      where: {
        committeeId_cycle: {
          committeeId: fecSummary.committee_id,
          cycle: fecSummary.cycle,
        },
      },
      update: {
        totalReceipts: fecSummary.total_receipts || 0,
        totalDisbursements: fecSummary.total_disbursements || 0,
        cashOnHand: fecSummary.cash_on_hand_end_period || 0,
        debtOwed: fecSummary.debts_owed_by_committee || 0,
        coverageEndDate: fecSummary.coverage_end_date
          ? new Date(fecSummary.coverage_end_date)
          : null,
        lastUpdated: new Date(),
      },
      create: {
        committeeId: fecSummary.committee_id,
        cycle: fecSummary.cycle,
        totalReceipts: fecSummary.total_receipts || 0,
        totalDisbursements: fecSummary.total_disbursements || 0,
        cashOnHand: fecSummary.cash_on_hand_end_period || 0,
        debtOwed: fecSummary.debts_owed_by_committee || 0,
        coverageEndDate: fecSummary.coverage_end_date
          ? new Date(fecSummary.coverage_end_date)
          : null,
      },
    });
  }

  /**
   * Sync receipts for a committee
   */
  async syncReceipts(params: {
    committeeId: string;
    twoYearTransactionPeriod?: number;
    minDate?: string;
    maxDate?: string;
    maxPages?: number;
  }): Promise<{ synced: number; errors: number }> {
    const { committeeId, twoYearTransactionPeriod, minDate, maxDate, maxPages = 5 } = params;

    console.log(`🔄 Syncing receipts for committee ${committeeId}`);

    try {
      const fecReceipts = await fecApiService.getAllReceipts({
        committeeId,
        twoYearTransactionPeriod,
        minDate,
        maxDate,
        maxPages,
      });

      console.log(`📥 Found ${fecReceipts.length} receipts`);

      // Never remove legacy data until the replacement fetch has succeeded.
      // When a cycle window is supplied, only replace legacy rows in that
      // window so a 2026 refresh cannot erase older-cycle history.
      await prisma.receipt.deleteMany({
        where: {
          committeeId,
          sourceId: null,
          ...(minDate || maxDate
            ? {
                contributionReceiptDate: {
                  ...(minDate ? { gte: new Date(`${minDate}T00:00:00Z`) } : {}),
                  ...(maxDate ? { lte: new Date(`${maxDate}T23:59:59Z`) } : {}),
                },
              }
            : {}),
        },
      });

      let synced = 0;
      let errors = 0;

      // Process in batches to avoid overwhelming the database
      const batchSize = 100;
      for (let i = 0; i < fecReceipts.length; i += batchSize) {
        const batch = fecReceipts.slice(i, i + batchSize);

        try {
          const data = batch.map((receipt) => ({
              sourceId: stableSourceId('receipt', receipt.sub_id, [
                receipt.committee.committee_id,
                receipt.contributor_name,
                receipt.contribution_receipt_amount,
                receipt.contribution_receipt_date,
                receipt.image_number,
              ]),
              transactionId: receipt.transaction_id,
              fileNumber: receipt.file_number,
              amendmentIndicator: receipt.amendment_indicator,
              cycle: receipt.two_year_transaction_period ?? inferCycle(
                twoYearTransactionPeriod,
                receipt.contribution_receipt_date,
              ),
              memoedSubtotal: receipt.memoed_subtotal ?? false,
              committeeId: receipt.committee.committee_id,
              contributorCommitteeId: receipt.contributor_committee_id,
              contributorName: receipt.contributor_name,
              contributorState: receipt.contributor_state,
              contributorCity: receipt.contributor_city,
              contributorEmployer: receipt.contributor_employer,
              contributorOccupation: receipt.contributor_occupation,
              contributionReceiptAmount: receipt.contribution_receipt_amount || 0,
              contributionReceiptDate: receipt.contribution_receipt_date
                ? new Date(receipt.contribution_receipt_date)
                : null,
              receiptType: receipt.receipt_type,
              imageNumber: receipt.image_number,
            }));

          // Replace fetched source rows atomically so records imported before
          // this migration receive cycle/memo metadata on their next refresh.
          const result = await prisma.$transaction(async (tx) => {
            await tx.receipt.deleteMany({
              where: { sourceId: { in: data.map((receipt) => receipt.sourceId) } },
            });
            return tx.receipt.createMany({ data, skipDuplicates: true });
          });

          synced += result.count;
          console.log(`📊 Progress: ${synced}/${fecReceipts.length} receipts synced`);
        } catch (error) {
          console.error(`❌ Error inserting receipt batch:`, error);
          errors += batch.length;
        }
      }

      console.log(`✅ Synced ${synced} receipts, ${errors} errors`);

      return { synced, errors };
    } catch (error) {
      console.error('❌ Error syncing receipts:', error);
      throw error;
    }
  }

  /**
   * Sync disbursements for a committee
   */
  async syncDisbursements(params: {
    committeeId: string;
    twoYearTransactionPeriod?: number;
    minDate?: string;
    maxDate?: string;
    maxPages?: number;
  }): Promise<{ synced: number; errors: number }> {
    const { committeeId, twoYearTransactionPeriod, minDate, maxDate, maxPages = 5 } = params;

    console.log(`🔄 Syncing disbursements for committee ${committeeId}`);

    try {
      const fecDisbursements = await fecApiService.getAllDisbursements({
        committeeId,
        twoYearTransactionPeriod,
        minDate,
        maxDate,
        maxPages,
      });

      console.log(`📥 Found ${fecDisbursements.length} disbursements`);

      await prisma.disbursement.deleteMany({
        where: {
          committeeId,
          sourceId: null,
          ...(minDate || maxDate
            ? {
                disbursementDate: {
                  ...(minDate ? { gte: new Date(`${minDate}T00:00:00Z`) } : {}),
                  ...(maxDate ? { lte: new Date(`${maxDate}T23:59:59Z`) } : {}),
                },
              }
            : {}),
        },
      });

      let synced = 0;
      let errors = 0;

      // Process in batches to avoid overwhelming the database
      const batchSize = 100;
      for (let i = 0; i < fecDisbursements.length; i += batchSize) {
        const batch = fecDisbursements.slice(i, i + batchSize);

        try {
          const data = batch.map((disbursement) => ({
              sourceId: stableSourceId('disbursement', disbursement.sub_id, [
                disbursement.committee.committee_id,
                disbursement.recipient_name,
                disbursement.disbursement_amount,
                disbursement.disbursement_date,
                disbursement.image_number,
              ]),
              transactionId: disbursement.transaction_id,
              fileNumber: disbursement.file_number,
              amendmentIndicator: disbursement.amendment_indicator,
              cycle: disbursement.two_year_transaction_period ?? inferCycle(
                twoYearTransactionPeriod,
                disbursement.disbursement_date,
              ),
              memoedSubtotal: disbursement.memoed_subtotal ?? false,
              committeeId: disbursement.committee.committee_id,
              recipientName: disbursement.recipient_name,
              disbursementType: disbursement.disbursement_type,
              disbursementAmount: disbursement.disbursement_amount || 0,
              disbursementDate: disbursement.disbursement_date
                ? new Date(disbursement.disbursement_date)
                : null,
              disbursementDescription: disbursement.disbursement_description,
              imageNumber: disbursement.image_number,
            }));

          const result = await prisma.$transaction(async (tx) => {
            await tx.disbursement.deleteMany({
              where: { sourceId: { in: data.map((disbursement) => disbursement.sourceId) } },
            });
            return tx.disbursement.createMany({ data, skipDuplicates: true });
          });

          synced += result.count;
          console.log(`📊 Progress: ${synced}/${fecDisbursements.length} disbursements synced`);
        } catch (error) {
          console.error(`❌ Error inserting disbursement batch:`, error);
          errors += batch.length;
        }
      }

      console.log(`✅ Synced ${synced} disbursements, ${errors} errors`);

      return { synced, errors };
    } catch (error) {
      console.error('❌ Error syncing disbursements:', error);
      throw error;
    }
  }

  /**
   * Get detailed financial data for a candidate (FAST - database only)
   * Returns cached data immediately without blocking on FEC API calls.
   * Data is kept fresh by the scheduled sync job.
   */
  async getOrFetchDetailedFinances(candidateId: string, cycle: number = 2026): Promise<{
    summary: {
      totalReceipts: number;
      totalDisbursements: number;
      cashOnHand: number;
      debtOwed: number;
      individualContributions: number;
      pacContributions: number;
      partyContributions: number;
      selfFunded: number;
      lastUpdated: Date | null;
    };
    fundingSources: { type: string; amount: number; percentage: number }[];
    topDonors: { name: string; employer: string | null; occupation: string | null; amount: number; state: string | null }[];
    spendingCategories: { category: string; amount: number; percentage: number }[];
    lastSynced: string;
  }> {
    // Single optimized query to get all data at once
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        financials: {
          where: { cycle },
          take: 1,
        },
        committees: true,
      },
    });

    if (!candidate) {
      throw new Error('Candidate not found');
    }

    const candidateFinancial = candidate.financials?.[0] || null;

    // Build funding sources from candidate-level data
    let fundingSources: { type: string; amount: number; percentage: number }[] = [];

    if (candidateFinancial) {
      const individual = candidateFinancial.individualContributions?.toNumber() || 0;
      const pac = candidateFinancial.pacContributions?.toNumber() || 0;
      const party = candidateFinancial.partyContributions?.toNumber() || 0;
      const self = candidateFinancial.candidateContribution?.toNumber() || 0;
      const total = individual + pac + party + self;

      if (total > 0) {
        const sources = [
          { type: 'Individual', amount: individual },
          { type: 'PAC', amount: pac },
          { type: 'Party', amount: party },
          { type: 'Self-funded', amount: self },
        ].filter(s => s.amount > 0);

        fundingSources = sources.map(s => ({
          type: s.type,
          amount: s.amount,
          percentage: Math.round((s.amount / total) * 100),
        })).sort((a, b) => b.amount - a.amount);
      }
    }

    // Aggregate itemized data across every authorized committee for this cycle.
    let topDonors: { name: string; employer: string | null; occupation: string | null; amount: number; state: string | null }[] = [];
    let spendingCategories: { category: string; amount: number; percentage: number }[] = [];

    const committeeIds = candidate.committees.map((committee) => committee.committeeId);
    
    if (committeeIds.length > 0) {
      // Run both queries in parallel for speed
      [topDonors, spendingCategories] = await Promise.all([
        this.getTopDonors(committeeIds, cycle, 10),
        this.getSpendingCategories(committeeIds, cycle),
      ]);
    }

    return {
      summary: {
        totalReceipts: candidateFinancial?.receipts?.toNumber() || 0,
        totalDisbursements: candidateFinancial?.disbursements?.toNumber() || 0,
        cashOnHand: candidateFinancial?.cashOnHand?.toNumber() || 0,
        debtOwed: candidateFinancial?.debtsOwed?.toNumber() || 0,
        individualContributions: candidateFinancial?.individualContributions?.toNumber() || 0,
        pacContributions: candidateFinancial?.pacContributions?.toNumber() || 0,
        partyContributions: candidateFinancial?.partyContributions?.toNumber() || 0,
        selfFunded: candidateFinancial?.candidateContribution?.toNumber() || 0,
        lastUpdated: candidateFinancial?.lastUpdated || null,
      },
      fundingSources,
      topDonors,
      spendingCategories,
      lastSynced: candidateFinancial?.lastUpdated?.toISOString() || 'Not synced',
    };
  }

  /**
   * Get funding sources breakdown by receipt type
   * Categorizes contributions into: Individual, PAC, Party, Self-funded, Other
   */
  async getFundingSourcesBreakdown(committeeId: string): Promise<{
    type: string;
    amount: number;
    percentage: number;
  }[]> {
    // Get all receipts for this committee
    const receipts = await prisma.receipt.findMany({
      where: { committeeId },
      select: {
        receiptType: true,
        contributionReceiptAmount: true,
      },
    });

    // Categorize receipt types
    // FEC receipt types: https://www.fec.gov/campaign-finance-data/receipt-type-code-descriptions/
    const categories: { [key: string]: number } = {
      'Individual': 0,
      'PAC': 0,
      'Party': 0,
      'Self-funded': 0,
      'Other': 0,
    };

    for (const receipt of receipts) {
      const amount = receipt.contributionReceiptAmount?.toNumber() || 0;
      const type = receipt.receiptType?.toUpperCase() || '';

      // Categorize based on receipt type codes
      if (type.startsWith('11') || type.startsWith('15') || type === 'SA11AI' || type === 'SA15') {
        // Individual contributions
        categories['Individual'] += amount;
      } else if (type.startsWith('11C') || type.startsWith('24') || type === 'SA11C') {
        // PAC contributions
        categories['PAC'] += amount;
      } else if (type.startsWith('11B') || type === 'SA11B') {
        // Party contributions
        categories['Party'] += amount;
      } else if (type.startsWith('13') || type.startsWith('19') || type === 'SA13' || type === 'SA19') {
        // Candidate contributions/loans (self-funded)
        categories['Self-funded'] += amount;
      } else {
        // Other
        categories['Other'] += amount;
      }
    }

    // Calculate total and percentages
    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);

    // Filter out zero amounts and calculate percentages
    const result = Object.entries(categories)
      .filter(([_, amount]) => amount > 0)
      .map(([type, amount]) => ({
        type,
        amount,
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return result;
  }

  /**
   * Get top donors/contributors for a committee
   */
  async getTopDonors(committeeIds: string[], cycle: number, limit: number = 10): Promise<{
    name: string;
    employer: string | null;
    occupation: string | null;
    amount: number;
    state: string | null;
  }[]> {
    // Aggregate contributions by contributor name
    const topDonors = await prisma.receipt.groupBy({
      by: ['contributorName', 'contributorEmployer', 'contributorOccupation', 'contributorState'],
      where: {
        committeeId: { in: committeeIds },
        contributionReceiptDate: {
          gte: new Date(`${cycle - 1}-01-01T00:00:00Z`),
          lte: new Date(`${cycle}-12-31T23:59:59Z`),
        },
        contributorName: { not: null },
      },
      _sum: {
        contributionReceiptAmount: true,
      },
      orderBy: {
        _sum: {
          contributionReceiptAmount: 'desc',
        },
      },
      take: limit,
    });

    return topDonors.map((donor) => ({
      name: donor.contributorName || 'Unknown',
      employer: donor.contributorEmployer,
      occupation: donor.contributorOccupation,
      amount: donor._sum.contributionReceiptAmount?.toNumber() || 0,
      state: donor.contributorState,
    }));
  }

  /**
   * Get spending categories breakdown from disbursements
   */
  async getSpendingCategories(committeeIds: string[], cycle: number): Promise<{
    category: string;
    amount: number;
    percentage: number;
  }[]> {
    // Get all disbursements for this committee
    const disbursements = await prisma.disbursement.findMany({
      where: {
        committeeId: { in: committeeIds },
        disbursementDate: {
          gte: new Date(`${cycle - 1}-01-01T00:00:00Z`),
          lte: new Date(`${cycle}-12-31T23:59:59Z`),
        },
      },
      select: {
        disbursementType: true,
        disbursementDescription: true,
        disbursementAmount: true,
      },
    });

    // Categorize spending
    const categories: { [key: string]: number } = {
      'Media/Advertising': 0,
      'Fundraising': 0,
      'Operations': 0,
      'Payroll': 0,
      'Travel': 0,
      'Consulting': 0,
      'Events': 0,
      'Other': 0,
    };

    for (const disbursement of disbursements) {
      const amount = disbursement.disbursementAmount?.toNumber() || 0;
      const desc = (disbursement.disbursementDescription || '').toLowerCase();
      const type = (disbursement.disbursementType || '').toUpperCase();

      // Categorize based on description and type
      if (desc.includes('media') || desc.includes('advertis') || desc.includes('tv') || 
          desc.includes('radio') || desc.includes('digital') || desc.includes('print')) {
        categories['Media/Advertising'] += amount;
      } else if (desc.includes('fundrais') || desc.includes('donor') || desc.includes('event')) {
        categories['Fundraising'] += amount;
      } else if (desc.includes('salary') || desc.includes('payroll') || desc.includes('wage') ||
                 desc.includes('staff') || desc.includes('employee')) {
        categories['Payroll'] += amount;
      } else if (desc.includes('travel') || desc.includes('flight') || desc.includes('hotel') ||
                 desc.includes('lodging') || desc.includes('transport')) {
        categories['Travel'] += amount;
      } else if (desc.includes('consult') || desc.includes('strateg') || desc.includes('poll')) {
        categories['Consulting'] += amount;
      } else if (desc.includes('rent') || desc.includes('office') || desc.includes('util') ||
                 desc.includes('phone') || desc.includes('equipment') || desc.includes('supplies')) {
        categories['Operations'] += amount;
      } else if (desc.includes('event') || desc.includes('catering') || desc.includes('venue')) {
        categories['Events'] += amount;
      } else {
        categories['Other'] += amount;
      }
    }

    // Calculate total and percentages
    const total = Object.values(categories).reduce((sum, val) => sum + val, 0);

    // Filter out zero amounts and calculate percentages
    const result = Object.entries(categories)
      .filter(([_, amount]) => amount > 0)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return result;
  }
}

// Export singleton instance
export const financeService = new FinanceService();
