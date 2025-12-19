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

  /**
   * Get or fetch detailed financial data for a candidate
   * Checks database first, fetches from FEC API if missing or stale
   */
  async getOrFetchDetailedFinances(candidateId: string, cycle: number = 2026): Promise<{
    summary: {
      totalReceipts: number;
      totalDisbursements: number;
      cashOnHand: number;
      debtOwed: number;
      lastUpdated: Date | null;
    };
    fundingSources: { type: string; amount: number; percentage: number }[];
    topDonors: { name: string; employer: string | null; occupation: string | null; amount: number; state: string | null }[];
    spendingCategories: { category: string; amount: number; percentage: number }[];
    lastSynced: string;
  }> {
    // Get candidate's committees
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        committees: true,
      },
    });

    if (!candidate) {
      throw new Error('Candidate not found');
    }

    // If no committees, try to sync them from FEC
    if (!candidate.committees || candidate.committees.length === 0) {
      console.log(`📥 No committees found for ${candidate.name}, fetching from FEC...`);
      try {
        const { candidateService } = await import('./candidate.service.js');
        await candidateService.syncCandidateCommittees(candidate.candidateId);
        
        // Re-fetch candidate with committees
        const updatedCandidate = await prisma.candidate.findUnique({
          where: { id: candidateId },
          include: { committees: true },
        });
        
        if (updatedCandidate) {
          candidate.committees = updatedCandidate.committees;
        }
      } catch (error) {
        console.error(`❌ Failed to sync committees for ${candidate.name}:`, error);
      }
    }

    // If still no committees, return empty data
    if (!candidate.committees || candidate.committees.length === 0) {
      return {
        summary: {
          totalReceipts: 0,
          totalDisbursements: 0,
          cashOnHand: 0,
          debtOwed: 0,
          lastUpdated: null,
        },
        fundingSources: [],
        topDonors: [],
        spendingCategories: [],
        lastSynced: new Date().toISOString(),
      };
    }

    // Get primary committee (first one)
    const primaryCommittee = candidate.committees[0];
    const committeeId = primaryCommittee.committeeId;

    // Check if we have financial data
    let financialSummary = await this.getFinancialSummary(committeeId, cycle);

    // Check if data is stale (older than 24 hours) or missing
    const isStale = financialSummary 
      ? (Date.now() - new Date(financialSummary.lastUpdated).getTime()) > 24 * 60 * 60 * 1000
      : true;

    if (!financialSummary || isStale) {
      console.log(`📥 Financial data missing or stale for ${primaryCommittee.name}, fetching from FEC...`);
      try {
        await this.syncFinancialSummary(committeeId, cycle);
        financialSummary = await this.getFinancialSummary(committeeId, cycle);
      } catch (error) {
        console.error(`❌ Failed to sync financial summary:`, error);
      }
    }

    // Check if we have receipt data for funding sources
    const receiptCount = await prisma.receipt.count({ where: { committeeId } });
    
    if (receiptCount === 0) {
      console.log(`📥 No receipts found for ${primaryCommittee.name}, fetching from FEC...`);
      try {
        await this.syncReceipts({
          committeeId,
          twoYearTransactionPeriod: cycle,
          maxPages: 3, // Limit to avoid rate limiting
        });
      } catch (error) {
        console.error(`❌ Failed to sync receipts:`, error);
      }
    }

    // Check if we have disbursement data for spending categories
    const disbursementCount = await prisma.disbursement.count({ where: { committeeId } });

    if (disbursementCount === 0) {
      console.log(`📥 No disbursements found for ${primaryCommittee.name}, fetching from FEC...`);
      try {
        await this.syncDisbursements({
          committeeId,
          twoYearTransactionPeriod: cycle,
          maxPages: 3, // Limit to avoid rate limiting
        });
      } catch (error) {
        console.error(`❌ Failed to sync disbursements:`, error);
      }
    }

    // Now aggregate all the data
    const [fundingSources, topDonors, spendingCategories] = await Promise.all([
      this.getFundingSourcesBreakdown(committeeId),
      this.getTopDonors(committeeId, 10),
      this.getSpendingCategories(committeeId),
    ]);

    return {
      summary: {
        totalReceipts: Number(financialSummary?.totalReceipts) || 0,
        totalDisbursements: Number(financialSummary?.totalDisbursements) || 0,
        cashOnHand: Number(financialSummary?.cashOnHand) || 0,
        debtOwed: Number(financialSummary?.debtOwed) || 0,
        lastUpdated: financialSummary?.lastUpdated || null,
      },
      fundingSources,
      topDonors,
      spendingCategories,
      lastSynced: new Date().toISOString(),
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
      const amount = Number(receipt.contributionReceiptAmount) || 0;
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
  async getTopDonors(committeeId: string, limit: number = 10): Promise<{
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
        committeeId,
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
      amount: Number(donor._sum.contributionReceiptAmount) || 0,
      state: donor.contributorState,
    }));
  }

  /**
   * Get spending categories breakdown from disbursements
   */
  async getSpendingCategories(committeeId: string): Promise<{
    category: string;
    amount: number;
    percentage: number;
  }[]> {
    // Get all disbursements for this committee
    const disbursements = await prisma.disbursement.findMany({
      where: { committeeId },
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
      const amount = Number(disbursement.disbursementAmount) || 0;
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
