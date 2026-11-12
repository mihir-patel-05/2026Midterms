/**
 * The results-ingestor Railway service: `node dist/workers/results-ingestor.js`, exactly one replica,
 * with a Volume at RESULTS_RAW_ARTIFACT_DIR (docs/plans/civicapi-results.md, "Worker").
 *
 *   node dist/workers/results-ingestor.js                 polls civicAPI while RESULTS_INGESTOR_ENABLED=true
 *   node dist/workers/results-ingestor.js --once          one cycle, then exit (needs no flag)
 *   node dist/workers/results-ingestor.js --record <dir>  also saves every fetched document, one folder per cycle
 *   node dist/workers/results-ingestor.js --replay <dir>  feeds recorded folders through the real pipeline, one per cycle
 *   node dist/workers/results-ingestor.js --finals-once [--states WV,GA]
 *                                                         one finals pass (every race's detail, #136), then exit
 *
 * A replay needs CIVICAPI_ACCEPT_TEST_DATA=true when the recording is civicAPI test data.
 */
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { replayFetch } from '../features/election-results/civicapi/ingestor.js';
import { runFinalsPass, startIngestorLoop } from '../features/election-results/civicapi/run.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  if (process.argv.includes('--finals-once')) {
    const states = argument('--states')?.split(',').map((state) => state.trim()).filter(Boolean);
    const result = await runFinalsPass(prisma, states ? { states } : {});
    await prisma.$disconnect();
    process.exit(result.status === 'failed' ? 1 : 0);
  }
  const once = process.argv.includes('--once');
  const replayDir = argument('--replay');
  const recordDir = argument('--record');
  if (!env.RESULTS_INGESTOR_ENABLED && !once && !replayDir) {
    // Stay up and idle, so Railway does not restart the service in a loop.
    console.log('[civicapi] RESULTS_INGESTOR_ENABLED is false; idle. Set it to true and restart to poll civicAPI.');
    setInterval(() => {}, 1 << 30);
    return;
  }
  const replay = replayDir ? await replayFetch(replayDir) : null;
  if (replay) console.log(`[civicapi] Replaying ${replay.steps} recorded steps from ${replayDir}`);
  const loop = startIngestorLoop(prisma, {
    fetchImpl: replay?.fetchImpl,
    onCycle: replay?.advance,
    maxCycles: once ? 1 : replay ? replay.steps : undefined,
    overrides: recordDir ? { recordDir } : {},
  });
  const shutdown = async () => {
    console.log('[civicapi] Stopping after the current cycle…');
    await loop.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  await loop.done;
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('[civicapi] Results ingestor failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
