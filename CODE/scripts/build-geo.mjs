#!/usr/bin/env node
/**
 * Builds the congressional-district boundary asset for the election map.
 *
 *   npm run build:geo                 # download from the Census Bureau
 *   npm run build:geo -- path/to.zip  # use an already-downloaded shapefile zip
 *
 * Output: public/geo/cd119.topo.json (TopoJSON, object "districts", features
 * carry { code: "MI-07", state: "MI", district: "07" }). Commit the output and
 * update public/geo/SOURCES.md when the vintage changes. Needs `unzip`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as shapefile from "shapefile";
import { topology } from "topojson-server";
import { presimplify, quantile, simplify } from "topojson-simplify";

const SOURCE_URL = process.env.CD_SOURCE_URL
  ?? "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "public/geo/cd119.topo.json");

const STATE_FIPS = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
  "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
  "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY",
};

const work = mkdtempSync(join(tmpdir(), "cd119-"));
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
    const stateFips = String(props.STATEFP);
    const cdField = Object.keys(props).find((key) => /^CD\d+FP$/.test(key));
    const cd = String(props[cdField] ?? "");
    const state = STATE_FIPS[stateFips];
    // Skip territories and "ZZ" (water / not defined) pieces.
    if (!state || !/^\d{2}$/.test(cd)) continue;
    // At-large seats are "00"; DC's delegate is "98".
    const district = cd === "98" ? "00" : cd;
    features.push({ type: "Feature", properties: { code: `${state}-${district}`, state, district }, geometry: feature.geometry });
  }
  if (features.length < 430) throw new Error(`Expected ~436 districts, got ${features.length}`);

  let topo = topology({ districts: { type: "FeatureCollection", features } }, 1e5);
  topo = presimplify(topo);
  topo = simplify(topo, quantile(topo, 0.08));
  writeFileSync(outFile, JSON.stringify(topo));
  console.log(`Wrote ${features.length} districts to ${outFile} (${Math.round(statSync(outFile).size / 1024)} KB)`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
