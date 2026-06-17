import { prisma } from '../config/database.js';
import { LOBBIES, LobbyDefinition } from '../data/lobbies.js';

export interface LobbyContributor {
  name: string;
  employer: string | null;
  amount: number;
  count: number;
}

export interface LobbyBucket {
  id: string;
  name: string;
  description: string;
  color: string;
  totalAmount: number;
  contributionCount: number;
  percentageOfReceipts: number;
  topContributors: LobbyContributor[];
}

export interface LobbyBreakdownResult {
  candidateId: string;
  candidateName: string;
  cycle: number;
  totalReceipts: number;
  totalLobbyAmount: number;
  classifiedPercentage: number;
  lobbies: LobbyBucket[];
  lastComputed: string;
  notes: string[];
}

/**
 * Strip regex-only tokens so a pattern can be used as a SQL ILIKE substring.
 * (Word boundaries / character classes are dropped — final classification
 * still uses real regex on the in-memory result, this is just a coarse
 * pre-filter to limit how many rows we pull from the DB.)
 */
function patternToSqlSubstring(pattern: string): string {
  return pattern
    .replace(/\\b/g, '')
    .replace(/\.\*/g, ' ')
    .replace(/\\\./g, '.')
    .replace(/[\^$()|+?{}[\]]/g, '')
    .trim();
}

// Compiles a single pattern from LOBBIES into a RegExp. Only ever called
// at module load over the static, developer-controlled LOBBIES constant
// (see COMPILED below) — never reachable from request input, so no ReDoS
// surface despite accepting `string`.
function compilePattern(pattern: string): RegExp {
  return new RegExp(pattern, 'i');
}

interface CompiledLobby extends LobbyDefinition {
  nameRegexes: RegExp[];
  employerRegexes: RegExp[];
  committeeIdSet: Set<string>;
}

const COMPILED: CompiledLobby[] = LOBBIES.map((l) => ({
  ...l,
  nameRegexes: l.namePatterns.map(compilePattern),
  employerRegexes: l.employerPatterns.map(compilePattern),
  committeeIdSet: new Set(l.committeeIds),
}));

function matchLobby(
  contributorName: string | null,
  contributorEmployer: string | null,
): CompiledLobby | null {
  for (const lobby of COMPILED) {
    if (contributorName) {
      for (const re of lobby.nameRegexes) {
        if (re.test(contributorName)) return lobby;
      }
    }
    if (contributorEmployer) {
      for (const re of lobby.employerRegexes) {
        if (re.test(contributorEmployer)) return lobby;
      }
    }
  }
  return null;
}

