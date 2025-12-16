import { prisma } from '../config/database.js';
import { FinancialSummary, Receipt, Disbursement } from '@prisma/client';
import {
  fecApiService,
  FECFinancialSummary,
  FECReceipt,
  FECDisbursement,
} from './fec-api.service.js';
import { getPaginationParams, createPaginationResult, PaginationResult } from '../utils/pagination.js';

/**
 * Service for managing campaign finance data
 */
export class FinanceService {
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
    committeeId: string;
    page?: number;
    perPage?: number;
  }): Promise<PaginationResult<Receipt>> {
    const { committeeId, page = 1, perPage = 50 } = params;
    const { skip, take } = getPaginationParams(page, perPage);

    const [receipts, total] = await Promise.all([
      prisma.receipt.findMany({
        where: { committeeId },
        skip,
        take,
        orderBy: { contributionReceiptDate: 'desc' },
      }),
      prisma.receipt.count({ where: { committeeId } }),
    ]);

    return createPaginationResult(receipts, total, page, perPage);
  }

  /**
   * Get disbursements for a committee with pagination
   */
  async getDisbursements(params: {
    committeeId: string;
    page?: number;
    perPage?: number;
  }): Promise<PaginationResult<Disbursement>> {
    const { committeeId, page = 1, perPage = 50 } = params;
    const { skip, take } = getPaginationParams(page, perPage);

    const [disbursements, total] = await Promise.all([
      prisma.disbursement.findMany({
        where: { committeeId },
        skip,
        take,
        orderBy: { disbursementDate: 'desc' },
      }),
      prisma.disbursement.count({ where: { committeeId } }),
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

      let synced = 0;
      let errors = 0;

      // Process in batches to avoid overwhelming the database
      const batchSize = 100;
      for (let i = 0; i < fecReceipts.length; i += batchSize) {
        const batch = fecReceipts.slice(i, i + batchSize);

        try {
          await prisma.receipt.createMany({
            data: batch.map((receipt) => ({
              committeeId: receipt.committee.committee_id,
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
            })),
            skipDuplicates: true,
          });

          synced += batch.length;
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

      let synced = 0;
      let errors = 0;

      // Process in batches to avoid overwhelming the database
      const batchSize = 100;
      for (let i = 0; i < fecDisbursements.length; i += batchSize) {
        const batch = fecDisbursements.slice(i, i + batchSize);

        try {
          await prisma.disbursement.createMany({
            data: batch.map((disbursement) => ({
              committeeId: disbursement.committee.committee_id,
              recipientName: disbursement.recipient_name,
              disbursementType: disbursement.disbursement_type,
              disbursementAmount: disbursement.disbursement_amount || 0,
              disbursementDate: disbursement.disbursement_date
                ? new Date(disbursement.disbursement_date)
                : null,
              disbursementDescription: disbursement.disbursement_description,
              imageNumber: disbursement.image_number,
            })),
            skipDuplicates: true,
          });

          synced += batch.length;
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
}

// Export singleton instance
export const financeService = new FinanceService();
