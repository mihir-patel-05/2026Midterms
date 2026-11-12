import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { parseAggregate } from '../../../services/ballot/civicapi-ballot.js';
import { ElectionResultsResponseSchema } from '../contracts.js';
import { dbBootstrapPayload, dbCurrentResult, type ReadModelConfig } from '../read-model.js';
import { CivicApiClient } from './client.js';
import { CivicApiIngestor, type IngestorOptions } from './ingestor.js';
import { chooseTierA } from './tiers.js';
import { CertificationInputError, certificationOverview, recordEvent, removeLatestEvent, setDeadline, setRankedChoiceRound, stateTotals } from '../certification.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

async function reset(db: PrismaClient) {
  const source = await db.dataSource.findUnique({ where: { key: 'civicapi' } });
  if (!source) return;
  const sourceId = source.id;
  await db.contest.updateMany({ where: { sourceId }, data: { currentSnapshotId: null } });
  await db.raceCall.deleteMany({ where: { sourceId } });
  await db.resultSnapshot.deleteMany({ where: { sourceId } });
  await db.candidacy.deleteMany({ where: { sourceId } });
  await db.contest.deleteMany({ where: { sourceId } });
  await db.reportingUnit.deleteMany({ where: { sourceId } });
  await db.ingestionRun.deleteMany({ where: { sourceId } });
  await db.electionEvent.deleteMany({ where: { sourceId } });
  await db.syncLease.deleteMany({ where: { name: 'results-civicapi' } });
  await db.dataSource.delete({ where: { id: sourceId } });
}

/** What the ballot sync writes, for the fixture races: the source, the event, contests and candidacies. */
async function seedCatalog(db: PrismaClient) {
  const source = await db.dataSource.create({
    data: { key: 'civicapi', name: 'civicAPI', type: 'OTHER', homepageUrl: 'https://civicapi.org', attributionText: 'Results: civicAPI (civicapi.org).', expectedCadenceSeconds: 30, isEnabled: true },
  });
  const event = await db.electionEvent.create({ data: { name: '2026 General Election', electionDate: new Date('2026-11-03T00:00:00Z'), type: 'GENERAL', cycle: 2026, sourceId: source.id, sourceElectionId: '2026-general' } });
  const races = [
    ...parseAggregate(fixture('senate-aggregate.json'), 'SENATE', 2026).races,
    ...parseAggregate(fixture('house-aggregate.trimmed.json'), 'HOUSE', 2026).races,
  ];
  for (const race of races) {
    const contest = await db.contest.create({
      data: {
        electionEventId: event.id, sourceId: source.id, sourceContestId: race.sourceContestId, name: race.name,
        office: race.officeType === 'SENATE' ? 'US_SENATE' : 'US_HOUSE', officeLevel: 'FEDERAL', stateCode: race.state, districtCode: race.district,
      },
    });
    for (const [ballotOrder, candidate] of race.candidates.entries()) {
      const person = await db.person.create({ data: { displayName: candidate.name, normalizedName: candidate.name.toLowerCase() } });
      await db.candidacy.create({
        data: {
          personId: person.id, contestId: contest.id, sourceId: source.id, sourceCandidateId: candidate.sourceCandidateId, ballotName: candidate.name, ballotOrder,
          ballotStatus: candidate.writeIn ? 'WRITE_IN' : 'BALLOT_CONFIRMED', isIncumbent: candidate.isIncumbent,
          fecCandidateId: candidate.name === 'Jon Ossoff' ? 'S8GA00180' : null,
        },
      });
    }
  }
  return source;
}

