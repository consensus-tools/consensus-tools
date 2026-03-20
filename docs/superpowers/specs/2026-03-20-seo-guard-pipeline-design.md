# SEO Guard Pipeline Design

**Date:** 2026-03-20
**Status:** Draft
**Target:** clawsensus-board (Next.js 16 + React 19)

## Problem

clawsensus-board has indexing issues in Google Search Console. Pages are not being crawled or indexed properly. We need an automated pipeline that:

1. Pulls live GSC data to identify indexing problems
2. Proposes technical SEO fixes (meta tags, sitemaps, structured data, etc.)
3. Validates each fix through a consensus guard before applying
4. Validates the resulting code diff against the approved proposal before committing
5. Commits and pushes to a feature branch, opens a PR

**Design constraint:** The site's visual design, URL structure, and visible content must never be altered. Only invisible/technical SEO changes are permitted.

## Architecture

### Two-Stage Guard Pipeline

```
GSC Data (MCP) → Indexing Analyzer → Fix Proposals
    → Stage 1: SEO Guard (is this the right fix?)
    → Code Changes Applied
    → Stage 2: Diff Guard (does the code match the proposal? no design/URL/content breakage?)
    → Commit to feature branch → Open PR
```

### Components

| Component | Location | Purpose |
|---|---|---|
| `seo_fix` evaluator | registered in `@consensus-tools/guards` via `createGuardTemplate` | SEO fix evaluation + hard-block taxonomy |
| `diff_check` evaluator | registered in `@consensus-tools/guards` via `createGuardTemplate` | Validates code diff matches approved proposal |
| `seo-loop.ts` | `clawsensus-board/scripts/` | Orchestrator: audit → propose → guard → apply → diff-guard → commit |
| `seo-policy.json` | `clawsensus-board/` | Guard policy config (quorum, risk, allowed categories) |
| MCP GSC | MCP server (external) | Live GSC data feed |

### Integration with Existing Guards

The SEO and diff evaluators are **not** a standalone package. They are registered into the existing `GuardEvaluatorRegistry` using `createGuardTemplate()`, following the consolidated guard architecture in `@consensus-tools/guards`.

The `guardTypeSchema` enum in `@consensus-tools/schemas` will be extended to include `"seo_fix"` and `"diff_check"` so audit trail entries retain domain specificity rather than falling back to `"agent_action"`.

### Implementation Files

```
consensus-tools/packages/guards/src/
├── evaluators/
│   ├── seo-fix.ts            # seo_fix evaluator via createGuardTemplate
│   └── diff-check.ts         # diff_check evaluator via createGuardTemplate
├── evaluators/tests/
│   ├── seo-fix.test.ts
│   └── diff-check.test.ts

consensus-tools/packages/schemas/src/
└── guard.ts                  # Extended GuardType enum (+seo_fix, +diff_check)

clawsensus-board/scripts/
├── seo-loop.ts               # Orchestrator
└── seo-taxonomy.ts           # SEO-specific hard-block patterns
```

## Component 1: SEO Fix Evaluator

### Hard-Block Taxonomy

These patterns trigger automatic BLOCK regardless of vote scores. Defined as `hardBlockPatterns` (RegExp arrays) passed to `createGuardTemplate`:

| Flag | Detection Patterns | Examples |
|---|---|---|
| `DESIGN_MUTATION` | `/\bclassName\b/`, `/\bstyle\s*=/`, `/\bcss\b/i`, `/\btailwind\b/i`, `/\.module\.(css\|scss)/` | Adding a div, changing a className, modifying styles |
| `ROUTE_CHANGE` | `/\brewrite/`, `/\bredirect/`, `/\bapp\/.*\/page\.(tsx\|ts)/`, `/\brouting\b/i` | Changing `next.config` rewrites, renaming `app/` directories |
| `CONTENT_REWRITE` | `/>[^<]{20,}</`, `/\b(heading\|paragraph\|button\|label)\b/i` | Changing heading text, paragraph content, button labels |

Inherits core taxonomy from `consensus-guard-core`: `SENSITIVE_DATA`, `LEGAL_CLAIM`, `MEDICAL_CLAIM`, `THREAT_OR_HARASSMENT`, `CONFIDENTIALITY_BREACH`, `WRONGDOING_INSTRUCTION`, `DISALLOWED_GUARANTEE`.

**Hard-block text extraction:** The evaluator scans the `description` and `proposed_change` fields (for SEO evaluator) and `git_diff` field (for diff evaluator). This is handled by the evaluator function itself, not by the core `extractText()` method, since the SEO payload uses non-standard field names.

