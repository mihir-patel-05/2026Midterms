/** `npm run sync:settlements`: read how each stored 2026 Kalshi race market settled, once (#136). */
import { prisma } from '../config/database.js';
import { runSettlementSync } from '../services/kalshi/run-settlements.js';
import { settlementDisagreements } from '../services/kalshi/settlements.js';

const report = await runSettlementSync();
if (!report) console.log('Another run holds the kalshi-settlements lease; try again later.');
const disagreements = await settlementDisagreements(prisma);
for (const item of disagreements) console.log(`⚠️  ${item.race}: ${item.market} settled YES on "${item.settledOutcome}", but the race was called for ${item.winner}`);
await prisma.$disconnect();
