import { Request, Response } from 'express';
import { prisma } from '../config/database.js';

export class DeadlineController {
  /**
   * GET /api/deadlines
   * Public endpoint - Get all active upcoming deadlines
   */
  async getPublicDeadlines(req: Request, res: Response): Promise<void> {
    try {
      const deadlines = await prisma.deadline.findMany({
        where: {
          isActive: true,
          date: {
            gte: new Date(), // Only future deadlines
          },
        },
        orderBy: {
          date: 'asc',
        },
      });

      res.json({
        deadlines: deadlines.map((d) => ({
          id: d.id,
          title: d.title,
          date: d.date,
          type: d.type,
          states: d.states,
          description: d.description,
          urgent: d.urgent,
        })),
      });
    } catch (error: any) {
      console.error('Error fetching public deadlines:', error);
      res.status(500).json({ error: 'Failed to fetch deadlines', message: error.message });
    }
  }

  /**
   * GET /api/admin/deadlines
   * Admin endpoint - Get all deadlines (including inactive and past)
   */
  async getAllDeadlines(req: Request, res: Response): Promise<void> {
    try {
      const deadlines = await prisma.deadline.findMany({
        orderBy: {
          date: 'asc',
        },
      });

      res.json({
        deadlines: deadlines.map((d) => ({
          id: d.id,
          title: d.title,
          date: d.date,
          type: d.type,
          states: d.states,
          description: d.description,
          urgent: d.urgent,
          isActive: d.isActive,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
      });
    } catch (error: any) {
      console.error('Error fetching all deadlines:', error);
      res.status(500).json({ error: 'Failed to fetch deadlines', message: error.message });
    }
  }

  /**
   * POST /api/admin/deadlines
   * Create a new deadline
   */
  async createDeadline(req: Request, res: Response): Promise<void> {
    try {
      const { title, date, type, states, description, urgent } = req.body;

      // Validate required fields
      if (!title || !date || !type || !states) {
        res.status(400).json({ error: 'Missing required fields: title, date, type, states' });
        return;
      }

      // Validate type
      const validTypes = ['registration', 'election', 'other'];
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: 'Invalid type. Must be: registration, election, or other' });
        return;
      }

      // Validate states is an array
      if (!Array.isArray(states) || states.length === 0) {
        res.status(400).json({ error: 'States must be a non-empty array' });
        return;
      }

      const deadline = await prisma.deadline.create({
        data: {
          title,
          date: new Date(date),
          type,
          states,
          description: description || null,
          urgent: urgent || false,
          isActive: true,
        },
      });

      res.status(201).json({
        message: 'Deadline created successfully',
        deadline: {
          id: deadline.id,
          title: deadline.title,
          date: deadline.date,
          type: deadline.type,
          states: deadline.states,
          description: deadline.description,
          urgent: deadline.urgent,
          isActive: deadline.isActive,
          createdAt: deadline.createdAt,
          updatedAt: deadline.updatedAt,
        },
      });
    } catch (error: any) {
      console.error('Error creating deadline:', error);
      res.status(500).json({ error: 'Failed to create deadline', message: error.message });
    }
  }

  /**
   * PUT /api/admin/deadlines/:id
   * Update an existing deadline
   */
  async updateDeadline(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, date, type, states, description, urgent, isActive } = req.body;

      // Check if deadline exists
      const existing = await prisma.deadline.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({ error: 'Deadline not found' });
        return;
      }

      // Validate type if provided
      if (type) {
        const validTypes = ['registration', 'election', 'other'];
        if (!validTypes.includes(type)) {
          res.status(400).json({ error: 'Invalid type. Must be: registration, election, or other' });
          return;
        }
      }

      // Validate states if provided
      if (states && (!Array.isArray(states) || states.length === 0)) {
        res.status(400).json({ error: 'States must be a non-empty array' });
        return;
      }

      const deadline = await prisma.deadline.update({
        where: { id },
        data: {
          ...(title !== undefined && { title }),
          ...(date !== undefined && { date: new Date(date) }),
          ...(type !== undefined && { type }),
          ...(states !== undefined && { states }),
          ...(description !== undefined && { description }),
          ...(urgent !== undefined && { urgent }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      res.json({
        message: 'Deadline updated successfully',
        deadline: {
          id: deadline.id,
          title: deadline.title,
          date: deadline.date,
          type: deadline.type,
          states: deadline.states,
          description: deadline.description,
          urgent: deadline.urgent,
          isActive: deadline.isActive,
          createdAt: deadline.createdAt,
          updatedAt: deadline.updatedAt,
        },
      });
    } catch (error: any) {
      console.error('Error updating deadline:', error);
      res.status(500).json({ error: 'Failed to update deadline', message: error.message });
    }
  }

  /**
   * DELETE /api/admin/deadlines/:id
   * Delete a deadline
   */
  async deleteDeadline(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Check if deadline exists
      const existing = await prisma.deadline.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json({ error: 'Deadline not found' });
        return;
      }

      await prisma.deadline.delete({
        where: { id },
      });

      res.json({ message: 'Deadline deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting deadline:', error);
      res.status(500).json({ error: 'Failed to delete deadline', message: error.message });
    }
  }
}

export const deadlineController = new DeadlineController();

