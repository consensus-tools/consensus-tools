/**
 * Checks that no publishable package includes a forbidden runtime dependency.
 * LLM provider SDKs must stay in devDependencies only.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  "openai",
  "@anthropic-ai/sdk",
  "anthropic",
  "@google/generative-ai",
  "@google-cloud/aiplatform",
  "langchain",
  "@langchain/core",
  "@langchain/openai",
  "@langchain/anthropic",
  "cohere-ai",
  "ai",
];

const packagesDir = join(process.cwd(), "packages");
const topLevel = readdirSync(packagesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "adapters")
  .map((d) => d.name);
const adaptersDir = join(packagesDir, "adapters");
let adapterDirs = [];
try {
  adapterDirs = readdirSync(adaptersDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join("adapters", d.name));
} catch { /* adapters dir may not exist */ }
const dirs = [...topLevel, ...adapterDirs];

let failed = false;

for (const dir of dirs) {
  const pkgPath = join(packagesDir, dir, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    continue;
  }

  const deps = Object.keys(pkg.dependencies || {});
  const violations = deps.filter((d) => FORBIDDEN.includes(d));

  if (violations.length > 0) {
    console.error(
      `${pkg.name}: forbidden runtime dependencies: ${violations.join(", ")}`
    );
    failed = true;
  }
}

if (failed) {
  console.error(
    "\nLLM provider SDKs must not appear in production dependencies."
  );
  console.error("Move them to devDependencies or remove them.");
  process.exit(1);
} else {
  console.log("Dependency check passed — no forbidden runtime dependencies.");
}
