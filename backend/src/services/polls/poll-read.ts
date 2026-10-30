/**
 * Read model for GET /api/polls: a race's published polls, newest first, and
 * its polling average. Only PUBLISHED polls are ever read here; polls waiting
 * for review or rejected never reach a public response.
 */
import type { PrismaClient as PollsPrismaClient } from '@prisma-polls/client';
import { computeAverage, type AverageInputPoll, type PollAverage } from './average.js';
import { VOTEHUB_ATTRIBUTION, VOTEHUB_HOMEPAGE_URL, VOTEHUB_LICENSE_URL, VOTEHUB_SOURCE } from './votehub-client.js';

/** PA-SEN, PA-07, AK-00. */
export const RACE_CODE = /^[A-Z]{2}-(SEN|\d{2})$/;
/** Enough history for the average and the list; a race rarely has this many. */
const MAX_POLLS_READ = 200;
const DEFAULT_LIST_LIMIT = 25;

export class PollsNotLoadedError extends Error {
  constructor() {
    super('Polls have not been loaded yet. Run `npm run sync:polls`.');
    this.name = 'PollsNotLoadedError';
  }
}

export interface PollView {
  id: string;
  pollster: string;
  sponsors: string[];
  startDate: string | null;
  endDate: string;
  sampleSize: number | null;
  population: string;
  isInternal: boolean;
  url: string | null;
  /** Counted in the polling average (the newest from its pollster, inside the window). */
  inAverage: boolean;
  answers: Array<{ choice: string; pct: number; party: string | null; candidateFecId: string | null }>;
}

export interface PollsSourceView {
  name: string;
  attribution: string;
  licenseUrl: string;
  homepageUrl: string;
  /** When the last sync that fetched anything finished. */
  lastSyncedAt: string | null;
}

export interface RacePollsResponse {
  race: string;
  average: PollAverage;
  polls: PollView[];
  /** Published polls for the race, of which `polls` is the newest `limit`. */
  totalPolls: number;
  source: PollsSourceView;
}

export interface ReadOptions {
  now?: Date;
  /** Read only this source's polls and runs. Tests use their own; normally every source's polls are read. */
  source?: string;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

async function sourceView(db: PollsPrismaClient, source: string): Promise<PollsSourceView> {
  const lastRun = await db.pollSyncRun.findFirst({
    where: { source, status: { in: ['SUCCEEDED', 'PARTIAL'] } },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true },
  });
  if (!lastRun) throw new PollsNotLoadedError();
  return {
    name: 'VoteHub',
    attribution: VOTEHUB_ATTRIBUTION,
    licenseUrl: VOTEHUB_LICENSE_URL,
    homepageUrl: VOTEHUB_HOMEPAGE_URL,
    lastSyncedAt: lastRun.completedAt?.toISOString() ?? null,
  };
}

async function publishedPolls(db: PollsPrismaClient, races: string[], source?: string) {
  return db.poll.findMany({
    where: { raceCode: { in: races }, status: 'PUBLISHED', ...(source ? { source } : {}) },
    orderBy: [{ endDate: 'desc' }, { pollster: 'asc' }],
    take: MAX_POLLS_READ * races.length,
    select: {
      id: true,
      raceCode: true,
      pollster: true,
      sponsors: true,
      startDate: true,
      endDate: true,
      sampleSize: true,
      population: true,
      isInternal: true,
      url: true,
      answers: { orderBy: { sortOrder: 'asc' }, select: { choice: true, pct: true, party: true, candidateFecId: true } },
    },
  });
}

type Row = Awaited<ReturnType<typeof publishedPolls>>[number];

function toView(row: Row, inAverage: boolean): PollView {
  return {
    id: row.id,
    pollster: row.pollster,
    sponsors: row.sponsors,
    startDate: row.startDate ? isoDay(row.startDate) : null,
    endDate: isoDay(row.endDate),
    sampleSize: row.sampleSize,
    population: row.population,
    isInternal: row.isInternal,
    url: row.url,
    inAverage,
    answers: row.answers.map((answer) => ({ choice: answer.choice, pct: answer.pct.toNumber(), party: answer.party, candidateFecId: answer.candidateFecId })),
  };
}

function averageOf(rows: Row[], asOf: string): PollAverage {
  const inputs: AverageInputPoll[] = rows.map((row) => toView(row, false));
  return computeAverage(inputs, asOf);
}

export async function getRacePolls(
  db: PollsPrismaClient,
  race: string,
  options: ReadOptions & { limit?: number } = {},
): Promise<RacePollsResponse> {
  const { now = new Date(), limit = DEFAULT_LIST_LIMIT } = options;
  const [source, rows] = await Promise.all([sourceView(db, options.source ?? VOTEHUB_SOURCE), publishedPolls(db, [race], options.source)]);
  const average = averageOf(rows, isoDay(now));
  const used = new Set(average.pollIds);
  return {
    race,
    average,
    polls: rows.slice(0, limit).map((row) => toView(row, used.has(row.id))),
    totalPolls: rows.length,
    source,
  };
}

/** Averages only, for lists of races (a state's House seats, the monitor's race list). */
export async function getRaceAverages(
  db: PollsPrismaClient,
  races: string[],
  options: ReadOptions = {},
): Promise<{ averages: Record<string, PollAverage>; source: PollsSourceView }> {
  const { now = new Date() } = options;
  const [source, rows] = await Promise.all([sourceView(db, options.source ?? VOTEHUB_SOURCE), publishedPolls(db, races, options.source)]);
  const byRace = new Map<string, Row[]>(races.map((race) => [race, []]));
  for (const row of rows) if (row.raceCode) byRace.get(row.raceCode)?.push(row);
  const asOf = isoDay(now);
  return { averages: Object.fromEntries([...byRace].map(([race, raceRows]) => [race, averageOf(raceRows, asOf)])), source };
}
