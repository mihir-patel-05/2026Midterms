import 'dotenv/config';
import { prisma } from '../config/database.js';
import { ingestDay0Fixture } from '../features/election-results/fixture-ingestion.js';

try {
  console.log(await ingestDay0Fixture(prisma));
} finally {
  await prisma.$disconnect();
}