/** Serves documents by civicAPI race id; `docs` can be swapped between cycles. */
function server(docs: Record<string, unknown>) {
  const requests: string[] = [];
  const fetchImpl = (async (url: string) => {
    const id = /\/race\/(\d+)$/.exec(url)?.[1] ?? '';
    requests.push(id);
    return id in docs ? new Response(JSON.stringify(docs[id]), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { docs, requests, fetchImpl };
}

async function ingestor(db: PrismaClient, fetchImpl: typeof fetch, options: Partial<IngestorOptions>) {
  const client = new CivicApiClient({ baseUrl: 'https://civicapi.example/api/v2', timeoutMs: 5000, maxRps: 10_000, fetchImpl, sleep: async () => {} });
  return new CivicApiIngestor(db, client, {
    cycle: 2026, senateAggregateId: '87528', houseAggregateId: '87524', intervalSeconds: 30, acceptTestData: false,
    artifactDir: await mkdtemp(join(tmpdir(), 'civicapi-artifacts-')), parserVersion: 'civicapi/test',
    tierA: { enabled: true, max: 60, override: ['GA-SEN', 'PA-07'], detailMinIntervalSeconds: 0, detailRefreshSeconds: 600, detailRps: 10_000 },
    ...options,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recorded JSON
const live = (body: any): any => ({ ...structuredClone(body), test_data: false, last_updated: "2026-11-04T02:00:00.000Z" });
const readConfig = (showTestData: boolean): ReadModelConfig => ({ mockEnabled: false, enabledProviderKeys: ['civicapi'], staleAfterSeconds: 300, showTestData });

test('civicAPI ingestion: test data is held, rehearsals publish, live numbers replace them, and calls follow the desk', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    await reset(db);
    const source = await seedCatalog(db);
    const senate = fixture('senate-aggregate.json');
    const house = fixture('house-aggregate.trimmed.json');
    const ga = fixture('race-ga-sen.trimmed.json');
    const pa = fixture('race-pa-07.json');
    const feed = server({ 87528: senate, 87524: house, 87087: ga, 87382: pa });

    // 1. civicAPI serves test data: nothing is published and the source says why.
    const held = await (await ingestor(db, feed.fetchImpl, {})).cycle();
    assert.equal(held.status, 'held');
    assert.equal(await db.resultSnapshot.count({ where: { sourceId: source.id } }), 0);
    const heldSource = await db.dataSource.findUniqueOrThrow({ where: { id: source.id } });
    assert.equal(heldSource.healthStatus, 'NOT_CONFIGURED');
    assert.match(heldSource.coverageDescription ?? '', /test data/);

    // 2. A rehearsal accepts it: tier B from the aggregates, tier A (GA-SEN, PA-07) from detail, with counties.
    const rehearsal = await ingestor(db, feed.fetchImpl, { acceptTestData: true });
    const first = await rehearsal.cycle(new Date('2026-11-04T01:00:00Z'));
    assert.equal(first.status, 'ok', first.message);
    assert.equal(first.published, 45);
    // Tier A detail, plus one call-time lookup per newly called tier B race.
    assert(feed.requests.includes('87087') && feed.requests.includes('87382'));
    assert(first.details >= 2);
    assert.equal(await db.resultSnapshot.count({ where: { sourceId: source.id, isTestData: true } }), 45);
    const gaCall = await db.raceCall.findFirstOrThrow({ where: { contest: { sourceContestId: '87087' }, retractedAt: null } });
    assert.equal(gaCall.calledAt.toISOString(), '2026-10-31T21:30:45.847Z');
    assert.equal(gaCall.calledAtSource, true);
    assert.equal(gaCall.isTestData, true);
    assert.equal((await db.dataSource.findUniqueOrThrow({ where: { id: source.id } })).healthStatus, 'CURRENT');
    const payloads = await readdir(join((rehearsal as unknown as { options: IngestorOptions }).options.artifactDir, 'sha256'));
    assert(payloads.length >= 3 && payloads.every((name) => name.endsWith('.json.gz')));

    // The read model hides test data unless told to show it.
    const contestId = (await db.contest.findFirstOrThrow({ where: { sourceContestId: '87087' } })).id;
    assert.equal((await dbCurrentResult(db, readConfig(false), contestId))?.data, null);
    // Read on election night: the share-counted estimate is served for two days after election day.
    const shown = await dbCurrentResult(db, readConfig(true), contestId, new Date('2026-11-04T01:00:00Z'));
    assert(shown?.data);
    ElectionResultsResponseSchema.parse(shown);
    assert.equal(shown.data.isTestData, true);
    assert.equal(shown.data.reportingUnitResults.length, 6);
    assert.equal(shown.data.reportingUnitResults[0].reportingUnit.countyFips?.length, 5);
    assert.equal(shown.data.reportingProgress.estimatedPercentage, 99.3);
    assert.equal(shown.data.calls?.[0].kind, 'WINNER');
    assert.equal(shown.data.candidates.find((candidate) => candidate.displayName === 'Jon Ossoff')?.fecCandidateId, 'S8GA00180');
    const lean = await dbBootstrapPayload(db, readConfig(true), new Date(), { includeUnits: false });
    const leanGa = lean?.data.results.find((item) => item.data?.contest.id === contestId);
    assert.equal(leanGa?.data?.reportingUnitResults.length, 0);
    assert.equal(leanGa?.data?.totalVotes, shown.data.totalVotes);
    // Read after election night, the estimate is dropped and finalStatus says where the race stands.
    const later = await dbCurrentResult(db, readConfig(true), contestId, new Date('2026-11-12T20:00:00Z'));
    assert.equal(later?.data?.reportingProgress.estimatedPercentage, null);
    assert(later?.meta.limitations.some((line) => line.includes('not shown after election night')));

    // 3. The same numbers again write nothing.
    const again = await rehearsal.cycle(new Date('2026-11-04T01:00:30Z'));
    assert.equal(again.published, 0);
    assert.equal(await db.resultSnapshot.count({ where: { sourceId: source.id } }), 45);

    // 4. Live numbers: the rehearsal is removed, then live snapshots and calls are written.
    feed.docs[87528] = live(senate);
    feed.docs[87524] = live(house);
    feed.docs[87087] = live(ga);
    feed.docs[87382] = live(pa);
    const liveRun = await ingestor(db, feed.fetchImpl, {});
    const firstLive = await liveRun.cycle(new Date('2026-11-04T02:00:00Z'));
    assert.equal(firstLive.status, 'ok', firstLive.message);
    assert.equal(await db.resultSnapshot.count({ where: { sourceId: source.id, isTestData: true } }), 0);
    assert.equal(await db.raceCall.count({ where: { sourceId: source.id, isTestData: true } }), 0);
    assert.equal(await db.resultSnapshot.count({ where: { sourceId: source.id, publicationStatus: 'PUBLISHED' } }), 45);
    const liveGa = await dbCurrentResult(db, readConfig(false), contestId);
    assert(liveGa?.data);
    assert.equal(liveGa.data.isTestData, false);
    assert.equal(liveGa.meta.dataMode, 'LIVE');

    // 5. A moved count publishes one new snapshot and supersedes the old one; a new candidate is added unconfirmed.
    const moved = live(senate);
    (moved.region_results as Record<string, { candidates: Array<Record<string, unknown>> }>).me.candidates.push({ name: 'New Person', candidate_id: 999001, party: 'Independent', votes: 10, percent: 0.1 });
    (moved.region_results as Record<string, { candidates: Array<Record<string, unknown>> }>).me.candidates[0].votes = 12345;
    moved.last_updated = '2026-11-04T02:00:30.000Z';
    feed.docs[87528] = moved;
    const second = await liveRun.cycle(new Date('2026-11-04T02:00:30Z'));
    assert.equal(second.published, 1);
    const meContest = await db.contest.findFirstOrThrow({ where: { sourceId: source.id, stateCode: 'ME', office: 'US_SENATE' } });
    assert.equal(await db.resultSnapshot.count({ where: { contestId: meContest.id, publicationStatus: 'SUPERSEDED' } }), 1);
    assert.equal((await db.candidacy.findFirstOrThrow({ where: { contestId: meContest.id, sourceCandidateId: '999001' } })).ballotStatus, 'UNCONFIRMED');
    assert(await db.ingestionError.findFirst({ where: { code: 'RESULTS_WARNING', message: { contains: 'New Person' } } }));

    // 6. A call missing from one document stays; missing from two in a row it is retracted, never deleted.
    const uncalled = structuredClone(moved);
    for (const candidate of (uncalled.region_results as Record<string, { candidates: Array<Record<string, unknown>> }>).fl.candidates) candidate.winner = false;
    uncalled.last_updated = '2026-11-04T02:01:00.000Z';
    feed.docs[87528] = uncalled;
    const flContest = await db.contest.findFirstOrThrow({ where: { sourceId: source.id, stateCode: 'FL', office: 'US_SENATE' } });
    await liveRun.cycle(new Date('2026-11-04T02:01:00Z'));
    assert.equal(await db.raceCall.count({ where: { contestId: flContest.id, retractedAt: null } }), 1);
    const retracted = await liveRun.cycle(new Date('2026-11-04T02:01:30Z'));
    assert(retracted.calls.some((line) => line.startsWith('FL-SEN') && line.includes('retracted')));
    assert.equal(await db.raceCall.count({ where: { contestId: flContest.id, retractedAt: null } }), 0);
    assert.equal(await db.raceCall.count({ where: { contestId: flContest.id } }), 1);

    // 6b. After a restart ME-SEN gets county detail (tier B to A), and its detail document is older than the
    // aggregate snapshot it has. It keeps its numbers, and that is a warning, not a failed race.
    const meDetail = {
      ...structuredClone((uncalled.region_results as Record<string, Record<string, unknown>>).me),
      test_data: false, last_updated: '2026-11-04T01:59:00.000Z', called_at: null, region_results: {},
    };
    feed.docs[meContest.sourceContestId!] = meDetail;
    const restarted = await ingestor(db, feed.fetchImpl, {
      tierA: { enabled: true, max: 60, override: ['GA-SEN', 'PA-07', 'ME-SEN'], detailMinIntervalSeconds: 0, detailRefreshSeconds: 600, detailRps: 10_000 },
    });
    const meBefore = (await db.contest.findUniqueOrThrow({ where: { id: meContest.id } })).currentSnapshotId;
    const switched = await restarted.cycle(new Date('2026-11-04T02:01:45Z'));
    assert.equal(switched.status, 'ok', switched.message);
    assert.equal(switched.rejected, 0);
    assert.equal((await db.contest.findUniqueOrThrow({ where: { id: meContest.id } })).currentSnapshotId, meBefore);
    assert(await db.ingestionError.findFirst({ where: { code: 'RESULTS_WARNING', message: { contains: 'ME-SEN: kept its aggregate snapshot' } } }));
    assert.equal((await db.dataSource.findUniqueOrThrow({ where: { id: source.id } })).healthStatus, 'CURRENT');
    delete feed.docs[meContest.sourceContestId!];

    // 7. A race missing from the catalog is rejected and logged; the others still publish.
    const extra = structuredClone(uncalled);
    (extra.region_results as Record<string, Record<string, unknown>>).me.election_id = 123456789;
    (extra.region_results as Record<string, { candidates: Array<Record<string, unknown>> }>).ga.candidates[0].votes = 1;
    feed.docs[87528] = extra;
    const partial = await liveRun.cycle(new Date('2026-11-04T02:02:00Z'));
    assert.equal(partial.rejected, 1);
    assert(await db.ingestionError.findFirst({ where: { code: 'RACE_REJECTED', recordKey: 'ME-SEN' } }));
    assert.equal((await db.dataSource.findUniqueOrThrow({ where: { id: source.id } })).healthStatus, 'DEGRADED');

    // 8. A second ingestor started by mistake skips while the lease is held.
    const token = await db.syncLease.create({ data: { name: 'results-civicapi', token: 'other', expiresAt: new Date(Date.now() + 60_000) } });
    assert.equal((await liveRun.cycle()).status, 'skipped');
    await db.syncLease.delete({ where: { name: token.name } });

    // 9. Three failed cycles in a row mark the source unavailable.
    const down = await ingestor(db, (async () => new Response('down', { status: 503 })) as unknown as typeof fetch, {});
    for (let i = 0; i < 3; i++) assert.equal((await down.cycle()).status, 'failed');
    assert.equal((await db.dataSource.findUniqueOrThrow({ where: { id: source.id } })).healthStatus, 'UNAVAILABLE');
  } finally {
    if (!process.env.KEEP_CIVICAPI_TEST_ROWS) await reset(db).catch(() => {});
    await db.$disconnect();
  }
});

test('tier A comes from the Kalshi hour at or before CIVICAPI_TIER_A_AS_OF, so restarts agree', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const early = new Date('2030-01-01T05:00:00Z');
  const late = new Date('2030-01-01T07:00:00Z');
  const marketIds = ['TIERTEST-GA', 'TIERTEST-PA07'];
  try {
    const source = await db.dataSource.upsert({
      where: { key: 'kalshi-tier-test' },
      create: { key: 'kalshi-tier-test', name: 'Kalshi tier test', type: 'OTHER', attributionText: 'test', isEnabled: false },
      update: {},
    });
    const row = (market: string, stateCode: string, districtCode: string | null, price: number, capturedHour: Date) => ({
      sourceId: source.id, provider: 'KALSHI' as const, scope: districtCode ? 'HOUSE_DISTRICT' as const : 'STATE_SENATE' as const,
      sourceEventId: market, sourceMarketId: market, outcome: 'yes', stateCode, districtCode, priceType: 'MIDPOINT' as const,
      price, capturedHour, fetchedAt: capturedHour,
    });
    await db.marketSnapshot.deleteMany({ where: { sourceMarketId: { in: marketIds } } });
    await db.marketSnapshot.createMany({
      data: [
        // Before the cutoff GA-SEN is close and PA-07 is not; on the night (later) it is the other way round.
        row(marketIds[0], 'GA', null, 0.55, early), row(marketIds[1], 'PA', '07', 0.95, early),
        row(marketIds[0], 'GA', null, 0.97, late), row(marketIds[1], 'PA', '07', 0.6, late),
      ],
    });
    const asOf = await chooseTierA(db, { max: 60, override: [], asOf: new Date('2030-01-01T06:30:00Z') });
    assert.deepEqual(asOf.labels, ['GA-SEN']);
    assert.match(asOf.reason, /2030-01-01T05:00:00/);
    assert.deepEqual((await chooseTierA(db, { max: 60, override: [], asOf: null })).labels, ['PA-07']);
    // With no prices at or before the cutoff, the latest hour is used.
    assert.deepEqual((await chooseTierA(db, { max: 60, override: [], asOf: new Date('1990-01-01T00:00:00Z') })).labels, ['PA-07']);
    assert.deepEqual((await chooseTierA(db, { max: 60, override: ['pa-7', 'ga-sen'], asOf: null })).labels, ['PA-07', 'GA-SEN']);
  } finally {
    await db.marketSnapshot.deleteMany({ where: { sourceMarketId: { in: marketIds } } }).catch(() => {});
    await db.dataSource.deleteMany({ where: { key: 'kalshi-tier-test' } }).catch(() => {});
    await db.$disconnect();
  }
});

test('aggregates whose last_updated stands still keep publishing, stamped with the cycle; stale copies are rejected; the tier A brake publishes', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    await reset(db);
    const source = await seedCatalog(db);
    // On Nov 3 both aggregates read last_updated Oct 23 while detail documents were current.
    const frozen = '2026-10-23T15:37:21.863Z';
    const at = (body: unknown, lastUpdated: string) => ({ ...live(body), last_updated: lastUpdated });
    type Regions = Record<string, { candidates: Array<Record<string, unknown>> }>;
    const senate = at(fixture('senate-aggregate.json'), frozen);
    const feed = server({
      87528: senate, 87524: at(fixture('house-aggregate.trimmed.json'), frozen),
      87087: at(fixture('race-ga-sen.trimmed.json'), '2026-11-04T01:30:00.000Z'), 87382: at(fixture('race-pa-07.json'), '2026-11-04T01:30:00.000Z'),
    });
    const contest = (sourceContestId: string) => db.contest.findFirstOrThrow({ where: { sourceId: source.id, sourceContestId }, include: { currentSnapshot: { include: { rawArtifact: true } } } });
    const meId = (senate.region_results as Record<string, { election_id: number }>).me.election_id.toString();

    const run = await ingestor(db, feed.fetchImpl, {});
    const t1 = new Date('2026-11-04T02:00:00Z');
    assert.equal((await run.cycle(t1)).published, 45);
    const me1 = await contest(meId);
    assert.equal(me1.currentSnapshot?.sourceUpdatedAt?.toISOString(), t1.toISOString());
    assert.equal(me1.currentSnapshot?.rawArtifact?.sourceUpdatedAt?.toISOString(), frozen);
    // Tier A keeps the race's own time from its detail document.
    assert.equal((await contest('87087')).currentSnapshot?.sourceUpdatedAt?.toISOString(), '2026-11-04T01:30:00.000Z');

    // 1. A moved count publishes although last_updated has not moved, and its "as of" time is that cycle's.
    const moved = structuredClone(senate);
    (moved.region_results as Regions).me.candidates[0].votes = 54321;
    feed.docs[87528] = moved;
    const t2 = new Date('2026-11-04T02:00:30Z');
    const second = await run.cycle(t2);
    assert.equal(second.published, 1);
    assert.equal(second.rejected, 0);
    assert.equal((await contest(meId)).currentSnapshot?.sourceUpdatedAt?.toISOString(), t2.toISOString());
    const shown = await dbCurrentResult(db, readConfig(false), me1.id);
    assert.equal(shown?.data?.updatedAt, t2.toISOString());

    // 2. A stale copy (older last_updated than the document behind the current snapshot) is still rejected.
    const stale = structuredClone(senate);
    stale.last_updated = '2026-10-22T00:00:00.000Z';
    (stale.region_results as Regions).me.candidates[0].votes = 11;
    feed.docs[87528] = stale;
    const third = await run.cycle(new Date('2026-11-04T02:01:00Z'));
    assert.equal(third.rejected, 1);
    assert(await db.ingestionError.findFirst({ where: { code: 'RACE_REJECTED', recordKey: 'ME-SEN', message: { contains: 'older' } } }));
    assert.equal((await contest(meId)).currentSnapshot?.sourceUpdatedAt?.toISOString(), t2.toISOString());

    // 3. County detail switched off (the database-size brake, or a race demoted after failed details): the race's
    // next change publishes from the aggregate, although the aggregate's last_updated is older than its detail's.
    const gaMoved = structuredClone(moved);
    (gaMoved.region_results as Regions).ga.candidates[0].votes = 777777;
    feed.docs[87528] = gaMoved;
    const braked = await ingestor(db, feed.fetchImpl, { tierA: { enabled: false, max: 60, override: [], detailMinIntervalSeconds: 0, detailRefreshSeconds: 600, detailRps: 10_000 } });
    const t4 = new Date('2026-11-04T02:01:30Z');
    const fourth = await braked.cycle(t4);
    assert.equal(fourth.rejected, 0, fourth.message);
    const ga = await contest('87087');
    assert.equal(ga.currentSnapshot?.sourceUpdatedAt?.toISOString(), t4.toISOString());
    assert.equal(await db.candidateVote.count({ where: { snapshotId: ga.currentSnapshotId!, votes: 777777 } }), 1);
  } finally {
    if (!process.env.KEEP_CIVICAPI_TEST_ROWS) await reset(db).catch(() => {});
    await db.$disconnect();
  }
});

test('one aggregate failing does not hold back the other chamber; both failing fails the cycle', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    await reset(db);
    const source = await seedCatalog(db);
    const senate = live(fixture('senate-aggregate.json'));
    const feed = server({ 87528: senate, 87524: live(fixture('house-aggregate.trimmed.json')), 87087: live(fixture('race-ga-sen.trimmed.json')), 87382: live(fixture('race-pa-07.json')) });
    const down = new Set<string>(['87528']);
    const fetchImpl = (async (url: string) => {
      const id = /\/race\/(\d+)$/.exec(url)?.[1] ?? '';
      return down.has(id) ? new Response('Bad Gateway', { status: 502 }) : feed.fetchImpl(url);
    }) as unknown as typeof fetch;
    const meId = (senate.region_results as Record<string, { election_id: number }>).me.election_id.toString();
    const snapshotOf = async (sourceContestId: string) => (await db.contest.findFirstOrThrow({ where: { sourceId: source.id, sourceContestId } })).currentSnapshotId;
    const run = await ingestor(db, fetchImpl, {});

    // 1. The Senate aggregate answers 502: House races still publish, Senate races wait, and the source says so.
    const partial = await run.cycle(new Date('2026-11-04T02:00:00Z'));
    assert.equal(partial.status, 'ok', partial.message);
    assert.match(partial.message, /Senate aggregate: .*502/);
    assert(partial.published > 0);
    assert.notEqual(await snapshotOf('87382'), null);
    assert.equal(await snapshotOf(meId), null);
    assert.equal((await db.dataSource.findUniqueOrThrow({ where: { id: source.id } })).healthStatus, 'DEGRADED');
    assert(await db.ingestionError.findFirst({ where: { code: 'RESULTS_WARNING', message: { contains: 'Senate aggregate' } } }));

    // 2. It answers again: the Senate publishes and the source is current.
    down.clear();
    const back = await run.cycle(new Date('2026-11-04T02:00:30Z'));
    assert.equal(back.status, 'ok', back.message);
    assert.notEqual(await snapshotOf(meId), null);
    assert.equal((await db.dataSource.findUniqueOrThrow({ where: { id: source.id } })).healthStatus, 'CURRENT');

    // 3. Both down: the cycle fails, and three in a row mark the source unavailable.
    down.add('87528').add('87524');
    for (let i = 0; i < 3; i++) assert.equal((await run.cycle(new Date(`2026-11-04T02:0${1 + i}:00Z`))).status, 'failed');
    assert.equal((await db.dataSource.findUniqueOrThrow({ where: { id: source.id } })).healthStatus, 'UNAVAILABLE');
  } finally {
    if (!process.env.KEEP_CIVICAPI_TEST_ROWS) await reset(db).catch(() => {});
    await db.$disconnect();
  }
});