### Allowed Fix Categories

Only these categories can receive an ALLOW decision. The authoritative source is `seo-policy.json` — the evaluator reads from the policy config, not a hardcoded list.

| Category | Scope |
|---|---|
| `meta_tag` | `<title>`, `<meta name="description">`, `og:*`, `twitter:*` tags |
| `structured_data` | `<script type="application/ld+json">` blocks |
| `sitemap` | `sitemap.xml` or `app/sitemap.ts` generation |
| `robots` | `robots.txt` or `app/robots.ts` configuration |
| `canonical` | `<link rel="canonical">` tags |
| `alt_text` | `alt` attributes on `<img>` elements |
| `head_tag` | Other `<head>` technical tags (hreflang, viewport, etc.) |

### SEO Evaluator Input

Wrapped in the standard `GuardEvaluateInput` envelope. The orchestrator constructs the full input including `boardId` and `runId`.

```typescript
interface SeoFixPayload {
  fix_category: "meta_tag" | "structured_data" | "sitemap" | "robots" | "canonical" | "alt_text" | "head_tag";
  file_path: string;
  description: string;
  proposed_change: string;
  gsc_evidence: {
    affected_urls: string[];
    issue_type: "not_indexed" | "crawled_not_indexed" | "discovered_not_indexed" | "redirect" | "soft_404" | "other";
    impressions?: number;
    clicks?: number;
  };
}

// Full input as submitted to GuardHandler:
// {
//   boardId: "clawsensus-board",
//   runId: "<uuid>",
//   agentId: "seo-loop",
//   action: { type: "seo_fix", payload: SeoFixPayload },
//   policyPack: "seo-fix-policy"
// }
```

### SEO Evaluator Voting Logic

The evaluator produces votes based on:

1. **Category check** — Is `fix_category` in the policy's `allowedCategories`? NO if unknown.
2. **File path check** — Does `file_path` only touch allowed files? Allowed: `layout.tsx` head section, `robots.txt`, `sitemap.xml`, `sitemap.ts`, `robots.ts`, MDX frontmatter (not body), `next.config.mjs` (metadata only). NO if it touches CSS files, component bodies, route definitions.
3. **Evidence check** — Is there GSC data backing this fix? REWRITE if `affected_urls` is empty or `issue_type` is "other" with no specifics.
4. **Risk scoring:**
   - Low (0.1-0.2): meta tags, robots.txt, sitemap, canonical, alt text
   - Medium (0.3-0.4): structured data, head tags
   - Higher (0.5-0.6): anything touching `next.config.mjs`

### SEO Evaluator Output

Standard `GuardResult` with `guard_type: "seo_fix"` (valid after schema extension).

## Component 2: Diff Guard

### Purpose

After code changes are applied, verify the actual git diff matches the approved SEO proposal. Catches drift, accidental design changes, or scope creep before committing.

### Diff Evaluator Input

Wrapped in the standard `GuardEvaluateInput` envelope (includes `boardId`, `runId`).

```typescript
interface DiffCheckPayload {
  approved_proposal: SeoFixPayload;       // What was approved in Stage 1
  git_diff: string;                        // Actual diff output
  files_changed: string[];                 // Files in the diff
}

// Full input as submitted to GuardHandler:
// {
//   boardId: "clawsensus-board",
//   runId: "<same-run-id-as-stage-1>",
//   agentId: "seo-loop",
//   action: { type: "diff_check", payload: DiffCheckPayload },
//   policyPack: "seo-fix-policy"
// }
```

### Diff Evaluator Voting Logic

**Important:** All pattern scanning applies only to added/removed lines in the diff (lines starting with `+` or `-`, excluding `+++`/`---` file headers). Context lines (prefixed with space) are ignored to prevent false positives.

1. **Scope match** — Did the diff only touch files listed in the proposal? BLOCK if unexpected files changed.
2. **Design safety** — Scan added/removed diff lines for:
   - CSS property changes (`style=`, `className=` additions/removals)
   - Component JSX restructuring (new DOM elements, removed elements)
   - Tailwind class changes
   - BLOCK on `DESIGN_MUTATION`
3. **Route safety** — Scan added/removed diff lines for:
   - Path changes in `next.config`
   - New/renamed page directories under `app/`
   - Redirect rules
   - BLOCK on `ROUTE_CHANGE`
4. **Content safety** — Scan added/removed diff lines for:
   - Changes to visible text inside JSX (text between `>` and `<`)
   - MDX body content changes (below frontmatter)
   - BLOCK on `CONTENT_REWRITE`
