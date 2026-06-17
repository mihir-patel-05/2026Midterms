/**
 * Ideology scoring service (issue #33) — GovTrack-based methodology.
 *
 * Populates the `IdeologyScore` table for incumbent candidates using the
 * ideology + leadership scores GovTrack derives from congressional
 * cosponsorship networks. This is the data layer behind the "Ideology Score"
 * spectrum and (future) voting-record scorecard on candidate profiles.
 *
 * Pipeline:
 *   1. Fetch the unitedstates/congress-legislators crosswalk to map our
 *      FEC candidate IDs -> GovTrack person IDs. (Our candidates are keyed by
 *      FEC ID; GovTrack's analysis is keyed by GovTrack person ID.)
 *   2. Fetch GovTrack's per-Congress sponsorship-analysis files (House + Senate)
 *      which contain ideology + leadership scores per GovTrack person ID.
 *   3. Join the two and upsert one IdeologyScore row per matched candidate.
 *
 * Network note: GovTrack (www.govtrack.us) and the raw congress-legislators
 * host must be reachable from wherever this runs. Both are configurable via
 * env (IDEOLOGY_GOVTRACK_BASE_URL, IDEOLOGY_LEGISLATORS_URL).
 */

import axios from 'axios';
import { parse as parseCsv } from 'csv-parse/sync';
import { parse as parseYaml } from 'yaml';
import { env } from '../config/env.js';

/**
 * Map of FEC candidate ID -> GovTrack person ID, built from the
 * congress-legislators crosswalk. A single legislator can have several FEC IDs
 * (e.g. a House member who later ran for Senate), so we index every FEC ID.
 */
export type FecToGovtrackMap = Map<string, number>;

/** Shape of a single legislator entry in legislators-current.yaml (subset). */
interface LegislatorEntry {
  id?: {
    govtrack?: number;
    fec?: string[];
    bioguide?: string;
  };
}

/**
 * Fetch and parse the congress-legislators crosswalk, returning a lookup from
 * FEC candidate ID to GovTrack person ID.
 */
export async function fetchFecToGovtrackCrosswalk(): Promise<FecToGovtrackMap> {
  const url = env.IDEOLOGY_LEGISLATORS_URL;
  console.log(`🔗 Fetching FEC↔GovTrack crosswalk: ${url}`);

  const response = await axios.get<string>(url, {
    timeout: 30000,
    responseType: 'text',
  });

  const legislators = parseYaml(response.data) as LegislatorEntry[];
  if (!Array.isArray(legislators)) {
    throw new Error('Unexpected congress-legislators format: expected a list');
  }

  const map: FecToGovtrackMap = new Map();
  for (const leg of legislators) {
    const govtrackId = leg.id?.govtrack;
    const fecIds = leg.id?.fec;
    if (govtrackId == null || !Array.isArray(fecIds)) continue;
    for (const fecId of fecIds) {
      if (fecId) map.set(fecId, govtrackId);
    }
  }

  console.log(
    `🔗 Crosswalk built: ${map.size} FEC IDs across ${legislators.length} legislators`
  );
  return map;
}

/**
 * One GovTrack member's sponsorship-analysis scores.
 * - ideology: 0 = most liberal/left, 1 = most conservative/right.
 * - leadership: GovTrack's leadership score (higher = more central/influential
 *   sponsor); unbounded-ish, not a percentage.
 */
export interface GovtrackScore {
  govtrackId: number;
  ideology?: number;
  leadership?: number;
}

/** Map of GovTrack person ID -> ideology/leadership scores. */
export type GovtrackScoreMap = Map<number, GovtrackScore>;

const CHAMBER_FILES: Record<'house' | 'senate', string> = {
  house: 'sponsorshipanalysis_h.txt',
  senate: 'sponsorshipanalysis_s.txt',
};

function toFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Fetch and parse one GovTrack sponsorship-analysis file (House or Senate) for
 * a given Congress. The file is CSV with a header row; we key columns by
 * normalized (lowercased/trimmed) header name so we're resilient to column
 * ordering: we need `id`, `ideology`, and `leadership`.
 */
async function fetchGovtrackChamber(
  congress: number,
  chamber: 'house' | 'senate'
): Promise<GovtrackScore[]> {
  const url = `${env.IDEOLOGY_GOVTRACK_BASE_URL}/${congress}/${CHAMBER_FILES[chamber]}`;
  console.log(`📥 Fetching GovTrack ${chamber} ideology analysis: ${url}`);

  const response = await axios.get<string>(url, {
    timeout: 30000,
    responseType: 'text',
  });

  const rows = parseCsv(response.data, {
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const scores: GovtrackScore[] = [];
  for (const row of rows) {
    const govtrackId = toFiniteNumber(row.id);
    if (govtrackId == null) continue;
    scores.push({
      govtrackId,
      ideology: toFiniteNumber(row.ideology),
      leadership: toFiniteNumber(row.leadership),
    });
  }

  if (scores.length === 0) {
    throw new Error(
      `GovTrack ${chamber} analysis for Congress ${congress} parsed 0 rows — ` +
        `the file format may have changed (expected CSV with id/ideology/leadership columns).`
    );
  }

  console.log(`📊 GovTrack ${chamber}: parsed ${scores.length} member scores`);
  return scores;
}

/**
 * Fetch both chambers' GovTrack sponsorship-analysis for a Congress and return
 * a single Map keyed by GovTrack person ID.
 */
export async function fetchGovtrackAnalysis(
  congress: number
): Promise<GovtrackScoreMap> {
  const [house, senate] = await Promise.all([
    fetchGovtrackChamber(congress, 'house'),
    fetchGovtrackChamber(congress, 'senate'),
  ]);

  const map: GovtrackScoreMap = new Map();
  for (const score of [...house, ...senate]) {
    map.set(score.govtrackId, score);
  }

  console.log(`📊 GovTrack analysis: ${map.size} members for Congress ${congress}`);
  return map;
}
