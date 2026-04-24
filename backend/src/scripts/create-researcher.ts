#!/usr/bin/env tsx
/**
 * Create Researcher User
 * Usage: npm run researcher:create -- --email=me@x.com --password=secret --name="Jane Doe"
 */

import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';

function arg(key: string): string | undefined {
  const flag = `--${key}=`;
  const match = process.argv.find(a => a.startsWith(flag));
  return match?.slice(flag.length);
}

async function main() {
  const email = arg('email');
  const password = arg('password');
  const name = arg('name') ?? null;

  if (!email || !password) {
    console.error('Usage: npm run researcher:create -- --email=<email> --password=<pw> [--name="Jane Doe"]');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.researcherUser.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, name, isActive: true, updatedAt: new Date() },
    create: { email: email.toLowerCase(), passwordHash, name, isActive: true },
  });

  console.log('✅ Researcher user upserted');
  console.log('   id:', user.id);
  console.log('   email:', user.email);
  console.log('   name:', user.name ?? '(none)');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
