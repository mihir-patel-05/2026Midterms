#!/usr/bin/env node
/**
 * Builds the county boundary asset for the election map from the same Census
 * vintage as the ACS demographics, so every county on the map has a matching
 * Census row. In particular, Connecticut is drawn as its 9 planning regions,
 * which replaced its 8 counties in Census products from 2022.
 *
 *   npm run build:geo:counties                 # download from the Census Bureau
 *   npm run build:geo:counties -- path/to.zip  # use an already-downloaded shapefile zip
 *
 * Output: public/geo/county2024.topo.json (TopoJSON, object "counties", features
 * carry { fips: "48201", name: "Harris County", state: "TX" }). Commit the output
 * and update public/geo/SOURCES.md when the vintage changes. Needs `unzip`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as shapefile from "shapefile";
import { topology } from "topojson-server";
import { presimplify, quantile, simplify } from "topojson-simplify";

const SOURCE_URL = process.env.COUNTY_SOURCE_URL
  ?? "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_5m.zip";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "public/geo/county2024.topo.json");

const STATE_FIPS = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
  "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
  "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY",
};

const work = mkdtempSync(join(tmpdir(), "county2024-"));
try {
  let zip = process.argv[2];
  if (!zip) {
    zip = join(work, "source.zip");
    console.log(`Downloading ${SOURCE_URL}`);
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
    writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  }
  execFileSync("unzip", ["-o", "-q", zip, "-d", work]);
  const shp = readdirSync(work).find((name) => name.endsWith(".shp"));
  if (!shp) throw new Error("No .shp file in the archive");

  const collection = await shapefile.read(join(work, shp), join(work, shp.replace(/\.shp$/, ".dbf")));
  const features = [];
  for (const feature of collection.features) {
    const props = feature.properties;
    const state = STATE_FIPS[String(props.STATEFP)];
    const fips = `${props.STATEFP}${props.COUNTYFP}`;
    // Skip territories; the map draws the 50 states and DC.
    if (!state || !/^\d{5}$/.test(fips)) continue;
    // NAMELSAD carries the type: "Harris County", "Orleans Parish", "Capitol Planning Region".
    features.push({ type: "Feature", properties: { fips, name: String(props.NAMELSAD ?? props.NAME), state }, geometry: feature.geometry });
  }
  if (features.length < 3100) throw new Error(`Expected ~3,144 counties, got ${features.length}`);

  let topo = topology({ counties: { type: "FeatureCollection", features } }, 1e5);
  topo = presimplify(topo);
  topo = simplify(topo, quantile(topo, 0.15));
  writeFileSync(outFile, JSON.stringify(topo));
  console.log(`Wrote ${features.length} counties to ${outFile} (${Math.round(statSync(outFile).size / 1024)} KB)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