5. **Allowlist pass** — If diff only modifies `<head>`, `<meta>`, `<script type="application/ld+json">`, `robots.txt`, `sitemap.xml`, `alt` attributes → ALLOW

### On BLOCK/REWRITE

The orchestrator:
1. Rolls back changes (`git checkout .`)
2. Logs the block reason to the audit trail
3. On REWRITE: regenerates and re-applies the fix with narrower scope, then re-runs diff guard (max 2 retries of the full apply → diff-guard sequence)
4. On BLOCK: skips this fix, moves to next proposal

## Component 3: Orchestrator (seo-loop.ts)

### Location

`clawsensus-board/scripts/seo-loop.ts`

### Loop Phases

```
Phase 1: AUDIT
  └─ Query MCP GSC for indexing coverage report
  └─ Identify pages with issues (not_indexed, crawled_not_indexed, etc.)
  └─ Rank by impact (pages with most impressions/potential first)

Phase 2: PROPOSE
  └─ For each issue, generate 1+ fix proposals (single file per proposal)
  └─ Each proposal specifies: fix_category, file_path, description, gsc_evidence
  └─ Multi-file fixes are decomposed into separate single-file proposals

Phase 3: GUARD (Stage 1 — SEO Guard)
  └─ For each proposal: run through seo_fix evaluator via GuardHandler
  └─ ALLOW → proceed to Phase 4
  └─ REWRITE → regenerate proposal with guard feedback, re-submit
      (max 3 retries; retries regenerate the proposal, not just re-evaluate)
  └─ BLOCK → skip, log reason
  └─ REQUIRE_HUMAN → write board artifact with proposal details, print
      summary to stdout, exit loop for this fix (operator reviews board
      artifact and can manually apply or dismiss)

Phase 4: APPLY
  └─ Apply the approved fix to the codebase
  └─ Only touch files specified in the proposal

Phase 5: GUARD (Stage 2 — Diff Guard)
  └─ Run git diff against the approved proposal via diff_check evaluator
  └─ ALLOW → proceed to Phase 6
  └─ BLOCK → git checkout ., log reason, skip this fix
  └─ REWRITE → revert (git checkout .), regenerate with narrower scope,
      re-apply, re-run diff guard (max 2 retries of full apply → guard cycle)

Phase 6: COMMIT
  └─ git add <specific files only>
  └─ git commit with message: "seo(fix): <description> [guard:ALLOW]"

After all fixes processed:
  └─ Push feature branch (seo/fix-<date>)
  └─ Open PR against main via gh pr create

Repeat Phases 2-6 for each issue until all are processed.
```

### Safety Rails

- **Max 10 fixes per run** — avoid flooding the repo with changes
- **Atomic commits** — each fix is a separate commit, easy to revert individually
- **Full audit trail** — every decision written to board via `GuardHandler`
- **Dry-run mode** — `--dry-run` flag runs the full pipeline but skips Phases 4-6 (no code changes, no commits)
- **Rollback on failure** — any unhandled error triggers `git checkout .` to clean working tree
- **Feature branch + PR** — never pushes directly to main; all changes go through a PR

### Configuration

```jsonc
// clawsensus-board/seo-policy.json
{
  "policyId": "seo-fix-policy",
  "version": "1.0.0",
  "quorum": 0.7,
  "riskThreshold": 0.5,
  "hitlRequiredAboveRisk": 0.6,
  "maxFixesPerRun": 10,
  "targetBranch": "main",
  "allowedCategories": [
    "meta_tag", "structured_data", "sitemap",
    "robots", "canonical", "alt_text", "head_tag"
  ],
  "options": {}
}
```

### CLI Interface

```bash
# Full automated run
npx tsx scripts/seo-loop.ts

# Dry run (audit + propose + guard, no apply/commit)
npx tsx scripts/seo-loop.ts --dry-run

# Single fix category only
npx tsx scripts/seo-loop.ts --category meta_tag

# Verbose logging
npx tsx scripts/seo-loop.ts --verbose
```

## Component 4: MCP GSC Setup

### Installation

`mcp-gsc` installed as a dev dependency in `clawsensus-board/`.

### Authentication

OAuth credentials via environment variables in `clawsensus-board/.env`:

```
GSC_CLIENT_ID=<your-client-id>
GSC_CLIENT_SECRET=<your-client-secret>
GSC_REFRESH_TOKEN=<your-refresh-token>
GSC_SITE_URL=<your-verified-site-url>
```

