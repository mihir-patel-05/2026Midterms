#!/usr/bin/env node
/**
 * Records who holds every House seat and every Senate seat today, for the
 * Market odds map's flip hatching.
 *
 *   npm run build:seat-holders
 *
 * Source: the unitedstates/congress-legislators project (the same one the
 * backend's ideology sync reads), which updates within days of a special
 * election, a party switch, or a vacancy. A House seat with nobody in it is
 * listed as vacant with its last holder, found in the historical file.
 *
 * Output: public/data/seat-holders-2026.json (Senate seats keyed "GA-2": state and class). Rerun after any special
 * election, resignation, or party switch, then commit the output. The script
 * exits non-zero unless every one of the 435 seats is held or vacant.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const BASE_URL = process.env.LEGISLATORS_BASE_URL ?? "https://unitedstates.github.io/congress-legislators";
/** First day of the 119th Congress; terms that ended earlier are not the seat's last holder. */
const CONGRESS_START = "2025-01-03";
const PARTIES = { Democrat: "D", Republican: "R" };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const topology = JSON.parse(readFileSync(join(root, "public/geo/cd119.topo.json"), "utf8"));
// The map's district codes ("PA-07", "AK-00"); DC's delegate has no vote and no seat in the count.
const seatCodes = feature(topology, topology.objects.districts).features
  .map((item) => `${item.properties.state}-${item.properties.district}`)
  .filter((code) => !code.startsWith("DC-"))
  .sort();

async function getJson(name) {
  const response = await fetch(`${BASE_URL}/${name}`);
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  return response.json();
}

const party = (term) => PARTIES[term.party] ?? "I";
const name = (person) => person.name.official_full ?? `${person.name.first} ${person.name.last}`;
const seatCode = (term) => `${term.state}-${String(term.district).padStart(2, "0")}`;

console.log("Fetching current and historical legislators…");
const [current, historical] = await Promise.all([getJson("legislators-current.json"), getJson("legislators-historical.json")]);

const house = {};
const senate = {};
for (const person of current) {
  const term = person.terms.at(-1);
  if (term.type === "rep") {
    const code = seatCode(term);
    if (!seatCodes.includes(code)) continue;
    if (house[code]) throw new Error(`Two members hold ${code}: ${house[code].name} and ${name(person)}`);
    house[code] = { party: party(term), name: name(person), since: term.start };
  } else if (term.type === "sen") {
    senate[`${term.state}-${term.class}`] = { party: party(term), name: name(person) };
  }
}

// A vacant seat's last holder: the latest House term for it in this Congress, in either file
// (a member who moved to the Senate is still in the current file).
const vacant = {};
for (const code of seatCodes.filter((item) => !house[item])) {
  let last = null;
  for (const person of [...historical, ...current]) {
    for (const term of person.terms) {
      if (term.type !== "rep" || seatCode(term) !== code || term.end < CONGRESS_START) continue;
      if (!last || term.end > last.term.end) last = { person, term };
    }
  }
  if (!last) throw new Error(`${code} is empty and has no holder in this Congress`);
  vacant[code] = { party: party(last.term), name: name(last.person), until: last.term.end };
}

const held = Object.keys(house).length;
const empty = Object.keys(vacant).length;
if (seatCodes.length !== 435 || held + empty !== 435) throw new Error(`Expected 435 seats, got ${held} held and ${empty} vacant of ${seatCodes.length}`);

// One seat per line, sorted, so a rerun's diff shows exactly which seats changed.
const block = (record) => `{\n${Object.keys(record).sort().map((key) => `    ${JSON.stringify(key)}: ${JSON.stringify(record[key])}`).join(",\n")}\n  }`;
const out = join(root, "public/data/seat-holders-2026.json");
writeFileSync(out, `{
  "generatedAt": ${JSON.stringify(new Date().toISOString().slice(0, 10))},
  "source": "unitedstates/congress-legislators (legislators-current and legislators-historical)",
  "house": ${block(house)},
  "vacant": ${block(vacant)},
  "senate": ${block(senate)}
}
`);

const count = (record, side) => Object.values(record).filter((item) => item.party === side).length;
console.log(`House: ${count(house, "D")} D, ${count(house, "R")} R, ${count(house, "I")} other, ${empty} vacant`);
for (const [code, item] of Object.entries(vacant)) console.log(`  ${code} vacant since ${item.until}, last held by ${item.name} (${item.party})`);
for (const [code, item] of Object.entries(house).filter(([, item]) => item.party === "I")) console.log(`  ${code} held by ${item.name}, not a D or R`);
console.log(`Senate: ${Object.keys(senate).length} seats`);
console.log(`Wrote ${out}`);
