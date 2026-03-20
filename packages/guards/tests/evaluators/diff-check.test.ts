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