test('finals pass: every race from detail with counties, after night aggregates stamped later; unchanged writes nothing; failures and certified states', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    await reset(db);
    const source = await seedCatalog(db);
    const senate = live(fixture('senate-aggregate.json'));
    const house = live(fixture('house-aggregate.trimmed.json'));
    const feed = server({ 87528: senate, 87524: house });

    // Election night: every race from the aggregates, stamped with the cycle (Nov 4, 02:00).
    const night = await ingestor(db, feed.fetchImpl, { tierA: { enabled: false, max: 0, override: [], detailMinIntervalSeconds: 0, detailRefreshSeconds: 600, detailRps: 10_000 } });
    const nightCycle = await night.cycle(new Date('2026-11-04T02:00:00Z'));
    assert.equal(nightCycle.status, 'ok', nightCycle.message);
    const races = nightCycle.published;
    assert.equal(races, 45);

    // After the election: a detail document per race, whose last_updated (Nov 4, 01:00) is older than the night's
    // cycle stamp. GA-SEN has its real counties; the others are their aggregate rows with no counties.
    const regions = [
      ...Object.values(senate.region_results as Record<string, Record<string, unknown>>),
      ...Object.values(house.region_results as Record<string, Record<string, unknown>>),
    ];
    for (const region of regions) {
      feed.docs[String(region.election_id)] = { ...structuredClone(region), test_data: false, last_updated: '2026-11-04T01:00:00.000Z', called_at: null, region_results: {} };
    }
    feed.docs[87087] = { ...live(fixture('race-ga-sen.trimmed.json')), last_updated: '2026-11-04T01:00:00.000Z' };
    const stored: string[] = [];
    const artifactStore = { describe: 'memory', async put(name: string) { stored.push(name); return `bucket:raw/civicapi/${name}`; } };
    const finals = await ingestor(db, feed.fetchImpl, { artifactStore, tierA: { enabled: false, max: 0, override: [], detailMinIntervalSeconds: 0, detailRefreshSeconds: 600, detailRps: 10_000 } });
    const first = await finals.finalsPass();
    assert.equal(first.status, 'ok', first.message);
    assert.equal(first.races, races);
    assert.equal(first.published, races, first.message);
    assert.equal(first.failures.length, 0, first.message);
    const gaContest = await db.contest.findFirstOrThrow({ where: { sourceContestId: '87087' }, include: { currentSnapshot: { include: { rawArtifact: true } } } });
    assert(gaContest.currentSnapshot);
    // Stamped with the pass, not the document's last_updated, so it replaces the night's snapshot.
    assert(gaContest.currentSnapshot.sourceUpdatedAt! > new Date('2026-11-04T02:00:00Z'));
    // The race-level row plus its 6 counties.
    assert.equal(await db.contestMetric.count({ where: { snapshotId: gaContest.currentSnapshot.id } }), 7);
    // A race whose finals document only adds counties (same totals) keeps the time its count last changed.
    const me = await db.contest.findFirstOrThrow({ where: { sourceId: source.id, stateCode: 'FL', office: 'US_SENATE' }, include: { currentSnapshot: true } });
    assert.equal(me.currentSnapshot?.countChangedAt?.toISOString(), '2026-11-04T02:00:00.000Z');
    const meResult = await dbCurrentResult(db, readConfig(false), me.id, new Date('2026-11-12T20:00:00Z'));
    assert.equal(meResult?.data?.finalStatus?.status, 'STABLE');
    assert.equal(meResult?.data?.finalStatus?.label, 'Unofficial · no change since Nov 3');
    // Source documents went to the store, not the disk.
    assert(stored.length >= races && stored.every((name) => name.startsWith('sha256/')));
    assert.match(gaContest.currentSnapshot.rawArtifact!.storageKey, /^bucket:raw\/civicapi\/sha256\//);

    // The same numbers again write nothing, though last_updated moves on every request.
    for (const doc of Object.values(feed.docs) as Array<Record<string, unknown>>) doc.last_updated = '2026-11-12T18:00:00.000Z';
    const snapshots = await db.resultSnapshot.count({ where: { sourceId: source.id } });
    const second = await finals.finalsPass();
    assert.equal(second.published, 0, second.message);
    assert.equal(second.unchanged, races);
    assert.equal(await db.resultSnapshot.count({ where: { sourceId: source.id } }), snapshots);

    // A race civicAPI fails keeps its numbers and is listed; the rest are read.
    const paId = (await db.contest.findFirstOrThrow({ where: { sourceId: source.id, stateCode: 'PA', districtCode: '07' } })).sourceContestId!;
    const paDoc = feed.docs[paId];
    delete feed.docs[paId];
    const failed = await finals.finalsPass();
    assert.equal(failed.status, 'ok');
    assert.deepEqual(failed.failures.map((failure) => failure.label), ['PA-07']);
    assert.equal((await db.ingestionRun.findFirstOrThrow({ where: { sourceId: source.id }, orderBy: { startedAt: 'desc' } })).status, 'PARTIAL');
    feed.docs[paId] = paDoc;

    // A state whose certification is recorded is skipped, unless the pass names it.
    await db.certificationEvent.create({
      data: { contestId: gaContest.id, sourceId: source.id, type: 'CERTIFIED', certification: 'CERTIFIED', effectiveAt: new Date('2026-11-20T00:00:00Z'), sourceUrl: 'https://sos.ga.gov/' },
    });
    const skipping = await finals.finalsPass();
    assert.equal(skipping.certifiedSkipped, 1);
    assert.equal(skipping.races, races - 1);
    const named = await finals.finalsPass({ states: ['ga'] });
    // GA-SEN and GA-13.
    assert.equal(named.races, 2);
    assert.equal(named.certifiedSkipped, 0);
  } finally {
    if (!process.env.KEEP_CIVICAPI_TEST_ROWS) await reset(db).catch(() => {});
    await db.$disconnect();
  }
});

