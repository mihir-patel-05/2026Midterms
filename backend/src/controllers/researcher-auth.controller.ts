import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';

const JWT_EXPIRES_IN = '7d';

interface ResearcherJwtPayload {
  sub: string;   // researcher user id
  email: string;
}

export interface ResearcherRequest extends Request {
  researcher?: { id: string; email: string; name: string | null };
}

export async function researcherAuth(req: ResearcherRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing bearer token' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  let payload: ResearcherJwtPayload;
  try {
    payload = jwt.verify(token, env.RESEARCHER_JWT_SECRET) as ResearcherJwtPayload;
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    return;
  }

  if (typeof payload?.sub !== 'string') {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    return;
  }

  try {
    const user = await prisma.researcherUser.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Unauthorized', message: 'Account inactive' });
      return;
    }

    req.researcher = { id: user.id, email: user.email, name: user.name };
    next();
  } catch (error) {
    console.error('Error verifying researcher session:', error);
    res.status(500).json({ error: 'Authentication service unavailable' });
  }
}

export const researcherAuthController = {
  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body ?? {};
    // Postgres rejects NUL bytes, and bcrypt throws on non-strings; refuse both up front.
    if (
      typeof email !== 'string' || typeof password !== 'string' || !email || !password ||
      email.includes('\0') || email.length > 320 || password.length > 1024
    ) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    try {
      const user = await prisma.researcherUser.findUnique({ where: { email: email.toLowerCase() } });
      if (!user || !user.isActive) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = jwt.sign(
        { sub: user.id, email: user.email } satisfies ResearcherJwtPayload,
        env.RESEARCHER_JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN },
      );

      await prisma.researcherUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (error) {
      console.error('Error during researcher login:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  },

  async me(req: ResearcherRequest, res: Response): Promise<void> {
    res.json({ user: req.researcher });
  },
};
