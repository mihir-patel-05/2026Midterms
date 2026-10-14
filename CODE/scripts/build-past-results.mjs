#!/usr/bin/env node
/**
 * Converts the MIT Election Data + Science Lab (MEDSL) CSVs into the static
 * files the map's Past results mode reads.
 *
 *   npm run build:past-results                      # reads ../backend/data/medsl
 *   npm run build:past-results -- --src=/path/to/medsl
 *
 * Inputs (not committed; see backend/data/medsl/README.md):
 *   Presidental_county_2024/countypres_2000-2024.csv   County Presidential Election Returns 2000–2024
 *   Senate/1976-2024-senate-state.csv                  U.S. Senate Statewide 1976–2024
 *   USHOUSE_1976-2024/1976-2024-house.tab              U.S. House 1976–2024
 *
 * Output: public/data/past-results/{meta,president-YYYY,president-series,senate-YYYY,house-YYYY}.json
 *
 * Only vote counts are stored. Shares, margins, and shifts are computed in the
 * browser from them. Every rule below is applied in code, and a check report is
 * printed at the end; the script exits non-zero if a hard check fails.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcArg = process.argv.find((arg) => arg.startsWith("--src="));
const SRC = resolve(srcArg ? srcArg.slice(6) : join(root, "../backend/data/medsl"));
const OUT = join(root, "public/data/past-results");

const FILES = {
  president: "Presidental_county_2024/countypres_2000-2024.csv",
  senate: "Senate/1976-2024-senate-state.csv",
  house: "USHOUSE_1976-2024/1976-2024-house.tab",
};
const HEADERS = {
  president: ["state", "county_name", "year", "state_po", "county_fips", "office", "candidate", "party", "candidatevotes", "totalvotes", "version", "mode"],
  senate: ["year", "state", "state_po", "stage", "special", "candidate", "party_detailed", "writein", "mode", "candidatevotes", "totalvotes", "unofficial", "version", "party_simplified"],
  house: ["year", "state", "state_po", "district", "stage", "runoff", "special", "candidate", "party", "writein", "mode", "candidatevotes", "totalvotes", "unofficial", "version", "fusion_ticket"],
};
const SOURCES = {
  president: { dataset: "County Presidential Election Returns 2000–2024", doi: "https://doi.org/10.7910/DVN/VOQCHQ" },
  senate: { dataset: "U.S. Senate Statewide 1976–2024", doi: "https://doi.org/10.7910/DVN/PEJ5QU" },
  house: { dataset: "U.S. House 1976–2024", doi: "https://doi.org/10.7910/DVN/IG0UN2" },
};

/** The 50 states. DC is in the presidential file (it has electoral votes) but elects no senator or voting representative. */
const STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
const HOUSE_SEATS_2020 = 435;

/** Ballot accounting rows, not candidates. They are never counted as votes for anyone. */
const NOT_CANDIDATES = new Set(["TOTAL VOTES CAST", "OVERVOTES", "UNDERVOTES", "OVER VOTES", "UNDER VOTES", "SPOILED", "BLANK", "BLANK VOTES", "VOID", "VOID VOTES", "INVALID", "NONE OF THESE CANDIDATES"]);
// "None of these candidates" is a real ballot line in Nevada, but it elects no one; it is kept out so it can never be shown as a winner.