test('certification: a state-wide entry reaches every race, shows as certified with its source; recounts, deadlines, ranked choice and bad input', { skip: !testDatabaseUrl }, async () => {
  const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const read = (id: string) => dbCurrentResult(db, readConfig(false), id, new Date('2026-12-10T20:00:00Z'));
  try {
    await reset(db);
    await db.certificationDeadline.deleteMany({});
    const source = await seedCatalog(db);
    const feed = server({ 87528: live(fixture('senate-aggregate.json')), 87524: live(fixture('house-aggregate.trimmed.json')) });
    const night = await ingestor(db, feed.fetchImpl, { tierA: { enabled: false, max: 0, override: [], detailMinIntervalSeconds: 0, detailRefreshSeconds: 600, detailRps: 10_000 } });
    assert.equal((await night.cycle(new Date('2026-11-04T02:00:00Z'))).status, 'ok');

    // Georgia: the Senate race and GA-13 are both certified by one entry.
    const recorded = await recordEvent(db, { state: 'ga', type: 'CERTIFIED', effectiveAt: '2026-11-10T17:00:00Z', sourceUrl: 'https://sos.ga.gov/election-results' });
    assert.deepEqual(recorded.races.sort(), ['GA-13', 'GA-SEN']);
    const ga = await db.contest.findFirstOrThrow({ where: { sourceId: source.id, stateCode: 'GA', office: 'US_SENATE' } });
    const certified = await read(ga.id);
    ElectionResultsResponseSchema.parse(certified);
    assert.equal(certified?.data?.certificationState, 'CERTIFIED');
    assert.equal(certified?.data?.status, 'COMPLETE');
    assert.equal(certified?.data?.finalStatus?.label, 'Certified Nov 10');
    assert.equal(certified?.data?.finalStatus?.sourceUrl, 'https://sos.ga.gov/election-results');

    // One race's recount, then a deadline for its state.
    const fl = await db.contest.findFirstOrThrow({ where: { sourceId: source.id, stateCode: 'FL', office: 'US_SENATE' } });
    await recordEvent(db, { state: 'FL', race: 'FL-SEN', type: 'RECOUNT_STARTED', effectiveAt: '2026-11-09T15:00:00Z', sourceUrl: 'https://dos.fl.gov/elections/', notes: 'Machine recount: margin under 0.5%' });
    await setDeadline(db, { state: 'FL', deadline: '2026-11-17', sourceUrl: 'https://dos.fl.gov/elections/' });
    const recount = await read(fl.id);
    assert.equal(recount?.data?.finalStatus?.status, 'RECOUNT');
    assert.equal(recount?.data?.finalStatus?.notes, 'Machine recount: margin under 0.5%');
    assert.equal(recount?.data?.finalStatus?.certificationDeadline, '2026-11-17');
    assert.equal(recount?.data?.certificationState, 'UNOFFICIAL');
    // Removed as a mistake, the race goes back to its count-based status.
    assert.equal((await removeLatestEvent(db, { state: 'FL', race: 'FL-SEN' })).removed, 1);
    assert.equal((await read(fl.id))?.data?.finalStatus?.status, 'STABLE');

    // Alaska's ranked-choice final round, from the state, beside first choices.
    const ak = await db.contest.findFirstOrThrow({ where: { sourceId: source.id, stateCode: 'AK', office: 'US_SENATE' }, include: { candidacies: true } });
    const [first, second] = ak.candidacies;
    await setRankedChoiceRound(db, { contestId: ak.id, round: 3, sourceUrl: 'https://www.elections.alaska.gov/', results: [
      { candidacyId: first.id, votes: 160_000, isWinner: true }, { candidacyId: second.id, votes: 150_000, isWinner: false },
    ] });
    const rcv = await read(ak.id);
    assert.equal(rcv?.data?.finalStatus?.rankedChoiceFinalRound?.round, 3);
    assert.equal(rcv?.data?.finalStatus?.rankedChoiceFinalRound?.results[0].votes, 160_000);

    // The overview and the totals for comparing with the state.
    const overview = await certificationOverview(db);
    const gaRow = overview.find((row) => row.state === 'GA');
    assert.equal(gaRow?.certified, 2);
    assert.equal(overview.find((row) => row.state === 'FL')?.deadline?.deadline, '2026-11-17');
    const totals = await stateTotals(db, 'GA');
    assert(totals.find((race) => race.race === 'GA-SEN')!.candidates.length >= 2);
    assert(totals.every((race) => race.totalVotes !== null));

    // Bad input is refused, and nothing is written.
    await assert.rejects(recordEvent(db, { state: 'GA', type: 'CERTIFIED', effectiveAt: '2026-11-10', sourceUrl: 'sos.ga.gov' }), CertificationInputError);
    await assert.rejects(recordEvent(db, { state: 'GA', type: 'CORRECTED', effectiveAt: '2026-11-10', sourceUrl: 'https://sos.ga.gov/' }), /numbers in the notes/);
    await assert.rejects(recordEvent(db, { state: 'ZZ', type: 'CERTIFIED', effectiveAt: '2026-11-10', sourceUrl: 'https://example.gov/' }), /No 2026 federal races/);
    await assert.rejects(setRankedChoiceRound(db, { contestId: ak.id, round: 3, sourceUrl: 'https://www.elections.alaska.gov/', results: [
      { candidacyId: first.id, votes: 1, isWinner: true }, { candidacyId: second.id, votes: 1, isWinner: true },
    ] }), /exactly one winner/);
    assert.equal(await db.certificationEvent.count({ where: { contest: { stateCode: 'GA' } } }), 2);
  } finally {
    await db.certificationDeadline.deleteMany({}).catch(() => {});
    if (!process.env.KEEP_CIVICAPI_TEST_ROWS) await reset(db).catch(() => {});
    await db.$disconnect();
  }
});
