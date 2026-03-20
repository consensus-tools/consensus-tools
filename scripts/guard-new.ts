/**
 * Scaffold a new guard domain evaluator + test file.
 *
 * Usage: pnpm guard:new <domain-name>
 * Example: pnpm guard:new data-retention
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const EVALUATORS_PATH = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../packages/guards/src/evaluators.ts",
);
const TESTS_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../packages/guards/tests",
);

/** Convert kebab-case to camelCase: "data-retention" -> "dataRetention" */
function toCamelCase(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Convert kebab-case to PascalCase: "data-retention" -> "DataRetention" */
function toPascalCase(kebab: string): string {
  const camel = toCamelCase(kebab);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/** Convert kebab-case to snake_case: "data-retention" -> "data_retention" */
function toSnakeCase(kebab: string): string {
  return kebab.replace(/-/g, "_");
}

async function main() {
  const domain = process.argv[2];

  if (!domain) {
    console.error("Usage: pnpm guard:new <domain-name>");
    console.error("Example: pnpm guard:new data-retention");
    process.exit(1);
  }

  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(domain)) {
    console.error(`Invalid domain name "${domain}". Use kebab-case (e.g. data-retention).`);
    process.exit(1);
  }

  const actionType = toSnakeCase(domain);
  const fnName = `evaluate${toPascalCase(domain)}`;
  const evaluatorLabel = `${domain}-risk`;

  // --- Read evaluators.ts and check for existing domain ---
  const src = await fs.readFile(EVALUATORS_PATH, "utf-8");

  if (src.includes(`case "${actionType}"`)) {
    console.error(`Domain "${domain}" already exists in evaluators.ts (case "${actionType}").`);
    process.exit(1);
  }

  // --- Insert case into the switch ---
  const defaultCaseMarker = "    default:";
  if (!src.includes(defaultCaseMarker)) {
    console.error("Could not locate the default case in evaluatorVotes switch.");
    process.exit(1);
  }

  const newCase = `    case "${actionType}":\n      return ${fnName}(p);\n`;
  const updatedSwitch = src.replace(defaultCaseMarker, newCase + defaultCaseMarker);

  // --- Append evaluator function ---
  const newFn = `
function ${fnName}(p: Record<string, unknown>): GuardVote[] {
  // TODO: implement ${domain} evaluation rules
  return [{ evaluator: "${evaluatorLabel}", vote: "YES", reason: "No blocking rule matched", risk: 0.2 }];
}
`;
  const updatedSrc = updatedSwitch.trimEnd() + "\n" + newFn;

  await fs.writeFile(EVALUATORS_PATH, updatedSrc);
  console.log(`✓ Added case "${actionType}" and ${fnName}() to evaluators.ts`);

  // --- Create test file ---
  const testPath = path.join(TESTS_DIR, `${domain}.test.ts`);

  try {
    await fs.access(testPath);
    console.log(`⚠ Test file already exists: ${testPath} — skipping`);
  } catch {
    const testContent = `import { describe, it, expect } from "vitest";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";
import { evaluatorVotes } from "../src/evaluators.js";

function makeInput(payload: Record<string, unknown> = {}): GuardEvaluateInput {
  return { boardId: "test-board", action: { type: "${actionType}", payload } };
}

describe("${domain} evaluator", () => {
  it("returns YES for default payload", () => {
    const votes = evaluatorVotes(makeInput());
    expect(votes).toHaveLength(1);
    expect(votes[0].evaluator).toBe("${evaluatorLabel}");
    expect(votes[0].vote).toBe("YES");
  });

  // TODO: add domain-specific test cases
});
`;
    await fs.writeFile(testPath, testContent);
    console.log(`✓ Created test file: ${testPath}`);
  }

  console.log("\nNext steps:");
  console.log(`  1. Edit packages/guards/src/evaluators.ts — implement ${fnName}()`);
  console.log(`  2. Edit packages/guards/tests/${domain}.test.ts — add test cases`);
  console.log(`  3. Run: cd packages/guards && pnpm test`);
}

main();
