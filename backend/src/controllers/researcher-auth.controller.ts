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

  const user = await prisma.researcherUser.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Unauthorized', message: 'Account inactive' });
    return;
  }

  req.researcher = { id: user.id, email: user.email, name: user.name };
  next();
}

export const researcherAuthController = {
  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const user = await prisma.researcherUser.findUnique({ where: { email: String(email).toLowerCase() } });
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
  },

  async me(req: ResearcherRequest, res: Response): Promise<void> {
    res.json({ user: req.researcher });
  },
};
