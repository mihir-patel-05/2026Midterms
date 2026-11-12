/**
 * How each 2026 Kalshi race market settled (#136, docs/plans/lock-2026-record.md). The live catalog lists open
 * markets only, so the markets come from the prices we stored (`market_snapshots`), read again from Kalshi one
 * event at a time. A market is stored once Kalshi reports its result; markets still open are counted, never
 * guessed. Settlements are not prices and stay out of `market_snapshots`.
 *
 * Kalshi's API docs were not reachable when this was written, so the parser accepts the field names Kalshi has
 * used (`result`, `settlement_value_dollars` or `settlement_value` in cents, `settlement_ts`) and logs the field
 * names of the first market it cannot read, so a different shape shows in the logs instead of as wrong data.
 */
import type { MarketSettlementResult, Prisma, PrismaClient } from '@prisma/client';
import { KALSHI_SOURCE_KEY } from './snapshots.js';

export interface KalshiMarketSettlementFields {
  ticker?: string;
  status?: string;
  result?: string;
  settlement_value?: number | string | null;
  settlement_value_dollars?: string | null;
  settlement_ts?: string | null;
  [key: string]: unknown;
}

export interface ParsedSettlement {
  result: MarketSettlementResult;
  settlementValue: number | null;
  settledAt: Date | null;
  venueStatus: string;
}

const SETTLED_STATUSES = new Set(['settled', 'finalized', 'determined']);
const RESULTS: Record<string, MarketSettlementResult> = { yes: 'YES', no: 'NO', void: 'VOID' };

/** The settlement, or null while the market has no result (still open, closed awaiting determination). */
export function parseSettlement(market: KalshiMarketSettlementFields): ParsedSettlement | null {
  const status = String(market.status ?? '').toLowerCase();
  const result = RESULTS[String(market.result ?? '').toLowerCase()];
  if (!result || !SETTLED_STATUSES.has(status)) return null;
  let value: number | null = null;
  if (typeof market.settlement_value_dollars === 'string' && market.settlement_value_dollars.trim() !== '') value = Number(market.settlement_value_dollars);
  else if (market.settlement_value !== null && market.settlement_value !== undefined && market.settlement_value !== '') value = Number(market.settlement_value) / 100;
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1)) value = null;
  const settledAt = market.settlement_ts ? new Date(market.settlement_ts) : null;
  return { result, settlementValue: value, settledAt: settledAt && !Number.isNaN(settledAt.getTime()) ? settledAt : null, venueStatus: status };
}

export interface SettlementReport {
  markets: number;
  settled: number;
  newlySettled: number;
  open: number;
  failedEvents: string[];
  unreadable: number;
}

type Fetch = <T>(url: string) => Promise<T | null>;

/** Reads every stored 2026 race market not yet settled, one Kalshi event at a time, and stores those that settled. */
export async function syncSettlements(db: PrismaClient, restUrl: string, fetchJson: Fetch, since = new Date('2026-10-01T00:00:00Z')): Promise<SettlementReport> {
  const source = await db.dataSource.findUnique({ where: { key: KALSHI_SOURCE_KEY }, select: { id: true } });
  if (!source) throw new Error('No Kalshi data source; no prices were ever stored');
  // The newest stored row of each market: its event, race and outcome.
  const markets = await db.marketSnapshot.findMany({
    where: { provider: 'KALSHI', capturedHour: { gte: since } },
    distinct: ['sourceMarketId'],
    orderBy: [{ sourceMarketId: 'asc' }, { capturedHour: 'desc' }],
    select: { sourceEventId: true, sourceMarketId: true, scope: true, stateCode: true, districtCode: true, contestId: true, outcome: true },
  });
  const done = new Set((await db.marketSettlement.findMany({ where: { provider: 'KALSHI' }, select: { sourceMarketId: true } })).map((row) => row.sourceMarketId));
  const pending = markets.filter((market) => !done.has(market.sourceMarketId));
  const byEvent = new Map<string, typeof pending>();
  for (const market of pending) byEvent.set(market.sourceEventId, [...(byEvent.get(market.sourceEventId) ?? []), market]);

  // Stored prices carry state and district but no contest; settlements are linked to the 2026 race here.
  const contests = await db.contest.findMany({
    where: { office: { in: ['US_SENATE', 'US_HOUSE'] }, electionEvent: { cycle: 2026 }, stateCode: { not: null } },
    select: { id: true, office: true, stateCode: true, districtCode: true },
  });
  const contestFor = new Map(contests.map((contest) => [contest.office === 'US_SENATE' ? `SEN:${contest.stateCode}` : `HOUSE:${contest.stateCode}-${contest.districtCode}`, contest.id]));
  const raceContest = (market: (typeof pending)[number]) => market.contestId
    ?? (market.scope === 'STATE_SENATE' ? contestFor.get(`SEN:${market.stateCode}`) : market.scope === 'HOUSE_DISTRICT' ? contestFor.get(`HOUSE:${market.stateCode}-${market.districtCode}`) : undefined)
    ?? null;

  const report: SettlementReport = { markets: markets.length, settled: done.size, newlySettled: 0, open: 0, failedEvents: [], unreadable: 0 };
  let loggedShape = false;
  const fetchedAt = new Date();
  for (const [eventTicker, eventMarkets] of byEvent) {
    let body: { event?: { markets?: KalshiMarketSettlementFields[] }; markets?: KalshiMarketSettlementFields[] } | null;
    try {
      body = await fetchJson(`${restUrl}/events/${encodeURIComponent(eventTicker)}?with_nested_markets=true`);
    } catch (error) {
      report.failedEvents.push(`${eventTicker}: ${error instanceof Error ? error.message : error}`);
      continue;
    }
    const found = new Map((body?.event?.markets ?? body?.markets ?? []).map((market) => [market.ticker, market]));
    const rows: Prisma.MarketSettlementCreateManyInput[] = [];
    for (const market of eventMarkets) {
      const venue = found.get(market.sourceMarketId);
      const settlement = venue ? parseSettlement(venue) : null;
      if (!settlement) {
        report.open++;
        // A market Kalshi says is settled but whose result we cannot read is a shape we do not know.
        if (venue && SETTLED_STATUSES.has(String(venue.status ?? '').toLowerCase())) {
          report.unreadable++;
          if (!loggedShape) {
            loggedShape = true;
            console.warn(`[kalshi-settlements] ${market.sourceMarketId} is ${venue.status} but has no readable result; fields: ${Object.keys(venue).sort().join(', ')}`);
          }
        }
        continue;
      }
      rows.push({
        sourceId: source.id, provider: 'KALSHI', scope: market.scope, sourceEventId: eventTicker, sourceMarketId: market.sourceMarketId,
        contestId: raceContest(market), stateCode: market.stateCode, districtCode: market.districtCode, outcome: market.outcome,
        result: settlement.result, settlementValue: settlement.settlementValue, settledAt: settlement.settledAt, venueStatus: settlement.venueStatus, fetchedAt,
      });
    }
    if (rows.length > 0) {
      const written = await db.marketSettlement.createMany({ data: rows, skipDuplicates: true });
      report.newlySettled += written.count;
    }
  }
  report.settled += report.newlySettled;
  return report;
}

