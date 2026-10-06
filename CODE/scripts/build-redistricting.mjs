#!/usr/bin/env node
/**
 * Finds the states whose 2026 congressional map differs from the 119th
 * Congress outlines drawn on the election map.
 *
 *   GEOCODIO_API_KEY=... npm run build:redistricting
 *
 * Takes one interior point per district in public/geo/cd119.topo.json and asks
 * Geocodio which district it falls in today (cd119, a control) and in 2026
 * (cd120), in two batch requests. Each point is billed per field, so a run
 * costs roughly 1,750 or more lookups: check the day's Geocodio allowance first.
 * A state is flagged when a point that matches its own district today lands in
 * a differently numbered 2026 district. One point per district can miss a
 * redraw that keeps every interior point's number, so MANUAL_STATES can add
 * states by hand.
 *
 * Output: src/features/election-monitor/map/redistricting-2026.json. Review the
 * flagged states, then commit the output alongside public/geo/SOURCES.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pointOnFeature from "@turf/point-on-feature";
import { feature } from "topojson-client";

/** States to flag even if no sampled point changed district. */
const MANUAL_STATES = [];

const apiKey = process.env.GEOCODIO_API_KEY?.trim();
if (!apiKey) {
  console.error("Set GEOCODIO_API_KEY to run this script.");
  process.exit(1);
}
const baseUrl = process.env.GEOCODIO_API_BASE_URL ?? "https://api.geocod.io/v2";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const topology = JSON.parse(readFileSync(join(root, "public/geo/cd119.topo.json"), "utf8"));
const districts = feature(topology, topology.objects.districts).features;

const samples = districts.map((item) => {
  const [lng, lat] = pointOnFeature(item).geometry.coordinates;
  return { state: item.properties.state, district: item.properties.district, lat, lng };
});

/** Batch reverse-geocode every sample for one Congress field; returns each point's district (null if none). */
async function districtsFor(field, congress) {
  const url = new URL(`${baseUrl}/reverse`);
  url.searchParams.set("fields", field);
  url.searchParams.set("limit", "1");
  url.searchParams.set("api_key", apiKey);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(samples.map((sample) => `${sample.lat.toFixed(6)},${sample.lng.toFixed(6)}`)),
  });
  if (!response.ok) throw new Error(`Geocodio batch reverse (${field}) failed: HTTP ${response.status} ${await response.text()}`);
  const { results } = await response.json();
  if (!Array.isArray(results) || results.length !== samples.length) {
    throw new Error(`Expected ${samples.length} ${field} results, got ${results?.length}`);
  }
  return samples.map((sample, index) => {
    const match = (results[index]?.response?.results?.[0]?.fields?.congressional_districts ?? [])
      .filter((entry) => entry.congress_number === congress)
      .sort((a, b) => (b.proportion ?? 0) - (a.proportion ?? 0))[0];
    if (!match) return null;
    // At-large seats are "00" on the map and 0 (or 98 for DC) in Geocodio.
    return sample.district === "00" ? "00" : String(match.district_number).padStart(2, "0");
  });
}

// cd119 is the control: the map's outlines are simplified, so a sample point can
// sit just across a real boundary. Only points that match their own district
// under the current lines say anything about the 2026 map.
console.log(`Looking up ${samples.length} district interior points (cd119 control + cd120)…`);
const [current, next] = [await districtsFor("cd119", "119th"), await districtsFor("cd120", "120th")];

const states = {};
const unreliable = [];
samples.forEach((sample, index) => {
  const code = `${sample.state}-${sample.district}`;
  if (current[index] !== sample.district || !next[index]) {
    unreliable.push(code);
    return;
  }
  if (next[index] !== sample.district) {
    (states[sample.state] ??= { changedDistricts: [] }).changedDistricts.push(sample.district);
  }
});
for (const state of MANUAL_STATES) states[state] ??= { changedDistricts: [], manual: true };

const sorted = Object.fromEntries(
  Object.keys(states).sort().map((state) => [state, { ...states[state], changedDistricts: states[state].changedDistricts.sort() }]),
);
const out = join(root, "src/features/election-monitor/map/redistricting-2026.json");
writeFileSync(out, `${JSON.stringify({
  generatedAt: new Date().toISOString().slice(0, 10),
  source: "Geocodio cd120 (2026 maps) vs Census cb_2024_us_cd119 interior points",
  states: sorted,
}, null, 2)}\n`);

console.log(`Flagged ${Object.keys(sorted).length} state(s): ${Object.keys(sorted).join(", ") || "none"}`);
for (const [state, info] of Object.entries(sorted)) console.log(`  ${state}: ${info.changedDistricts.length} district point(s) moved`);
if (unreliable.length) console.warn(`Skipped ${unreliable.length} sample(s) off their own district or unresolved: ${unreliable.join(", ")}`);
console.log(`Wrote ${out}`);
