#!/usr/bin/env node
/**
 * Checks every official results link in public/data/state-results-links.json answers (2xx or 3xx).
 *
 *   npm run check:results-links
 *
 * Run it from a normal connection before Nov 3, open any link it flags by hand, then set `checkedAt`.
 * Some state sites refuse automated requests (403); those need a look in a browser, not a change.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { states } = JSON.parse(readFileSync(join(root, "public/data/state-results-links.json"), "utf8"));
let failed = 0;
for (const [state, { url }] of Object.entries(states)) {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 VoteInformed link check" } });
    const ok = response.ok;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${state} ${response.status} ${url}${response.url !== url ? ` -> ${response.url}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${state} ${error instanceof Error ? error.message : error} ${url}`);
  }
}
console.log(failed === 0 ? "All links answered." : `${failed} links need a look in a browser.`);
process.exit(failed === 0 ? 0 : 1);