export class LobbyService {
  /**
   * Get the static catalog of supported lobbies (for UI legends, filters).
   */
  getLobbyCatalog(): { id: string; name: string; description: string; color: string }[] {
    return LOBBIES.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      color: l.color,
    }));
  }

  /**
   * Aggregate a candidate's receipts into lobby buckets.
   *
   * Strategy:
   *   1. Find the candidate's committees.
   *   2. Pre-filter receipts in SQL via a giant OR of ILIKE substrings
   *      (so we don't scan tens of thousands of rows in JS).
   *   3. Classify each candidate receipt in JS using the compiled regexes,
   *      bucket by lobby, and track top contributors.
   *   4. Compute percentage of *total* receipts for context.
   */
  async getLobbyBreakdown(
    candidateDbId: string,
    cycle: number = 2026,
  ): Promise<LobbyBreakdownResult> {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateDbId },
      include: { committees: true },
    });

    if (!candidate) {
      throw new Error('Candidate not found');
    }

    const committeeIds = candidate.committees.map((c) => c.committeeId);
    const buckets = new Map<string, LobbyBucket>();
    const contributorByLobby = new Map<string, Map<string, LobbyContributor>>();

    for (const lobby of COMPILED) {
      buckets.set(lobby.id, {
        id: lobby.id,
        name: lobby.name,
        description: lobby.description,
        color: lobby.color,
        totalAmount: 0,
        contributionCount: 0,
        percentageOfReceipts: 0,
        topContributors: [],
      });
      contributorByLobby.set(lobby.id, new Map());
    }

    if (committeeIds.length === 0) {
      return {
        candidateId: candidate.candidateId,
        candidateName: candidate.name,
        cycle,
        totalReceipts: 0,
        totalLobbyAmount: 0,
        classifiedPercentage: 0,
        lobbies: Array.from(buckets.values()),
        lastComputed: new Date().toISOString(),
        notes: ['No committees on file for this candidate.'],
      };
    }

    // Build the OR pre-filter from every name/employer pattern across all lobbies.
    const orFilters: object[] = [];
    for (const lobby of LOBBIES) {
      for (const pattern of lobby.namePatterns) {
        const term = patternToSqlSubstring(pattern);
        if (term.length >= 2) {
          orFilters.push({ contributorName: { contains: term, mode: 'insensitive' } });
        }
      }
      for (const pattern of lobby.employerPatterns) {
        const term = patternToSqlSubstring(pattern);
        if (term.length >= 2) {
          orFilters.push({ contributorEmployer: { contains: term, mode: 'insensitive' } });
        }
      }
    }

    // Cycle window: a 2-year cycle covers donations from Jan of the prior odd
    // year through Dec of the cycle year (e.g. cycle=2026 → 2025-01-01..2026-12-31).
    const cycleStart = new Date(`${cycle - 1}-01-01T00:00:00Z`);
    const cycleEnd = new Date(`${cycle}-12-31T23:59:59Z`);

    const [candidateReceipts, totalAgg] = await Promise.all([
      prisma.receipt.findMany({
        where: {
          committeeId: { in: committeeIds },
          contributionReceiptDate: { gte: cycleStart, lte: cycleEnd },
          OR: orFilters,
        },
        select: {
          contributorName: true,
          contributorEmployer: true,
          contributionReceiptAmount: true,
        },
      }),
      prisma.receipt.aggregate({
        where: {
          committeeId: { in: committeeIds },
          contributionReceiptDate: { gte: cycleStart, lte: cycleEnd },
        },
        _sum: { contributionReceiptAmount: true },
      }),
    ]);

    let totalLobbyAmount = 0;

    for (const r of candidateReceipts) {
      const lobby = matchLobby(r.contributorName, r.contributorEmployer);
      if (!lobby) continue;

      const amount = r.contributionReceiptAmount?.toNumber() ?? 0;
      if (amount <= 0) continue;

      const bucket = buckets.get(lobby.id)!;
      bucket.totalAmount += amount;
      bucket.contributionCount += 1;
      totalLobbyAmount += amount;

      const key = (r.contributorName ?? 'Unknown').trim().toUpperCase();
      const contribMap = contributorByLobby.get(lobby.id)!;
      const existing = contribMap.get(key);
      if (existing) {
        existing.amount += amount;
        existing.count += 1;
      } else {
        contribMap.set(key, {
          name: r.contributorName ?? 'Unknown',
          employer: r.contributorEmployer,
          amount,
          count: 1,
        });
      }
    }

    const totalReceipts = totalAgg._sum.contributionReceiptAmount?.toNumber() ?? 0;

    for (const bucket of buckets.values()) {
      const top = Array.from(contributorByLobby.get(bucket.id)!.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      bucket.topContributors = top;
      bucket.percentageOfReceipts =
        totalReceipts > 0 ? Math.round((bucket.totalAmount / totalReceipts) * 1000) / 10 : 0;
    }

    const lobbies = Array.from(buckets.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      candidateId: candidate.candidateId,
      candidateName: candidate.name,
      cycle,
      totalReceipts,
      totalLobbyAmount,
      classifiedPercentage:
        totalReceipts > 0 ? Math.round((totalLobbyAmount / totalReceipts) * 1000) / 10 : 0,
      lobbies,
      lastComputed: new Date().toISOString(),
      notes: [
        'Classification uses keyword matching against contributor name and employer fields from FEC Schedule A filings.',
        'Itemized individual contributions only exist for donations over $200; smaller donations are not classified here.',
        'Self-reported employer fields ("Self", "Retired", etc.) cause undercounting — totals are a lower bound.',
      ],
    };
  }
}

export const lobbyService = new LobbyService();
