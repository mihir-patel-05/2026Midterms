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
