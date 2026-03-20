/**
 * Validates llms.txt completeness against the monorepo.
 * Usage: pnpm gen:llms
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LLMS_PATH = path.join(ROOT, "skills/consensus-engineer/llms.txt");

async function findPackages(): Promise<Array<{ name: string; dir: string }>> {
  const packages: Array<{ name: string; dir: string }> = [];

  for (const base of ["packages", "packages/adapters", "apps", "examples"]) {
    const baseDir = path.join(ROOT, base);
    let entries: string[];
    try {
      entries = await fs.readdir(baseDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const pkgPath = path.join(baseDir, entry, "package.json");
      try {
        const raw = await fs.readFile(pkgPath, "utf8");
        const pkg = JSON.parse(raw);
        packages.push({
          name: pkg.name || entry,
          dir: path.relative(ROOT, path.join(baseDir, entry)),
        });
      } catch {
        // skip dirs without package.json
      }
    }
  }

  return packages;
}

async function main() {
  const packages = await findPackages();

  let llmsContent: string;
  try {
    llmsContent = await fs.readFile(LLMS_PATH, "utf8");
  } catch {
    console.error(`ERROR: ${LLMS_PATH} not found. Create it first.`);
    process.exit(1);
  }

  console.log(`Found ${packages.length} packages in monorepo:\n`);

  let missing = 0;
  for (const pkg of packages) {
    const found = llmsContent.includes(pkg.name);
    const status = found ? "✓" : "✗ MISSING";
    if (!found) missing++;
    console.log(`  ${status}  ${pkg.name} (${pkg.dir})`);
  }

  console.log(`\n${packages.length - missing}/${packages.length} packages documented in llms.txt`);

  if (missing > 0) {
    console.log(`\n${missing} packages missing from llms.txt — add them!`);
    process.exit(1);
  }

  console.log("\n✓ llms.txt is complete");
}

main();