### Data Pulled

| Data | Use |
|---|---|
| Indexing coverage | Which URLs are indexed, not indexed, and why |
| Search performance | Queries, clicks, impressions, CTR, position for affected URLs |
| Sitemaps | Submission status, discovered vs indexed URL counts |

### Orchestrator Integration

The orchestrator calls MCP GSC programmatically:
- Groups indexing issues by type (discovered_not_indexed, crawled_not_indexed, redirect, soft_404)
- Cross-references with existing site files to determine applicable fixes
- Attaches GSC evidence to each proposal for the SEO guard to score

## Data Flow Diagram

```
┌─────────┐     ┌──────────────┐     ┌───────────────┐
│ MCP GSC │────▶│ Orchestrator │────▶│  Fix Proposal │
│ Server  │     │  (seo-loop)  │     │   Generator   │
└─────────┘     └──────────────┘     └───────┬───────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │   SEO Guard     │
                                    │  (Stage 1)      │
                                    │                 │
                                    │ Hard-block scan │
                                    │ Category check  │
                                    │ File path check │
                                    │ Evidence check  │
                                    │ Risk scoring    │
                                    └────────┬────────┘
                                             │
                              ┌──────────────┼──────────────┐
                              │              │              │
                           BLOCK          REWRITE        ALLOW
                           (skip)      (retry x3)          │
                                                           ▼
                                                  ┌────────────────┐
                                                  │  Apply Changes │
                                                  │  to Codebase   │
                                                  └────────┬───────┘
                                                           │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │   Diff Guard    │
                                                  │   (Stage 2)     │
                                                  │                 │
                                                  │ Scope match     │
                                                  │ Design safety   │
                                                  │ Route safety    │
                                                  │ Content safety  │
                                                  │ (+/- lines only)│
                                                  └────────┬────────┘
                                                           │
                                            ┌──────────────┼──────────┐
                                            │              │          │
                                         BLOCK          REWRITE    ALLOW
                                       (revert)       (retry x2)     │
                                                                     ▼
                                                          ┌────────────────┐
                                                          │ git commit     │
                                                          │ (per fix)      │
                                                          └────────────────┘
                                                                  │
                                                          after all fixes:
                                                                  ▼
                                                          ┌────────────────┐
                                                          │ push branch    │
                                                          │ open PR        │
                                                          └────────────────┘
```

## Dependencies

### Evaluator files (inside @consensus-tools/guards)

No new package dependencies. The evaluator files import from sibling modules within the existing `@consensus-tools/guards` package.

### Schema extension (inside @consensus-tools/schemas)

Add `"seo_fix"` and `"diff_check"` to the `guardTypeSchema` enum in `packages/schemas/src/guard.ts`.

### clawsensus-board/scripts/seo-loop.ts

```json
{
  "devDependencies": {
    "mcp-gsc": "latest",
    "@consensus-tools/guards": "workspace:*"
  }
}
```

## Testing Strategy

### Unit Tests (evaluators)

- **SEO evaluator:** Test each voting rule — allowed categories pass, disallowed categories block, missing evidence triggers rewrite, risk scores are correct
- **Diff evaluator:** Test scope matching, design mutation detection (only on +/- lines), route change detection, content rewrite detection, allowlist pass-through
- **Hard-block patterns:** Test each regex pattern triggers on the correct content
- **False positive tests:** Verify context lines in diffs don't trigger blocks; verify meta description text containing "className" doesn't trigger DESIGN_MUTATION

### Integration Tests (seo-loop.ts)

- **Dry-run mode:** Full pipeline with mock GSC data, verify proposals generated and guard decisions logged without code changes
- **Apply + revert:** Verify rollback works when diff guard blocks
- **Atomic commits:** Verify each fix produces exactly one commit with correct message format
- **REQUIRE_HUMAN:** Verify board artifact is written and loop exits cleanly for that fix

### Test Data

Mock GSC responses with realistic indexing issues for deterministic testing without live API calls.

## Success Criteria

1. Running `seo-loop.ts` pulls real GSC data and identifies indexing issues
2. Proposals are generated and pass through both guards
3. Only technical/invisible SEO changes are ever applied
4. Any design, route, or content change is hard-blocked
5. Each fix is an atomic, revertable commit
6. Full audit trail exists on the board
7. `--dry-run` mode works end-to-end without side effects
8. Changes are pushed to a feature branch with a PR, never directly to main
9. REQUIRE_HUMAN decisions produce a board artifact and exit cleanly