const partyOf = (text: string): 'D' | 'R' | null => (/democrat/i.test(text) ? 'D' : /republican/i.test(text) ? 'R' : null);

export interface SettlementDisagreement {
  race: string;
  market: string;
  settledOutcome: string;
  winner: string;
}

/**
 * Races whose market settled YES on an outcome that is not the race's winner (by party, or by surname for
 * same-party races), for the admin to look into. Nothing is changed automatically.
 */
export async function settlementDisagreements(db: PrismaClient): Promise<SettlementDisagreement[]> {
  const settled = await db.marketSettlement.findMany({
    where: { provider: 'KALSHI', result: 'YES', scope: { in: ['STATE_SENATE', 'HOUSE_DISTRICT'] }, stateCode: { not: null } },
    select: { sourceMarketId: true, outcome: true, scope: true, stateCode: true, districtCode: true },
  });
  const contests = await db.contest.findMany({
    where: { office: { in: ['US_SENATE', 'US_HOUSE'] }, electionEvent: { cycle: 2026 }, raceCalls: { some: { kind: 'WINNER', retractedAt: null, isTestData: false } } },
    select: {
      office: true, stateCode: true, districtCode: true,
      raceCalls: { where: { kind: 'WINNER', retractedAt: null, isTestData: false }, select: { candidacy: { select: { ballotName: true, person: { select: { displayName: true } }, party: { select: { name: true } } } } } },
    },
  });
  const winners = new Map(contests.map((contest) => [
    contest.office === 'US_SENATE' ? `${contest.stateCode}-SEN` : `${contest.stateCode}-${contest.districtCode}`,
    contest.raceCalls.map((call) => ({ name: call.candidacy.ballotName ?? call.candidacy.person.displayName, party: call.candidacy.party?.name ?? '' })),
  ]));
  const out: SettlementDisagreement[] = [];
  for (const market of settled) {
    const race = market.scope === 'STATE_SENATE' ? `${market.stateCode}-SEN` : `${market.stateCode}-${market.districtCode}`;
    const called = winners.get(race);
    if (!called || called.length === 0) continue;
    const outcomeParty = partyOf(market.outcome);
    const matches = called.some((winner) => {
      if (outcomeParty) return partyOf(winner.party) === outcomeParty;
      const surname = winner.name.trim().split(/\s+/).pop()?.toLowerCase() ?? '';
      return surname.length > 0 && market.outcome.toLowerCase().includes(surname);
    });
    if (!matches) out.push({ race, market: market.sourceMarketId, settledOutcome: market.outcome, winner: called.map((winner) => `${winner.name} (${winner.party || 'no party'})`).join(', ') });
  }
  return out.sort((a, b) => a.race.localeCompare(b.race));
}
