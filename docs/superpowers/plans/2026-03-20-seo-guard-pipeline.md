# SEO Guard Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-stage consensus guard pipeline that uses MCP GSC data to automatically fix indexing issues on clawsensus-board, with hard-blocks preventing any design, URL, or content changes.

**Architecture:** Two guard evaluators (`seo_fix` and `diff_check`) registered via `createGuardTemplate` into the existing `@consensus-tools/guards` registry. An orchestrator script in clawsensus-board wires MCP GSC → proposals → SEO guard → code apply → diff guard → atomic commits → feature branch PR.

**Tech Stack:** TypeScript, `@consensus-tools/guards` (Vitest), `@consensus-tools/schemas` (Zod), Next.js 16, `mcp-gsc`, Node.js native test runner for orchestrator.

**Spec:** `docs/superpowers/specs/2026-03-20-seo-guard-pipeline-design.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `packages/schemas/src/guard.ts` | **Modify** — extend `guardTypeSchema` enum with `seo_fix`, `diff_check` |
| `packages/guards/src/decision.ts` | **Modify** — add `seo_fix`, `diff_check` to `normalizeGuardType` |
| `packages/guards/src/evaluators/seo-fix.ts` | SEO fix evaluator via `createGuardTemplate` |
| `packages/guards/src/evaluators/diff-check.ts` | Diff check evaluator via `createGuardTemplate` |
| `packages/guards/src/evaluators/seo-taxonomy.ts` | Hard-block regex patterns for SEO domain |
| `packages/guards/src/evaluators/seo-allowed-files.ts` | File path allowlist logic |
| `packages/guards/tests/evaluators/seo-fix.test.ts` | Tests for SEO evaluator |
| `packages/guards/tests/evaluators/diff-check.test.ts` | Tests for diff evaluator |
| `packages/guards/src/index.ts` | **Modify** — re-export new evaluators |
| `../../clawsensus-board/scripts/seo-loop.ts` | Orchestrator script |
| `../../clawsensus-board/scripts/seo-proposal-generator.ts` | Fix proposal generation from GSC data |
| `../../clawsensus-board/seo-policy.json` | Guard policy config |

### Notation

- All paths relative to `/Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools/` unless prefixed with `../../clawsensus-board/`
- Tests use Vitest (`vitest run`) for guards package
- Guard evaluators are ES modules (`.ts` → `.js` imports)

---

## Task 1: Extend GuardType Schema and normalizeGuardType

**Files:**
- Modify: `packages/schemas/src/guard.ts`
- Modify: `packages/guards/src/decision.ts`

- [ ] **Step 1: Read the current schema and decision files**

Read `packages/schemas/src/guard.ts` and `packages/guards/src/decision.ts` to find the `guardTypeSchema` enum and `normalizeGuardType` function.

- [ ] **Step 2: Add `seo_fix` and `diff_check` to the enum**

```typescript
export const guardTypeSchema = z.enum([
  "send_email",
  "code_merge",
  "publish",
  "support_reply",
  "agent_action",
  "deployment",
  "permission_escalation",
  "seo_fix",
  "diff_check",
]);
```

- [ ] **Step 3: Update `normalizeGuardType` in decision.ts**

Add `"seo_fix"` and `"diff_check"` to the map/switch inside `normalizeGuardType()` so they return themselves instead of falling back to `"agent_action"`.

- [ ] **Step 4: Build schemas and guards packages to verify**

Run: `cd packages/schemas && pnpm build && cd ../guards && pnpm build`
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/schemas/src/guard.ts packages/guards/src/decision.ts
git commit -m "feat(schemas): add seo_fix and diff_check to GuardType enum and normalizeGuardType"
```

---

## Task 2: SEO Hard-Block Taxonomy

**Files:**
- Create: `packages/guards/src/evaluators/seo-taxonomy.ts`
- Test: `packages/guards/tests/evaluators/seo-fix.test.ts` (partial — taxonomy tests)

- [ ] **Step 1: Write failing tests for taxonomy patterns**

Create `packages/guards/tests/evaluators/seo-fix.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  SEO_HARD_BLOCK_PATTERNS,
  detectSeoHardBlocks,
} from "../../src/evaluators/seo-taxonomy.js";

describe("SEO hard-block taxonomy", () => {
  describe("DESIGN_MUTATION", () => {
    it("detects className changes", () => {
      const result = detectSeoHardBlocks('className="new-style"');
      expect(result).toContain("DESIGN_MUTATION");
    });

    it("detects style= attributes", () => {
      const result = detectSeoHardBlocks('style={{ color: "red" }}');
      expect(result).toContain("DESIGN_MUTATION");
    });

    it("detects CSS module imports", () => {
      const result = detectSeoHardBlocks('import styles from "./page.module.css"');
      expect(result).toContain("DESIGN_MUTATION");
    });

    it("does NOT flag meta description containing 'style'", () => {
      const result = detectSeoHardBlocks('<meta name="description" content="Our style guide">');
      // "style" alone in content should not trigger — pattern requires style=
      expect(result).not.toContain("DESIGN_MUTATION");
    });
  });

  describe("ROUTE_CHANGE", () => {
    it("detects redirect rules", () => {
      const result = detectSeoHardBlocks("redirects: [{ source: '/old', destination: '/new' }]");
      expect(result).toContain("ROUTE_CHANGE");
    });

    it("detects rewrite rules", () => {
      const result = detectSeoHardBlocks("rewrites: [{ source: '/api', destination: '/v2' }]");
      expect(result).toContain("ROUTE_CHANGE");
    });

    it("detects page.tsx path references", () => {
      const result = detectSeoHardBlocks("app/dashboard/settings/page.tsx");
      expect(result).toContain("ROUTE_CHANGE");
    });
  });

  describe("CONTENT_REWRITE", () => {
    it("detects long visible text changes", () => {
      const result = detectSeoHardBlocks(">This is a paragraph of visible content that users will read<");
      expect(result).toContain("CONTENT_REWRITE");
    });
  });

  it("returns empty array for clean SEO content", () => {
    const result = detectSeoHardBlocks('<meta name="description" content="A short desc">');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/guards && pnpm test -- --run tests/evaluators/seo-fix.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the taxonomy**

Create `packages/guards/src/evaluators/seo-taxonomy.ts`:

```typescript
export type SeoHardBlockFlag = "DESIGN_MUTATION" | "ROUTE_CHANGE" | "CONTENT_REWRITE";