const D_LABELS = new Set(["DEMOCRAT", "DEMOCRATIC", "DEMOCRATIC-FARMER-LABOR", "DEMOCRATIC-FARM-LABOR", "DEMOCRATIC-NONPARTISAN LEAGUE", "DEMOCRATIC-NPL"]);
const R_LABELS = new Set(["REPUBLICAN"]);
/** D, R, or O. Independents are O even when they caucus with a party (King, Sanders). */
const simplify = (label) => (D_LABELS.has(label) ? "D" : R_LABELS.has(label) ? "R" : "O");

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180 rows. A quote only opens a field at its start; MEDSL has bare \" inside some unquoted names. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === "") { quoted = true; i++; continue; }
    if (ch === ",") { row.push(field); field = ""; i++; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = ""; i++; continue;
    }
    field += ch; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readTable(office) {
  const text = readFileSync(join(SRC, FILES[office]), "utf8").replace(/^﻿/, "");
  const [header, ...body] = parseCsv(text).filter((row) => row.length > 1);
  const missing = HEADERS[office].filter((column) => !header.includes(column));
  if (missing.length) fail(`${FILES[office]} is missing columns: ${missing.join(", ")}. MEDSL may have changed the file format.`);
  const index = Object.fromEntries(header.map((column, i) => [column, i]));
  return body.map((row) => Object.fromEntries(Object.entries(index).map(([column, i]) => [column, (row[i] ?? "").replace(/\\"/g, '"').trim()])));
}

const votes = (value) => {
  if (value === "" || value === "NA" || value === "nan") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
};
const isTrue = (value) => /^true$/i.test(value);
/** MEDSL versions are YYYYMMDD, but some Senate rows use M/D/YY ("11/20/25"). */
const versionDate = (value) => {
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(value);
  return us ? `20${us[3]}${us[1].padStart(2, "0")}${us[2].padStart(2, "0")}` : value;
};
const latestVersion = (versions) => [...versions].map(versionDate).sort().pop();

const report = [];
const hardFailures = [];
function fail(message) { console.error(`ERROR: ${message}`); process.exit(1); }
function check(ok, message) { if (!ok) hardFailures.push(message); }
const skipped = {};
const skip = (office, reason) => { skipped[office] ??= {}; skipped[office][reason] = (skipped[office][reason] ?? 0) + 1; };

// ---------------------------------------------------------------------------
// President (county file, rolled up to states)
// ---------------------------------------------------------------------------

/**
 * Kansas City, Missouri reports apart from Jackson County (FIPS 2938000 through 2020, 36000 in 2024).
 * Its votes are Jackson County votes cast inside the city, so they are added to Jackson County.
 * Oglala Lakota County, SD was Shannon County (46113) until 2015; the map uses 46102.
 */
function countyCode(row) {
  const raw = row.county_fips;
  if (!raw || raw === "NA") return null;
  // Alaska reports by state house district, coded 2001–2040 (and 2099). Those are not boroughs, and
  // three collide with borough FIPS (02013, 02016, 02020 is Anchorage), so they count toward the state only.
  if (row.state_po === "AK") return null;
  if (row.state_po === "MO" && /KANSAS CITY/.test(row.county_name)) return "29095";
  const fips = raw.padStart(5, "0");
  if (fips === "46113") return "46102";
  return fips;
}

function buildPresident() {
  const rows = readTable("president");
  const versions = new Set(rows.map((row) => row.version));
  // year → county → candidate → { modes: {mode: votes}, party }
  const tally = new Map();
  const noCounty = new Map(); // year|state|candidate → votes from rows with no county (overseas, federal precinct, statewide write-ins)
  const names = new Map(); // year → { D, R }
  const partyOf = new Map(); // year|candidate → party label
  const countyMeta = new Map(); // fips → { state, name }
  for (const row of rows) {
    if (NOT_CANDIDATES.has(row.candidate)) { skip("president", `ballot accounting row (${row.candidate})`); continue; }
    if (!STATES.has(row.state_po) && row.state_po !== "DC") { skip("president", "not a state or DC"); continue; }
    const n = votes(row.candidatevotes);
    if (n === null) { skip("president", "vote count not reported (NA)"); continue; }
    const party = row.party || "OTHER";
    partyOf.set(`${row.year}|${row.candidate}`, party);
    if (party === "DEMOCRAT" || party === "REPUBLICAN") {
      const entry = names.get(row.year) ?? {};
      entry[party === "DEMOCRAT" ? "D" : "R"] = row.candidate;
      names.set(row.year, entry);
    }
    const fips = countyCode(row);
    if (!fips) {
      const key = `${row.year}|${row.state_po}|${row.candidate}`;
      noCounty.set(key, (noCounty.get(key) ?? 0) + n);
      skip("president", row.state_po === "AK" ? "Alaska house district (kept in the state total only)" : "no county code (kept in the state total only)");
      continue;
    }
    countyMeta.set(fips, { state: row.state_po, name: row.county_name });
    if (!tally.has(row.year)) tally.set(row.year, new Map());
    const counties = tally.get(row.year);
    if (!counties.has(fips)) counties.set(fips, new Map());
    const candidates = counties.get(fips);
    const key = `${row.candidate}|${row.county_fips}`; // separate Kansas City from Jackson until summed below
    const entry = candidates.get(key) ?? { candidate: row.candidate, modes: {} };
    const mode = row.mode.toUpperCase() || "TOTAL*";
    entry.modes[mode] = (entry.modes[mode] ?? 0) + n;
    candidates.set(key, entry);
  }

  /**
   * One count per county and candidate: the TOTAL row when there is one (some 2024 states also list
   * a partial breakdown by vote method beside it), else a blank-mode row, else the sum of the method rows.
   */
  const candidateVotes = (modes) => modes.TOTAL ?? modes["TOTAL*"] ?? Object.values(modes).reduce((sum, n) => sum + n, 0);
  const partyKey = (year, candidate) => {
    const party = partyOf.get(`${year}|${candidate}`);
    return party === "DEMOCRAT" ? "d" : party === "REPUBLICAN" ? "r" : "o";
  };

  const years = [...tally.keys()].sort();
  const series = { states: {}, counties: {} };
  for (const year of years) {
    const counties = {};
    const states = {};
    const stateOthers = {}; // state → candidate → votes
    for (const [fips, candidates] of tally.get(year)) {
      const county = { d: 0, r: 0, o: 0 };
      for (const { candidate, modes } of candidates.values()) {
        const n = candidateVotes(modes);
        county[partyKey(year, candidate)] += n;
        const state = countyMeta.get(fips).state;
        if (partyKey(year, candidate) === "o") {
          stateOthers[state] ??= {};
          stateOthers[state][candidate] = (stateOthers[state][candidate] ?? 0) + n;
        }
      }
      const total = county.d + county.r + county.o;
      if (total === 0) { skip("president", "county with no votes"); continue; }
      counties[fips] = [county.d, county.r, county.o];
      const state = countyMeta.get(fips).state;
      states[state] ??= { d: 0, r: 0, o: 0 };
      states[state].d += county.d; states[state].r += county.r; states[state].o += county.o;
    }
    for (const [key, n] of noCounty) {
      const [y, state, candidate] = key.split("|");
      if (y !== year) continue;
      states[state] ??= { d: 0, r: 0, o: 0 };
      const pk = partyKey(year, candidate);
      states[state][pk] += n;
      if (pk === "o") { stateOthers[state] ??= {}; stateOthers[state][candidate] = (stateOthers[state][candidate] ?? 0) + n; }
    }
    const stateRows = Object.fromEntries(Object.entries(states).sort().map(([state, s]) => [state, {
      votes: [s.d, s.r, s.o],
      // Third-party and write-in lines, largest first. MEDSL groups many minor candidates as "OTHER".
      others: Object.entries(stateOthers[state] ?? {}).sort((a, b) => b[1] - a[1]).map(([candidate, n]) => [candidate, partyOf.get(`${year}|${candidate}`) ?? "OTHER", n]),
    }]));
    write(`president-${year}.json`, { office: "president", year: Number(year), candidates: names.get(year), states: stateRows, counties });

    for (const [state, s] of Object.entries(states)) (series.states[state] ??= {})[year] = [s.d, s.r, s.o];
    for (const [fips, v] of Object.entries(counties)) (series.counties[fips] ??= {})[year] = v;

    const national = Object.values(states).reduce((sum, s) => ({ d: sum.d + s.d, r: sum.r + s.r, o: sum.o + s.o }), { d: 0, r: 0, o: 0 });
    report.push(`President ${year}: ${Object.keys(states).length} states + DC, ${Object.keys(counties).length} counties; ` +
      `D ${national.d.toLocaleString()} (${names.get(year)?.D}), R ${national.r.toLocaleString()} (${names.get(year)?.R}), other ${national.o.toLocaleString()}`);
    check(Object.keys(states).length === 51, `President ${year} has ${Object.keys(states).length} states and DC, expected 51`);
  }

  // Margin series for the detail panel: D share minus R share, in points, per year.
  const margin = ([d, r, o]) => Math.round(((d - r) / (d + r + o)) * 1000) / 10;
  const compact = (byYear) => years.map((year) => (byYear[year] ? margin(byYear[year]) : null));
  write("president-series.json", {
    years: years.map(Number),
    states: Object.fromEntries(Object.entries(series.states).map(([state, byYear]) => [state, compact(byYear)])),
    counties: Object.fromEntries(Object.entries(series.counties).map(([fips, byYear]) => [fips, compact(byYear)])),
  });
  return { years: years.map(Number), version: latestVersion(versions), countyMeta };
}

// ---------------------------------------------------------------------------
// Senate and House races
// ---------------------------------------------------------------------------

/**
 * Collapses one race's rows into candidates. Fusion candidates (New York, Connecticut) appear once per
 * party line; their lines are added together and credited to the D or R line with the most votes, if any.
 */
function raceCandidates(rows, partyField, simplifiedField) {
  const byName = new Map();
  for (const row of rows) {
    const writein = isTrue(row.writein);
    const name = row.candidate || (writein ? "WRITE-IN" : "UNNAMED");
    const n = votes(row.candidatevotes) ?? 0;
    const label = row[partyField] && row[partyField] !== "NA" ? row[partyField] : writein ? "WRITE-IN" : "";
    const party = simplifiedField ? (row[simplifiedField] === "DEMOCRAT" ? "D" : row[simplifiedField] === "REPUBLICAN" ? "R" : "O") : simplify(label);
    const entry = byName.get(name) ?? { name, votes: 0, lines: [], writein };
    entry.votes += n;
    entry.lines.push({ label, party, votes: n });
    byName.set(name, entry);
  }
  return [...byName.values()].map((entry) => {
    const major = entry.lines.filter((line) => line.party !== "O").sort((a, b) => b.votes - a.votes)[0];
    const labels = [...new Set(entry.lines.map((line) => line.label).filter(Boolean))];
    return { name: entry.name, party: major?.party ?? "O", partyDetailed: labels.join(", "), votes: entry.votes, ...(entry.writein ? { writein: true } : {}) };
  }).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
}

function buildRaces(office) {
  const rows = readTable(office);
  const versions = new Set(rows.map((row) => row.version));
  // Georgia's 1992 and 2008 Senate rows label the November first round "pre" and the December runoff "gen".
  const preRaces = new Set(rows.filter((row) => row.stage.toLowerCase() === "pre").map((row) => `${row.year}|${row.state_po}|${row.special}`));
  const groups = new Map(); // cycle → area → raceKey → rows
  for (const row of rows) {
    if (!STATES.has(row.state_po)) { skip(office, `not a state (${row.state_po})`); continue; }
    if (NOT_CANDIDATES.has(row.candidate.toUpperCase())) { skip(office, `ballot accounting row (${row.candidate.toUpperCase()})`); continue; }
    const stageRaw = row.stage.toUpperCase();
    const special = isTrue(row.special);
    const relabeled = preRaces.has(`${row.year}|${row.state_po}|${row.special}`);
    // Texas's court-ordered 1996 House elections were open, all-party November specials that MEDSL codes as "PRI".
    const openSpecial = office === "house" && stageRaw === "PRI" && special;
    if (stageRaw === "PRI" && !openSpecial) { skip(office, "primary"); continue; }
    const runoff = stageRaw.includes("RUNOFF") || isTrue(row.runoff) || (relabeled && stageRaw === "GEN");
    // Georgia's January 2021 Senate runoffs decided 2020 seats; they are filed under the 2020 cycle.
    const heldIn = Number(row.year);
    const cycle = heldIn % 2 === 1 ? heldIn - 1 : heldIn;
    const area = office === "senate" ? row.state_po : `${row.state_po}-${row.district === "0" ? "00" : row.district.padStart(2, "0")}`;
    const key = `${special ? "S" : "R"}|${runoff ? "RUNOFF" : "GEN"}`;
    if (!groups.has(cycle)) groups.set(cycle, new Map());
    const areas = groups.get(cycle);
    if (!areas.has(area)) areas.set(area, new Map());
    const races = areas.get(area);
    const race = races.get(key) ?? { special, stage: runoff ? "RUNOFF" : "GEN", heldIn, rows: [] };
    race.rows.push(row);
    races.set(key, race);
  }

  const cycles = [...groups.keys()].sort((a, b) => a - b);
  for (const cycle of cycles) {
    const areas = {};
    let unopposed = 0;
    for (const [area, races] of [...groups.get(cycle)].sort(([a], [b]) => a.localeCompare(b))) {
      areas[area] = [...races.values()]
        .sort((a, b) => Number(a.special) - Number(b.special) || a.stage.localeCompare(b.stage))
        .map((race) => {
          const candidates = office === "senate"
            ? raceCandidates(race.rows, "party_detailed", "party_simplified")
            : raceCandidates(race.rows, "party", null);
          // Florida and a few other states print no count for unopposed candidates; MEDSL stores 1 or -1.
          const reported = Math.max(...race.rows.map((row) => votes(row.totalvotes) ?? 0));
          const isUnopposed = reported <= 1 && candidates.filter((c) => !c.writein).length <= 1;
          if (isUnopposed) unopposed++;
          const stateCode = area.slice(0, 2);
          return {
            special: race.special,
            stage: race.stage,
            ...(race.heldIn !== cycle ? { heldIn: race.heldIn } : {}),
            ...(race.rows.some((row) => isTrue(row.unofficial)) ? { unofficial: true } : {}),
            // Maine (from 2018) and Alaska (from 2022) use ranked-choice voting; MEDSL reports the first round.
            ...((stateCode === "ME" && cycle >= 2018) || (stateCode === "AK" && cycle >= 2022) ? { firstRound: true } : {}),
            ...(isUnopposed ? { status: "unopposed" } : {}),
            candidates: isUnopposed ? candidates.map((c) => ({ ...c, votes: null })) : candidates,
          };
        });
    }
    write(`${office}-${cycle}.json`, { office, year: cycle, [office === "senate" ? "states" : "districts"]: areas });
    const regular = Object.values(areas).filter((races) => races.some((race) => !race.special && race.stage === "GEN")).length;
    const decided = Object.values(areas).filter((races) => races.some((race) => race.stage === "GEN")).length;
    report.push(`${office === "senate" ? "Senate" : "House"} ${cycle}: ${Object.keys(areas).length} ${office === "senate" ? "states" : "districts"} with a race, ${regular} with a regular general election${unopposed ? `, ${unopposed} unopposed without a count` : ""}`);
    // Court-ordered redraws (Texas 1996 and 2006) replaced some regular elections with specials, so count any general.
    if (office === "house") check(decided === HOUSE_SEATS_2020, `House ${cycle} has ${decided} districts with a general election, expected 435`);
  }
  return { years: cycles, version: latestVersion(versions) };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function write(name, data) {
  writeFileSync(join(OUT, name), JSON.stringify(data));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const president = buildPresident();
const senate = buildRaces("senate");
const house = buildRaces("house");

// Counties the map cannot draw: shapes come from us-atlas (2017 boundaries) unless the Census 2024 build exists.
let atlas;
try {
  atlas = JSON.parse(readFileSync(join(root, "public/geo/county2024.topo.json"), "utf8"));
} catch {
  atlas = JSON.parse(readFileSync(join(root, "node_modules/us-atlas/counties-10m.json"), "utf8"));
}
const shapes = new Set(feature(atlas, atlas.objects.counties).features.map((item) => String(item.properties?.fips ?? item.id).padStart(5, "0")));
const unmatched = [...president.countyMeta].filter(([fips]) => !shapes.has(fips));
const unmatchedByState = unmatched.reduce((acc, [, meta]) => ({ ...acc, [meta.state]: (acc[meta.state] ?? 0) + 1 }), {});

const today = new Date().toISOString().slice(0, 10);
const attribution = (office, version) =>
  `MIT Election Data and Science Lab, ${SOURCES[office].dataset}, Harvard Dataverse, version ${version}, loaded ${today}.`;
write("meta.json", {
  generatedAt: new Date().toISOString(),
  offices: {
    president: { years: president.years, levels: ["state", "county"], ...SOURCES.president, version: president.version, attribution: attribution("president", president.version) },
    senate: { years: senate.years, levels: ["state"], ...SOURCES.senate, version: senate.version, attribution: attribution("senate", senate.version) },
    // The map draws 119th Congress districts (first used in 2024). Other years list races instead of coloring a map.
    house: { years: house.years, levels: ["district"], mapYears: [2024], ...SOURCES.house, version: house.version, attribution: attribution("house", house.version) },
  },
  // County results the map cannot place on a county shape, by state.
  countyNotes: {
    AK: "Alaska reports presidential results by state house district, not by borough, so it has no county results; its districts count toward the state total.",
    ...(unmatchedByState.CT && { CT: "Connecticut results are reported by its former counties." }),
  },
});

const sizes = readdirSync(OUT).map((name) => readFileSync(join(OUT, name)).length);
console.log(`\nWrote ${sizes.length} files to ${OUT} (${(sizes.reduce((a, b) => a + b, 0) / 1e6).toFixed(1)} MB before compression)\n`);
console.log(report.join("\n"));
console.log("\nRows left out, by reason:");
for (const [office, reasons] of Object.entries(skipped)) for (const [reason, n] of Object.entries(reasons)) console.log(`  ${office}: ${reason}: ${n}`);
console.log(`\nCounties with no map shape: ${unmatched.length} (${Object.entries(unmatchedByState).map(([s, n]) => `${s} ${n}`).join(", ") || "none"})`);
for (const [fips, meta] of unmatched.filter(([, meta]) => meta.state !== "AK")) console.log(`  ${fips} ${meta.name}, ${meta.state}`);
if (hardFailures.length) {
  console.error(`\n${hardFailures.length} check(s) failed:\n  ${hardFailures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
