import { Request, Response } from 'express';
import { candidateService } from '../services/candidate.service.js';
import { financeService } from '../services/finance.service.js';

export class CandidateController {
  /**
   * GET /api/candidates
   * Get candidates with filters and pagination
   * Query params:
   * - search: Search by candidate name (case-insensitive)
   * - state: Filter by state (e.g., "CA", "TX")
   * - office: Filter by office (e.g., "HOUSE", "SENATE")
   * - party: Filter by party (e.g., "DEM", "REP")
   * - cycle: Filter by election cycle (e.g., 2026)
   * - page: Page number (default: 1)
   * - perPage: Results per page (default: 50)
   * - includeFunds: Include aggregated fundraising data (default: false)
   * - hasFinancialData: Filter candidates with financial data available (default: false)
   */
  async getCandidates(req: Request, res: Response): Promise<void> {
    try {
      const { search, state, office, party, cycle, page, perPage, includeFunds, hasFinancialData } = req.query;

      const result = await candidateService.getCandidates({
        search: search as string,
        state: state as string,
        office: office as string,
        party: party as string,
        cycle: cycle ? parseInt(cycle as string) : undefined,
        page: page ? parseInt(page as string) : undefined,
        perPage: perPage ? parseInt(perPage as string) : undefined,
        includeFunds: includeFunds === 'true',
        hasFinancialData: hasFinancialData === 'true',
      });

      res.json(result);
    } catch (error: any) {
      console.error('Error getting candidates:', error);
      res.status(500).json({ error: 'Failed to fetch candidates', message: error.message });
    }
  }

  /**
   * GET /api/candidates/:id
   * Get a specific candidate by database ID
   */
  async getCandidateById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const candidate = await candidateService.getCandidateById(id);

      if (!candidate) {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }

      res.json(candidate);
    } catch (error: any) {
      console.error('Error getting candidate:', error);
      res.status(500).json({ error: 'Failed to fetch candidate', message: error.message });
    }
  }

  /**
   * GET /api/candidates/fec/:candidateId
   * Get a specific candidate by FEC candidate ID
   */
  async getCandidateByCandidateId(req: Request, res: Response): Promise<void> {
    try {
      const { candidateId } = req.params;

      const candidate = await candidateService.getCandidateByCandidateId(candidateId);

      if (!candidate) {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }

      res.json(candidate);
    } catch (error: any) {
      console.error('Error getting candidate:', error);
      res.status(500).json({ error: 'Failed to fetch candidate', message: error.message });
    }
  }

  /**
   * GET /api/candidates/:id/finances
   * Get financial summary for a candidate
   */
  async getCandidateFinances(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { cycle } = req.query;

      // Get candidate and their committees
      const candidate = await candidateService.getCandidateById(id);

      if (!candidate || !('committees' in candidate)) {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }

      // Get financial summaries for all committees
      const financialData = await Promise.all(
        candidate.committees.map(async (committee: any) => {
          const summary = await financeService.getFinancialSummary(
            committee.committeeId,
            cycle ? parseInt(cycle as string) : undefined
          );
          return {
            committee,
            summary,
          };
        })
      );

      res.json({
        candidate: {
          id: candidate.id,
          candidateId: candidate.candidateId,
          name: candidate.name,
        },
        finances: financialData,
      });
    } catch (error: any) {
      console.error('Error getting candidate finances:', error);
      res.status(500).json({ error: 'Failed to fetch candidate finances', message: error.message });
    }
  }

  /**
   * GET /api/candidates/:id/finances/detailed
   * Get detailed financial data including funding sources, top donors, and spending categories
   * Automatically fetches from FEC API if data is missing or stale
   */
  async getCandidateDetailedFinances(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { cycle } = req.query;

      const cycleNum = cycle ? parseInt(cycle as string) : 2026;

      const detailedFinances = await financeService.getOrFetchDetailedFinances(id, cycleNum);

      res.json(detailedFinances);
    } catch (error: any) {
      console.error('Error getting detailed candidate finances:', error);
      
      if (error.message === 'Candidate not found') {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }
      
      res.status(500).json({ error: 'Failed to fetch detailed finances', message: error.message });
    }
  }

  /**
   * GET /api/candidates/:id/receipts
   * Get receipts for a candidate
   */
  async getCandidateReceipts(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { page, perPage } = req.query;

      // Get candidate and their primary committee
      const candidate = await candidateService.getCandidateById(id);

      if (!candidate || !('committees' in candidate) || !candidate.committees.length) {
        res.status(404).json({ error: 'Candidate or committee not found' });
        return;
      }

      // Get receipts from the first committee (primary)
      const committeeId = candidate.committees[0].committeeId;
      const receipts = await financeService.getReceipts({
        committeeId,
        page: page ? parseInt(page as string) : undefined,
        perPage: perPage ? parseInt(perPage as string) : undefined,
      });

      res.json(receipts);
    } catch (error: any) {
      console.error('Error getting candidate receipts:', error);
      res.status(500).json({ error: 'Failed to fetch candidate receipts', message: error.message });
    }
  }

  /**
   * GET /api/candidates/:id/disbursements
   * Get disbursements for a candidate
   */
  async getCandidateDisbursements(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { page, perPage } = req.query;

      // Get candidate and their primary committee
      const candidate = await candidateService.getCandidateById(id);

      if (!candidate || !('committees' in candidate) || !candidate.committees.length) {
        res.status(404).json({ error: 'Candidate or committee not found' });
        return;
      }

      // Get disbursements from the first committee (primary)
      const committeeId = candidate.committees[0].committeeId;
      const disbursements = await financeService.getDisbursements({
        committeeId,
        page: page ? parseInt(page as string) : undefined,
        perPage: perPage ? parseInt(perPage as string) : undefined,
      });

      res.json(disbursements);
    } catch (error: any) {
      console.error('Error getting candidate disbursements:', error);
      res.status(500).json({ error: 'Failed to fetch candidate disbursements', message: error.message });
    }
  }

  /**
   * POST /api/sync/candidates
   * Sync candidates from FEC API
   */
  async syncCandidates(req: Request, res: Response): Promise<void> {
    try {
      const { state, office, cycle, maxPages } = req.body;

      const result = await candidateService.syncCandidates({
        state,
        office,
        cycle: cycle ? parseInt(cycle) : undefined,
        maxPages: maxPages ? parseInt(maxPages) : undefined,
      });

      res.json({
        message: 'Candidate sync completed',
        ...result,
      });
    } catch (error: any) {
      console.error('Error syncing candidates:', error);
      res.status(500).json({ error: 'Failed to sync candidates', message: error.message });
    }
  }

  /**
   * POST /api/candidates/:id/sync
   * Manually sync financial data for a single candidate from FEC API
   * Use this to refresh stale data on-demand
   */
  async syncCandidateData(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { cycle } = req.query;
      const cycleNum = cycle ? parseInt(cycle as string) : 2026;

      // Get candidate
      const candidate = await candidateService.getCandidateById(id);
      if (!candidate) {
        res.status(404).json({ error: 'Candidate not found' });
        return;
      }

      // Sync candidate financials from FEC
      const financeResult = await financeService.syncCandidateFinancials(candidate.candidateId, cycleNum);

      // Sync committees
      const committeeResult = await candidateService.syncCandidateCommittees(candidate.candidateId);

      res.json({
        message: `Synced data for ${candidate.name}`,
        financials: financeResult,
        committees: committeeResult,
      });
    } catch (error: any) {
      console.error('Error syncing candidate data:', error);
      res.status(500).json({ error: 'Failed to sync candidate data', message: error.message });
    }
  }
}

export const candidateController = new CandidateController();