interface PatternGroup {
  flag: SeoHardBlockFlag;
  patterns: RegExp[];
}

const SEO_PATTERN_GROUPS: PatternGroup[] = [
  {
    flag: "DESIGN_MUTATION",
    patterns: [
      /\bclassName\s*=/,
      /\bstyle\s*=/,
      /\.module\.(css|scss|sass)/,
      /\btailwind\b/i,
      /\bcss\b.*\bimport\b|\bimport\b.*\bcss\b/i,
    ],
  },
  {
    flag: "ROUTE_CHANGE",
    patterns: [
      /\bredirects?\s*:/i,
      /\brewrites?\s*:/i,
      /app\/.*\/page\.(tsx|ts|jsx|js)/,
      /\brouter\.(push|replace)\b/,
    ],
  },
  {
    flag: "CONTENT_REWRITE",
    patterns: [
      />[^<]{20,}</,
    ],
  },
];

export const SEO_HARD_BLOCK_PATTERNS: RegExp[] = SEO_PATTERN_GROUPS.flatMap(
  (g) => g.patterns,
);

export function detectSeoHardBlocks(text: string): SeoHardBlockFlag[] {
  const flags: SeoHardBlockFlag[] = [];
  for (const group of SEO_PATTERN_GROUPS) {
    if (group.patterns.some((p) => p.test(text))) {
      flags.push(group.flag);
    }
  }
  return flags;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/guards && pnpm test -- --run tests/evaluators/seo-fix.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/guards/src/evaluators/seo-taxonomy.ts packages/guards/tests/evaluators/seo-fix.test.ts
git commit -m "feat(guards): add SEO hard-block taxonomy patterns"
```

---

## Task 3: File Path Allowlist

**Files:**
- Create: `packages/guards/src/evaluators/seo-allowed-files.ts`
- Modify: `packages/guards/tests/evaluators/seo-fix.test.ts` (add allowlist tests)

- [ ] **Step 1: Add failing tests to seo-fix.test.ts**

Append to the test file:

```typescript
import { isAllowedSeoFile } from "../../src/evaluators/seo-allowed-files.js";

describe("SEO file path allowlist", () => {
  it("allows robots.txt", () => {
    expect(isAllowedSeoFile("robots.txt")).toBe(true);
  });

  it("allows app/robots.ts", () => {
    expect(isAllowedSeoFile("app/robots.ts")).toBe(true);
  });

  it("allows sitemap.xml", () => {
    expect(isAllowedSeoFile("sitemap.xml")).toBe(true);
  });

  it("allows app/sitemap.ts", () => {
    expect(isAllowedSeoFile("app/sitemap.ts")).toBe(true);
  });

  it("allows layout.tsx", () => {
    expect(isAllowedSeoFile("app/layout.tsx")).toBe(true);
  });

  it("allows nested layout.tsx", () => {
    expect(isAllowedSeoFile("app/(web)/layout.tsx")).toBe(true);
  });

  it("blocks CSS files", () => {
    expect(isAllowedSeoFile("app/globals.css")).toBe(false);
  });

  it("blocks component files", () => {
    expect(isAllowedSeoFile("components/Hero.tsx")).toBe(false);
  });

  it("blocks page.tsx files (route definitions)", () => {
    expect(isAllowedSeoFile("app/about/page.tsx")).toBe(false);
  });

  it("allows next.config.mjs", () => {
    expect(isAllowedSeoFile("next.config.mjs")).toBe(true);
  });

  it("allows MDX frontmatter files", () => {
    expect(isAllowedSeoFile("content/docs/intro.mdx")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/guards && pnpm test -- --run tests/evaluators/seo-fix.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the allowlist**

Create `packages/guards/src/evaluators/seo-allowed-files.ts`:

```typescript
const ALLOWED_PATTERNS: RegExp[] = [
  /^robots\.txt$/,
  /^sitemap\.(xml|ts|js)$/,
  /^app\/robots\.(ts|js)$/,
  /^app\/sitemap\.(ts|js)$/,
  /layout\.(tsx|ts|jsx|js)$/,
  /^next\.config\.(mjs|js|ts)$/,
  /\.(mdx|md)$/,
];

const BLOCKED_PATTERNS: RegExp[] = [
  /\.(css|scss|sass)$/,
  /^components\//,
  /page\.(tsx|ts|jsx|js)$/,
  /\.module\.(css|scss)$/,
];

export function isAllowedSeoFile(filePath: string): boolean {
  // Blocked patterns take precedence
  if (BLOCKED_PATTERNS.some((p) => p.test(filePath))) {
    return false;
  }
  return ALLOWED_PATTERNS.some((p) => p.test(filePath));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/guards && pnpm test -- --run tests/evaluators/seo-fix.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/guards/src/evaluators/seo-allowed-files.ts packages/guards/tests/evaluators/seo-fix.test.ts
git commit -m "feat(guards): add SEO file path allowlist"
```

---

## Task 4: SEO Fix Evaluator

**Files:**
- Create: `packages/guards/src/evaluators/seo-fix.ts`
- Modify: `packages/guards/tests/evaluators/seo-fix.test.ts` (add evaluator tests)

- [ ] **Step 1: Add failing tests for the evaluator**

Append to test file:

```typescript
import { seoFixTemplate } from "../../src/evaluators/seo-fix.js";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";

function makeSeoInput(payload: Record<string, unknown>): GuardEvaluateInput {
  return { boardId: "test-board", action: { type: "seo_fix", payload } };
}

describe("seo_fix evaluator", () => {
  it("ALLOWs valid meta_tag fix with evidence", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "meta_tag",
        file_path: "app/layout.tsx",
        description: "Add meta description for homepage",
        proposed_change: '<meta name="description" content="Consensus board for governance">',
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "crawled_not_indexed",
          impressions: 100,
        },
      }),
    );
    expect(votes[0]!.vote).toBe("YES");
    expect(votes[0]!.risk).toBeLessThanOrEqual(0.2);
  });

  it("BLOCKs unknown fix category", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "rewrite_copy",
        file_path: "app/layout.tsx",
        description: "Rewrite the homepage copy",
        proposed_change: "new copy here",
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "not_indexed",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("NO");
  });

  it("BLOCKs disallowed file paths", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "meta_tag",
        file_path: "components/Hero.tsx",
        description: "Add meta tag",
        proposed_change: '<meta name="description">',
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "not_indexed",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("NO");
  });

  it("REWRITEs when GSC evidence is empty", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "meta_tag",
        file_path: "app/layout.tsx",
        description: "Add meta description",
        proposed_change: '<meta name="description">',
        gsc_evidence: {
          affected_urls: [],
          issue_type: "other",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("REWRITE");
  });

  it("hard-blocks proposals with className in proposed_change", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "meta_tag",
        file_path: "app/layout.tsx",
        description: "Update head section",
        proposed_change: '<div className="hero-banner">New section</div>',
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "not_indexed",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("NO");
    expect(votes[0]!.reason).toContain("DESIGN_MUTATION");
  });

  it("assigns higher risk for next.config changes", () => {
    const votes = seoFixTemplate.evaluate(
      makeSeoInput({
        fix_category: "head_tag",
        file_path: "next.config.mjs",
        description: "Add security headers for crawlers",
        proposed_change: "headers config",
        gsc_evidence: {
          affected_urls: ["https://example.com/"],
          issue_type: "not_indexed",
        },
      }),
    );
    expect(votes[0]!.vote).toBe("YES");
    expect(votes[0]!.risk).toBeGreaterThanOrEqual(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/guards && pnpm test -- --run tests/evaluators/seo-fix.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the SEO fix evaluator**

Create `packages/guards/src/evaluators/seo-fix.ts`:

```typescript
import { createGuardTemplate } from "../templates.js";
import { detectSeoHardBlocks, SEO_HARD_BLOCK_PATTERNS } from "./seo-taxonomy.js";
import { isAllowedSeoFile } from "./seo-allowed-files.js";
import type { GuardVote } from "@consensus-tools/schemas";

const ALLOWED_CATEGORIES = new Set([
  "meta_tag",
  "structured_data",
  "sitemap",
  "robots",
  "canonical",
  "alt_text",
  "head_tag",
]);

const RISK_SCORES: Record<string, number> = {
  meta_tag: 0.15,
  robots: 0.15,
  sitemap: 0.15,
  canonical: 0.15,
  alt_text: 0.15,
  structured_data: 0.35,
  head_tag: 0.35,
};

export const seoFixTemplate = createGuardTemplate("seo_fix", {
  description: "Evaluates proposed SEO fixes against allowed categories, file paths, and GSC evidence",
  // NOTE: Do NOT pass hardBlockPatterns here — we call detectSeoHardBlocks() manually
  // inside rules() to get domain-specific flag names (DESIGN_MUTATION, etc.) instead
  // of the generic "Hard-block pattern matched" message from the built-in scanner.
  rules(payload): GuardVote[] {
    const category = String(payload["fix_category"] || "");
    const filePath = String(payload["file_path"] || "");
    const description = String(payload["description"] || "");
    const proposedChange = String(payload["proposed_change"] || "");
    const evidence = (payload["gsc_evidence"] || {}) as Record<string, unknown>;
    const affectedUrls = (evidence["affected_urls"] || []) as string[];
    const issueType = String(evidence["issue_type"] || "other");

    // SEO-specific hard-block scan on description + proposed_change
    const seoFlags = detectSeoHardBlocks(description + "\n" + proposedChange);
    if (seoFlags.length > 0) {
      return [{
        evaluator: "seo-fix",
        vote: "NO",
        reason: `SEO hard-block: ${seoFlags.join(", ")}`,
        risk: 0.95,
      }];
    }

    // Category check
    if (!ALLOWED_CATEGORIES.has(category)) {
      return [{
        evaluator: "seo-fix",
        vote: "NO",
        reason: `Unknown or disallowed fix category: "${category}"`,
        risk: 0.9,
      }];
    }

    // File path check
    if (!isAllowedSeoFile(filePath)) {
      return [{
        evaluator: "seo-fix",
        vote: "NO",
        reason: `File path not in SEO allowlist: "${filePath}"`,
        risk: 0.9,
      }];
    }

    // Evidence check
    if (affectedUrls.length === 0 || (issueType === "other" && !evidence["impressions"])) {
      return [{
        evaluator: "seo-fix",
        vote: "REWRITE",
        reason: "Insufficient GSC evidence — provide affected URLs and specific issue type",
        risk: 0.5,
      }];
    }

    // Risk scoring
    let risk = RISK_SCORES[category] ?? 0.4;
    if (/next\.config/i.test(filePath)) {
      risk = Math.max(risk, 0.55);
    }

    return [{
      evaluator: "seo-fix",
      vote: "YES",
      reason: `Valid ${category} fix for ${affectedUrls.length} URL(s) — ${issueType}`,
      risk,
    }];
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/guards && pnpm test -- --run tests/evaluators/seo-fix.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/guards/src/evaluators/seo-fix.ts packages/guards/tests/evaluators/seo-fix.test.ts
git commit -m "feat(guards): add seo_fix evaluator with category/file/evidence checks"
```

---

## Task 5: Diff Check Evaluator

**Files:**
- Create: `packages/guards/src/evaluators/diff-check.ts`
- Create: `packages/guards/tests/evaluators/diff-check.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/guards/tests/evaluators/diff-check.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { diffCheckTemplate } from "../../src/evaluators/diff-check.js";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";

function makeDiffInput(payload: Record<string, unknown>): GuardEvaluateInput {
  return { boardId: "test-board", action: { type: "diff_check", payload } };
}

const CLEAN_META_DIFF = `--- a/app/layout.tsx
+++ b/app/layout.tsx
@@ -5,6 +5,7 @@
 export const metadata = {
   title: "Consensus Board",
+  description: "Governance decisions made transparent",
 };`;

const DESIGN_MUTATION_DIFF = `--- a/app/layout.tsx
+++ b/app/layout.tsx
@@ -10,6 +10,7 @@
 return (
   <html>
+    <div className="new-wrapper">
     <body>{children}</body>
+    </div>
   </html>`;

const SCOPE_CREEP_DIFF = `--- a/app/layout.tsx
+++ b/app/layout.tsx
@@ -5,6 +5,7 @@
+  description: "New desc",
--- a/components/Hero.tsx
+++ b/components/Hero.tsx
@@ -1,3 +1,3 @@
-export function Hero() {
+export function Hero({ variant }) {`;

const CONTENT_REWRITE_DIFF = `--- a/app/layout.tsx
+++ b/app/layout.tsx
@@ -10,6 +10,7 @@
+        >Welcome to our completely redesigned platform experience<`;

describe("diff_check evaluator", () => {
  it("ALLOWs clean meta tag additions", () => {
    const votes = diffCheckTemplate.evaluate(
      makeDiffInput({
        approved_proposal: { fix_category: "meta_tag", file_path: "app/layout.tsx" },
        git_diff: CLEAN_META_DIFF,
        files_changed: ["app/layout.tsx"],
      }),
    );
    expect(votes[0]!.vote).toBe("YES");
  });

  it("BLOCKs className additions (DESIGN_MUTATION)", () => {
    const votes = diffCheckTemplate.evaluate(
      makeDiffInput({
        approved_proposal: { fix_category: "meta_tag", file_path: "app/layout.tsx" },
        git_diff: DESIGN_MUTATION_DIFF,
        files_changed: ["app/layout.tsx"],
      }),
    );
    expect(votes[0]!.vote).toBe("NO");
    expect(votes[0]!.reason).toContain("DESIGN_MUTATION");
  });

  it("BLOCKs scope creep (unexpected files)", () => {
    const votes = diffCheckTemplate.evaluate(
      makeDiffInput({
        approved_proposal: { fix_category: "meta_tag", file_path: "app/layout.tsx" },
        git_diff: SCOPE_CREEP_DIFF,
        files_changed: ["app/layout.tsx", "components/Hero.tsx"],
      }),
    );
    expect(votes[0]!.vote).toBe("NO");
    expect(votes[0]!.reason).toContain("scope");
  });

  it("BLOCKs content rewrites", () => {
    const votes = diffCheckTemplate.evaluate(
      makeDiffInput({
        approved_proposal: { fix_category: "meta_tag", file_path: "app/layout.tsx" },
        git_diff: CONTENT_REWRITE_DIFF,
        files_changed: ["app/layout.tsx"],
      }),
    );
    expect(votes[0]!.vote).toBe("NO");
    expect(votes[0]!.reason).toContain("CONTENT_REWRITE");
  });

  it("ignores context lines (no + or - prefix)", () => {
    const contextOnlyDiff = `--- a/app/layout.tsx
+++ b/app/layout.tsx
@@ -5,6 +5,7 @@
 <div className="existing-class">
+  description: "New meta desc",
 </div>`;

    const votes = diffCheckTemplate.evaluate(
      makeDiffInput({
        approved_proposal: { fix_category: "meta_tag", file_path: "app/layout.tsx" },
        git_diff: contextOnlyDiff,
        files_changed: ["app/layout.tsx"],
      }),
    );
    // className is a context line (space prefix), should NOT trigger DESIGN_MUTATION
    expect(votes[0]!.vote).toBe("YES");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/guards && pnpm test -- --run tests/evaluators/diff-check.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the diff check evaluator**

Create `packages/guards/src/evaluators/diff-check.ts`:

```typescript
import { createGuardTemplate } from "../templates.js";
import { detectSeoHardBlocks } from "./seo-taxonomy.js";
import type { GuardVote } from "@consensus-tools/schemas";

/**
 * Extract only added/removed lines from a unified diff.
 * Ignores context lines (space prefix) and file headers (+++/---).
 */
function extractChangedLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) return false;
      return line.startsWith("+") || line.startsWith("-");
    })
    .map((line) => line.slice(1)); // Remove the +/- prefix
}

export const diffCheckTemplate = createGuardTemplate("diff_check", {
  description: "Validates git diff matches approved SEO proposal — no design, route, or content drift",
  rules(payload): GuardVote[] {
    const proposal = (payload["approved_proposal"] || {}) as Record<string, unknown>;
    const diff = String(payload["git_diff"] || "");
    const filesChanged = (payload["files_changed"] || []) as string[];
    const approvedFile = String(proposal["file_path"] || "");

    // Scope match: only approved files should be in the diff
    const unexpectedFiles = filesChanged.filter((f) => f !== approvedFile);
    if (unexpectedFiles.length > 0) {
      return [{
        evaluator: "diff-check",
        vote: "NO",
        reason: `Diff touches files outside scope: ${unexpectedFiles.join(", ")}`,
        risk: 0.95,
      }];
    }

    // Extract only changed lines for scanning
    const changedText = extractChangedLines(diff).join("\n");

    // SEO hard-block scan on changed lines only
    const seoFlags = detectSeoHardBlocks(changedText);
    if (seoFlags.length > 0) {
      return [{
        evaluator: "diff-check",
        vote: "NO",
        reason: `Diff contains prohibited changes: ${seoFlags.join(", ")}`,
        risk: 0.95,
      }];
    }

    return [{
      evaluator: "diff-check",
      vote: "YES",
      reason: `Diff matches approved ${proposal["fix_category"]} fix for ${approvedFile}`,
      risk: 0.1,
    }];
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/guards && pnpm test -- --run tests/evaluators/diff-check.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/guards/src/evaluators/diff-check.ts packages/guards/tests/evaluators/diff-check.test.ts
git commit -m "feat(guards): add diff_check evaluator with scope/design/route/content safety"
```

---

## Task 6: Register Evaluators and Export

**Files:**
- Modify: `packages/guards/src/index.ts`

- [ ] **Step 1: Read current index.ts**

Read `packages/guards/src/index.ts` to see current exports.

- [ ] **Step 2: Add exports for new evaluators**

Add to the end of `packages/guards/src/index.ts`:

```typescript
// SEO guard evaluators
export { seoFixTemplate } from "./evaluators/seo-fix.js";
export { diffCheckTemplate } from "./evaluators/diff-check.js";
export { detectSeoHardBlocks, SEO_HARD_BLOCK_PATTERNS } from "./evaluators/seo-taxonomy.js";
export { isAllowedSeoFile } from "./evaluators/seo-allowed-files.js";
```

- [ ] **Step 3: Build guards package**

Run: `cd packages/guards && pnpm build`
Expected: Clean build.

- [ ] **Step 4: Run all guard tests**

Run: `cd packages/guards && pnpm test`
Expected: All tests pass (existing + new).

- [ ] **Step 5: Commit**

```bash
git add packages/guards/src/index.ts
git commit -m "feat(guards): export seo_fix and diff_check evaluators"
```

---

## Task 7: SEO Policy Config

**Files:**
- Create: `../../clawsensus-board/seo-policy.json`

- [ ] **Step 1: Create the policy config**

Create `../../clawsensus-board/seo-policy.json`:

```json
{
  "policyId": "seo-fix-policy",
  "version": "1.0.0",
  "quorum": 0.7,
  "riskThreshold": 0.5,
  "hitlRequiredAboveRisk": 0.6,
  "maxFixesPerRun": 10,
  "targetBranch": "main",
  "allowedCategories": [
    "meta_tag",
    "structured_data",
    "sitemap",
    "robots",
    "canonical",
    "alt_text",
    "head_tag"
  ],
  "options": {}
}
```

- [ ] **Step 2: Commit**

```bash
git add ../../clawsensus-board/seo-policy.json
git commit -m "feat(clawsensus-board): add SEO guard policy config"
```

---

## Task 8: Proposal Generator

**Files:**
- Create: `../../clawsensus-board/scripts/seo-proposal-generator.ts`

- [ ] **Step 1: Implement the proposal generator**

This module takes GSC indexing data and generates fix proposals. Create `../../clawsensus-board/scripts/seo-proposal-generator.ts`:

```typescript
interface GscIssue {
  url: string;
  issue_type: "not_indexed" | "crawled_not_indexed" | "discovered_not_indexed" | "redirect" | "soft_404" | "other";
  impressions?: number;
  clicks?: number;
}

interface SeoFixProposal {
  fix_category: string;
  file_path: string;
  description: string;
  proposed_change: string;
  gsc_evidence: {
    affected_urls: string[];
    issue_type: string;
    impressions?: number;
    clicks?: number;
  };
}

/**
 * Map a URL path to the most likely layout file that controls its metadata.
 * E.g., "/" → "app/layout.tsx", "/blog" → "app/(web)/blog/layout.tsx" or fallback.
 */
function urlToLayoutPath(url: string): string {
  const path = new URL(url).pathname;
  if (path === "/") return "app/layout.tsx";
  // Strip leading slash, map to app directory
  const segments = path.replace(/^\//, "").split("/");
  // Try nested layout first, fall back to root
  return `app/${segments.join("/")}/layout.tsx`;
}

export function generateProposals(issues: GscIssue[]): SeoFixProposal[] {
  const proposals: SeoFixProposal[] = [];

  // Group issues by URL for deduplication
  const byUrl = new Map<string, GscIssue[]>();
  for (const issue of issues) {
    const existing = byUrl.get(issue.url) || [];
    existing.push(issue);
    byUrl.set(issue.url, existing);
  }

  for (const [url, urlIssues] of byUrl) {
    const primary = urlIssues[0]!;

    // Proposal 1: Ensure meta description exists
    proposals.push({
      fix_category: "meta_tag",
      file_path: urlToLayoutPath(url),
      description: `Add or improve meta description for ${url}`,
      proposed_change: `export const metadata = { description: "..." }`,
      gsc_evidence: {
        affected_urls: [url],
        issue_type: primary.issue_type,
        impressions: primary.impressions,
        clicks: primary.clicks,
      },
    });

    // Proposal 2: Ensure page is in sitemap
    proposals.push({
      fix_category: "sitemap",
      file_path: "app/sitemap.ts",
      description: `Ensure ${url} is included in sitemap`,
      proposed_change: `Add { url: "${url}", lastModified: new Date() } to sitemap entries`,
      gsc_evidence: {
        affected_urls: [url],
        issue_type: primary.issue_type,
        impressions: primary.impressions,
        clicks: primary.clicks,
      },
    });

    // Proposal 3: Check robots.txt isn't blocking
    if (primary.issue_type === "not_indexed" || primary.issue_type === "crawled_not_indexed") {
      proposals.push({
        fix_category: "robots",
        file_path: "robots.txt",
        description: `Verify robots.txt is not blocking ${url}`,
        proposed_change: `Ensure no Disallow rule matches ${new URL(url).pathname}`,
        gsc_evidence: {
          affected_urls: [url],
          issue_type: primary.issue_type,
          impressions: primary.impressions,
          clicks: primary.clicks,
        },
      });
    }

    // Proposal 4: Add structured data for better indexing signals
    if (primary.issue_type === "discovered_not_indexed") {
      proposals.push({
        fix_category: "structured_data",
        file_path: urlToLayoutPath(url),
        description: `Add JSON-LD structured data to improve indexing signals for ${url}`,
        proposed_change: `<script type="application/ld+json">{ "@context": "https://schema.org", ... }</script>`,
        gsc_evidence: {
          affected_urls: [url],
          issue_type: primary.issue_type,
          impressions: primary.impressions,
          clicks: primary.clicks,
        },
      });
    }

    // Proposal 5: Add canonical tag
    proposals.push({
      fix_category: "canonical",
      file_path: urlToLayoutPath(url),
      description: `Add canonical URL for ${url}`,
      proposed_change: `alternates: { canonical: "${url}" }`,
      gsc_evidence: {
        affected_urls: [url],
        issue_type: primary.issue_type,
        impressions: primary.impressions,
        clicks: primary.clicks,
      },
    });
  }

  // Sort by impact: highest impressions first
  proposals.sort((a, b) => (b.gsc_evidence.impressions ?? 0) - (a.gsc_evidence.impressions ?? 0));

  return proposals;
}
```

- [ ] **Step 2: Commit**

```bash
git add ../../clawsensus-board/scripts/seo-proposal-generator.ts
git commit -m "feat(clawsensus-board): add SEO fix proposal generator from GSC data"
```

---

## Task 9: Orchestrator Script

**Files:**
- Create: `../../clawsensus-board/scripts/seo-loop.ts`

- [ ] **Step 1: Implement the orchestrator**

Create `../../clawsensus-board/scripts/seo-loop.ts`:

```typescript
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Types
interface SeoPolicy {
  policyId: string;
  version: string;
  quorum: number;
  riskThreshold: number;
  hitlRequiredAboveRisk: number;
  maxFixesPerRun: number;
  targetBranch: string;
  allowedCategories: string[];
}

interface LoopResult {
  total: number;
  applied: number;
  blocked: number;
  rewriteRetries: number;
  requireHuman: number;
  commits: string[];
}

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const CATEGORY_FILTER = args.includes("--category")
  ? args[args.indexOf("--category") + 1]
  : undefined;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

function log(msg: string): void {
  console.log(`[seo-loop] ${msg}`);
}

function verbose(msg: string): void {
  if (VERBOSE) console.log(`[seo-loop:verbose] ${msg}`);
}

function loadPolicy(): SeoPolicy {
  const policyPath = resolve(PROJECT_ROOT, "seo-policy.json");
  if (!existsSync(policyPath)) {
    throw new Error(`Policy file not found: ${policyPath}`);
  }
  return JSON.parse(readFileSync(policyPath, "utf-8")) as SeoPolicy;
}

function gitDiff(): string {
  return execSync("git diff", { cwd: PROJECT_ROOT, encoding: "utf-8" });
}

function gitDiffFiles(): string[] {
  const output = execSync("git diff --name-only", { cwd: PROJECT_ROOT, encoding: "utf-8" });
  return output.trim().split("\n").filter(Boolean);
}

function gitCheckoutClean(): void {
  execSync("git checkout .", { cwd: PROJECT_ROOT });
}

function gitAddAndCommit(files: string[], message: string): string {
  for (const file of files) {
    execSync(`git add "${file}"`, { cwd: PROJECT_ROOT });
  }
  execSync(`git commit -m "${message}"`, { cwd: PROJECT_ROOT });
  return execSync("git rev-parse HEAD", { cwd: PROJECT_ROOT, encoding: "utf-8" }).trim();
}

async function main(): Promise<void> {
  const policy = loadPolicy();
  log(`Loaded policy: ${policy.policyId} v${policy.version}`);
  log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  if (CATEGORY_FILTER) {
    log(`Category filter: ${CATEGORY_FILTER}`);
  }

  // Dynamic imports for guard evaluators
  const { seoFixTemplate, diffCheckTemplate } = await import("@consensus-tools/guards");
  const { GuardEvaluatorRegistry } = await import("@consensus-tools/guards");
  const { computeDecision } = await import("@consensus-tools/guards");

  // Register evaluators
  const registry = new GuardEvaluatorRegistry();
  seoFixTemplate.register(registry);
  diffCheckTemplate.register(registry);

  // Create feature branch before making any changes
  if (!DRY_RUN) {
    const branchName = `seo/fix-${new Date().toISOString().slice(0, 10)}`;
    log(`Creating feature branch: ${branchName}`);
    try {
      execSync(`git checkout -b ${branchName}`, { cwd: PROJECT_ROOT });
    } catch {
      // Branch may already exist from a previous run
      execSync(`git checkout ${branchName}`, { cwd: PROJECT_ROOT });
    }
  }

  // Phase 1: AUDIT — fetch GSC data via MCP
  log("Phase 1: AUDIT — querying GSC for indexing issues...");
  // TODO: Wire MCP GSC client here. For now, expect GSC data piped via stdin or a JSON file.
  const gscDataPath = resolve(PROJECT_ROOT, ".gsc-data.json");
  if (!existsSync(gscDataPath)) {
    log("No GSC data found at .gsc-data.json. Run with MCP GSC or provide data file.");
    log("Expected format: [{ url, issue_type, impressions?, clicks? }, ...]");
    process.exit(1);
  }
  const gscIssues = JSON.parse(readFileSync(gscDataPath, "utf-8"));
  log(`Found ${gscIssues.length} indexing issues`);

  // Phase 2: PROPOSE
  log("Phase 2: PROPOSE — generating fix proposals...");
  const { generateProposals } = await import("./seo-proposal-generator.js");
  let proposals = generateProposals(gscIssues);

  if (CATEGORY_FILTER) {
    proposals = proposals.filter((p) => p.fix_category === CATEGORY_FILTER);
  }

  // Cap at maxFixesPerRun
  proposals = proposals.slice(0, policy.maxFixesPerRun);
  log(`Generated ${proposals.length} proposals`);

  const result: LoopResult = {
    total: proposals.length,
    applied: 0,
    blocked: 0,
    rewriteRetries: 0,
    requireHuman: 0,
    commits: [],
  };

  for (let i = 0; i < proposals.length; i++) {
    const proposal = proposals[i]!;
    log(`\n--- Proposal ${i + 1}/${proposals.length}: ${proposal.fix_category} — ${proposal.description} ---`);

    // Phase 3: GUARD Stage 1 — SEO Guard
    verbose("Phase 3: Running SEO guard...");
    const seoInput = {
      boardId: "clawsensus-board",
      runId: `seo-run-${Date.now()}-${i}`,
      agentId: "seo-loop",
      action: { type: "seo_fix", payload: proposal as unknown as Record<string, unknown> },
    };

    const seoVotes = registry.evaluate(seoInput);
    const seoDecision = computeDecision(
      seoVotes.map((v) => ({ ...v, weight: 1, confidence: 1, reputation: 100 })),
      { quorum: policy.quorum, riskThreshold: policy.riskThreshold },
      "static",
    );

    verbose(`SEO guard decision: ${seoDecision.decision} (risk: ${seoDecision.combinedRisk})`);

    if (seoDecision.decision === "BLOCK") {
      log(`BLOCKED: ${seoVotes[0]?.reason}`);
      result.blocked++;
      continue;
    }

    if (seoDecision.decision === "REQUIRE_HUMAN") {
      log(`REQUIRE_HUMAN: ${seoVotes[0]?.reason} — skipping, needs manual review`);
      result.requireHuman++;
      continue;
    }

    if (seoDecision.decision === "REWRITE") {
      log(`REWRITE requested: ${seoVotes[0]?.reason} — skipping (proposal regeneration not yet implemented)`);
      result.rewriteRetries++;
      continue;
    }

    // Phase 4: APPLY (skip in dry-run)
    if (DRY_RUN) {
      log(`DRY RUN — would apply: ${proposal.description}`);
      result.applied++;
      continue;
    }

    log("Phase 4: Applying fix...");
    // TODO: Apply the actual code change. For now, log what would be done.
    log(`  File: ${proposal.file_path}`);
    log(`  Change: ${proposal.proposed_change}`);
    log("  (Auto-apply not yet implemented — manual application required)");

    // Phase 5: GUARD Stage 2 — Diff Guard
    const diff = gitDiff();
    const changedFiles = gitDiffFiles();

    if (diff.trim() === "") {
      verbose("No changes detected after apply — skipping diff guard");
      continue;
    }

    verbose("Phase 5: Running diff guard...");
    const diffInput = {
      boardId: "clawsensus-board",
      runId: seoInput.runId,
      agentId: "seo-loop",
      action: {
        type: "diff_check",
        payload: {
          approved_proposal: proposal,
          git_diff: diff,
          files_changed: changedFiles,
        } as unknown as Record<string, unknown>,
      },
    };

    const diffVotes = registry.evaluate(diffInput);
    const diffDecision = computeDecision(
      diffVotes.map((v) => ({ ...v, weight: 1, confidence: 1, reputation: 100 })),
      { quorum: policy.quorum, riskThreshold: policy.riskThreshold },
      "static",
    );

    verbose(`Diff guard decision: ${diffDecision.decision}`);

    if (diffDecision.decision !== "ALLOW") {
      log(`Diff guard ${diffDecision.decision}: ${diffVotes[0]?.reason} — reverting`);
      gitCheckoutClean();
      result.blocked++;
      continue;
    }

    // Phase 6: COMMIT
    log("Phase 6: Committing...");
    const commitMsg = `seo(fix): ${proposal.description} [guard:ALLOW]`;
    const sha = gitAddAndCommit(changedFiles, commitMsg);
    log(`Committed: ${sha.slice(0, 8)}`);
    result.commits.push(sha);
    result.applied++;
  }

  // Summary
  log("\n=== SEO Loop Complete ===");
  log(`Total proposals: ${result.total}`);
  log(`Applied: ${result.applied}`);
  log(`Blocked: ${result.blocked}`);
  log(`Rewrite retries: ${result.rewriteRetries}`);
  log(`Require human: ${result.requireHuman}`);
  log(`Commits: ${result.commits.length}`);

  // Push feature branch + open PR (skip in dry-run)
  if (!DRY_RUN && result.commits.length > 0) {
    const branchName = `seo/fix-${new Date().toISOString().slice(0, 10)}`;
    execSync(`git push -u origin ${branchName}`, { cwd: PROJECT_ROOT });
    log(`Pushed to ${branchName}`);
    log("Open a PR via: gh pr create");
  }
}

main().catch((err) => {
  console.error("[seo-loop] Fatal error:", err);
  try {
    gitCheckoutClean();
  } catch {
    // Ignore cleanup errors
  }
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add ../../clawsensus-board/scripts/seo-loop.ts
git commit -m "feat(clawsensus-board): add SEO loop orchestrator script"
```

---

## Task 10: MCP GSC Integration

**Files:**
- Modify: `../../clawsensus-board/package.json` (add mcp-gsc dependency)

- [ ] **Step 1: Check if mcp-gsc is available on npm**

Run: `npm view mcp-gsc version 2>/dev/null || echo "not found"`

If not found, check alternatives:
Run: `npm view @anthropic-ai/mcp-gsc version 2>/dev/null || npm search mcp-gsc --json 2>/dev/null | head -20`

- [ ] **Step 2: Add dependency**

Run: `cd ../../clawsensus-board && npm install --save-dev mcp-gsc` (adjust package name based on Step 1 findings)

If npm package doesn't exist, clone the GitHub repo instead:
Run: `git clone https://github.com/AminForou/mcp-gsc.git ../../mcp-gsc`

- [ ] **Step 3: Add @consensus-tools/guards dependency**

Run: `cd ../../clawsensus-board && npm install --save-dev @consensus-tools/guards`

Or if using local path:
Add to `package.json` devDependencies: `"@consensus-tools/guards": "file:../consensus-tools/packages/guards"`

- [ ] **Step 4: Commit**

```bash
cd ../../clawsensus-board && git add package.json package-lock.json
git commit -m "feat(clawsensus-board): add mcp-gsc and guards dependencies"
```

---

## Task 11: End-to-End Dry Run Test

**Files:**
- Create: `../../clawsensus-board/.gsc-data.json` (test fixture)

- [ ] **Step 1: Create mock GSC data**

Create `../../clawsensus-board/.gsc-data.json`:

```json
[
  {
    "url": "https://clawsensus.com/",
    "issue_type": "crawled_not_indexed",
    "impressions": 500,
    "clicks": 12
  },
  {
    "url": "https://clawsensus.com/docs",
    "issue_type": "discovered_not_indexed",
    "impressions": 200,
    "clicks": 3
  },
  {
    "url": "https://clawsensus.com/pricing",
    "issue_type": "not_indexed",
    "impressions": 0,
    "clicks": 0
  }
]
```

- [ ] **Step 2: Run dry-run**

Run: `cd ../../clawsensus-board && npx tsx scripts/seo-loop.ts --dry-run --verbose`

Expected output:
- Policy loaded
- 3 issues found
- Proposals generated (meta_tag, sitemap, robots, canonical, structured_data)
- Each proposal evaluated by SEO guard
- DRY RUN messages for ALLOWed proposals
- Summary with counts

- [ ] **Step 3: Add .gsc-data.json to .gitignore**

Append to `../../clawsensus-board/.gitignore`:
```
.gsc-data.json
```

- [ ] **Step 4: Commit**

```bash
cd ../../clawsensus-board && git add .gitignore
git commit -m "chore(clawsensus-board): add .gsc-data.json to gitignore"
```

---

## Task 12: Full Pipeline Build Verification

- [ ] **Step 1: Build all packages**

Run: `cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools && pnpm build`
Expected: Clean build across all packages.

- [ ] **Step 2: Run all guard tests**

Run: `cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools && pnpm test`
Expected: All tests pass including new SEO evaluator tests.

- [ ] **Step 3: Run dry-run end-to-end**

Run: `cd ../../clawsensus-board && npx tsx scripts/seo-loop.ts --dry-run --verbose`
Expected: Full pipeline executes without errors.

- [ ] **Step 4: Verify audit trail**

Check that guard decisions would be logged (in dry-run mode, verify log output shows decision + reason for each proposal).

---

## Summary

| Task | Component | Est. |
|---|---|---|
| 1 | Schema extension | 2 min |
| 2 | SEO taxonomy | 5 min |
| 3 | File path allowlist | 5 min |
| 4 | SEO fix evaluator | 5 min |
| 5 | Diff check evaluator | 5 min |
| 6 | Register + export | 3 min |
| 7 | Policy config | 2 min |
| 8 | Proposal generator | 5 min |
| 9 | Orchestrator script | 5 min |
| 10 | MCP GSC integration | 5 min |
| 11 | E2E dry run test | 5 min |
| 12 | Full build verification | 3 min |
