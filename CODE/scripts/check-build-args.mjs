#!/usr/bin/env node
/**
 * Fails when src reads a VITE_* variable that the Dockerfile does not declare
 * as an ARG.
 *
 *   npm run check:build-args
 *
 * Vite inlines VITE_* values at build time, and Docker only exposes declared
 * ARGs to `RUN npm run build`. Railway passes service variables as build args,
 * so a variable without an ARG builds with its default and setting it on the
 * service does nothing (a default-on flag's kill switch silently stops working).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) yield path;
  }
}

const used = new Set();
for (const file of sourceFiles(join(root, "src"))) {
  for (const match of readFileSync(file, "utf8").matchAll(/import\.meta\.env\??\.(VITE_[A-Z0-9_]+)/g)) {
    used.add(match[1]);
  }
}

// Only ARGs declared in the build's stage, before the build step, reach it.
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
const buildStep = dockerfile.search(/^RUN\s+npm run build\b/m);
if (buildStep === -1) {
  console.error("Dockerfile has no `RUN npm run build` step.");
  process.exit(1);
}
const stage = dockerfile.slice(0, buildStep).split(/^FROM\s/m).pop();
const declared = new Set([...stage.matchAll(/^\s*ARG\s+(VITE_[A-Z0-9_]+)/gm)].map((match) => match[1]));

const missing = [...used].filter((name) => !declared.has(name)).sort();
if (missing.length > 0) {
  console.error("CODE/Dockerfile needs an ARG before `RUN npm run build` for:");
  for (const name of missing) console.error(`  ARG ${name}`);
  console.error("Without it, setting the variable on Railway never reaches the build.");
  process.exit(1);
}
console.log(`CODE/Dockerfile declares all ${used.size} VITE_* variables read in src.`);
