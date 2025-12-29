import { Request, Response } from 'express';
import { electionService } from '../services/election.service.js';

export class ElectionController {
  /**
   * GET /api/elections
   * Get elections with filters and pagination
   * Query params:
   * - state: Filter by state (e.g., "CA", "TX")
   * - district: Filter by district (e.g., "01", "12")
   * - officeType: Filter by office type (e.g., "HOUSE", "SENATE")
   * - electionType: Filter by election type (e.g., "PRIMARY", "GENERAL")
   * - cycle: Filter by election cycle (default: 2026)
   * - page: Page number (default: 1)
   * - perPage: Results per page (default: 50)
   */
  async getElections(req: Request, res: Response): Promise<void> {
    try {
      const { state, district, officeType, electionType, cycle, page, perPage } = req.query;

      const result = await electionService.getElections({
        state: state as string,
        district: district as string,
        officeType: officeType as string,
        electionType: electionType as string,
        cycle: cycle ? parseInt(cycle as string) : undefined,
        page: page ? parseInt(page as string) : undefined,
        perPage: perPage ? parseInt(perPage as string) : undefined,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Error getting elections:', error);
      res.status(500).json({ error: 'Failed to fetch elections', message: error.message });
    }
  }

  /**
   * GET /api/elections/states/:state
   * Get all elections for a specific state
   */
  async getElectionsByState(req: Request, res: Response): Promise<void> {
    try {
      const { state } = req.params;
      const { cycle } = req.query;

      if (!state || state.length !== 2) {
        res.status(400).json({ error: 'Invalid state code. Must be a 2-letter state code (e.g., CA, TX)' });
        return;
      }

      const elections = await electionService.getElectionsByState(
        state,
        cycle ? parseInt(cycle as string) : undefined
      );

      res.json({
        state: state.toUpperCase(),
        cycle: cycle ? parseInt(cycle as string) : 2026,
        elections,
        count: elections.length,
      });
    } catch (error: any) {
      console.error('Error getting elections by state:', error);
      res.status(500).json({ error: 'Failed to fetch elections for state', message: error.message });
    }
  }

  /**
   * GET /api/elections/states/counts
   * Get race counts by state for map visualization
   */
  async getStateElectionCounts(req: Request, res: Response): Promise<void> {
    try {
      const { cycle } = req.query;

      const counts = await electionService.getStateElectionCounts(
        cycle ? parseInt(cycle as string) : undefined
      );

      res.json({
        cycle: cycle ? parseInt(cycle as string) : 2026,
        states: counts,
      });
    } catch (error: any) {
      console.error('Error getting state election counts:', error);
      res.status(500).json({ error: 'Failed to fetch state election counts', message: error.message });
    }
  }

  /**
   * GET /api/elections/:id
   * Get a specific election by ID
   */
  async getElectionById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const election = await electionService.getElectionById(id);

      if (!election) {
        res.status(404).json({ error: 'Election not found' });
        return;
      }

      res.json(election);
    } catch (error: any) {
      console.error('Error getting election:', error);
      res.status(500).json({ error: 'Failed to fetch election', message: error.message });
    }
  }

  /**
   * POST /api/elections
   * Create a new election
   */
  async createElection(req: Request, res: Response): Promise<void> {
    try {
      const { state, district, officeType, electionDate, electionType, cycle } = req.body;

      // Validate required fields
      if (!state || !officeType || !electionDate || !electionType || !cycle) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['state', 'officeType', 'electionDate', 'electionType', 'cycle'],
        });
        return;
      }

      const election = await electionService.createElection({
        state,
        district,
        officeType,
        electionDate: new Date(electionDate),
        electionType,
        cycle: parseInt(cycle),
      });

      res.status(201).json(election);
    } catch (error: any) {
      console.error('Error creating election:', error);
      res.status(500).json({ error: 'Failed to create election', message: error.message });
    }
  }

  /**
   * PUT /api/elections/:id
   * Update an election
   */
  async updateElection(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { electionDate, electionType } = req.body;

      const updateData: any = {};
      if (electionDate) updateData.electionDate = new Date(electionDate);
      if (electionType) updateData.electionType = electionType;

      const election = await electionService.updateElection(id, updateData);

      res.json(election);
    } catch (error: any) {
      console.error('Error updating election:', error);
      if ((error as any).code === 'P2025') {
        res.status(404).json({ error: 'Election not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to update election', message: error.message });
    }
  }

  /**
   * DELETE /api/elections/:id
   * Delete an election
   */
  async deleteElection(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await electionService.deleteElection(id);

      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting election:', error);
      if ((error as any).code === 'P2025') {
        res.status(404).json({ error: 'Election not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to delete election', message: error.message });
    }
  }
}

export const electionController = new ElectionController();
