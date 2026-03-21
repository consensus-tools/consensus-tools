import { describe, it, expect } from "vitest";
import { createGuardTemplate } from "../src/templates.js";
import { GuardEvaluatorRegistry } from "../src/registry.js";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";

function makeInput(type: string, payload: Record<string, unknown> = {}): GuardEvaluateInput {
  return { boardId: "test", action: { type, payload } };
}

describe("createGuardTemplate", () => {
  it("creates a template with a custom evaluator", () => {
    const template = createGuardTemplate("loan_approval", {
      rules: (payload) => {
        if ((payload["amount"] as number) > 100_000) {
          return [{ evaluator: "loan-risk", vote: "REWRITE", reason: "High-value loan", risk: 0.85 }];
        }
        return [{ evaluator: "loan-risk", vote: "YES", reason: "Standard loan", risk: 0.2 }];
      },
    });

    expect(template.name).toBe("loan_approval");
    expect(template.evaluate).toBeTypeOf("function");
  });

  it("evaluate() calls rules with the payload", () => {
    const template = createGuardTemplate("loan_approval", {
      rules: (payload) => {
        if ((payload["amount"] as number) > 100_000) {
          return [{ evaluator: "loan-risk", vote: "NO", reason: "Too high", risk: 0.9 }];
        }
        return [{ evaluator: "loan-risk", vote: "YES", reason: "OK", risk: 0.1 }];
      },
    });

    const highVotes = template.evaluate(makeInput("loan_approval", { amount: 200_000 }));
    expect(highVotes[0]!.vote).toBe("NO");

    const lowVotes = template.evaluate(makeInput("loan_approval", { amount: 5_000 }));
    expect(lowVotes[0]!.vote).toBe("YES");
  });

  it("applies hard-block patterns before rules", () => {
    const template = createGuardTemplate("content_review", {
      rules: () => [{ evaluator: "content", vote: "YES", reason: "Clean", risk: 0.1 }],
      hardBlockPatterns: [/fraud/i, /sanctions/i],
    });

    const blocked = template.evaluate(makeInput("content_review", { text: "This involves fraud" }));
    expect(blocked[0]!.vote).toBe("NO");
    expect(blocked[0]!.reason).toContain("Hard-block pattern");
  });

  it("hard-block patterns scan all string values in payload", () => {
    const template = createGuardTemplate("test", {
      rules: () => [{ evaluator: "test", vote: "YES", reason: "OK", risk: 0.1 }],
      hardBlockPatterns: [/secret/i],
    });

    const blocked = template.evaluate(makeInput("test", { title: "OK", body: "contains secret info" }));
    expect(blocked[0]!.vote).toBe("NO");
  });

  it("asReviewer() returns a wrapper-compatible ReviewerFn", () => {
    const template = createGuardTemplate("loan_approval", {
      rules: (payload) => [{ evaluator: "loan", vote: "YES", reason: "OK", risk: 0.2 }],
    });

    const reviewer = template.asReviewer();
    expect(reviewer).toBeTypeOf("function");
  });

  it("asReviewer() converts guard votes to review scores", async () => {
    const template = createGuardTemplate("test", {
      rules: () => [{ evaluator: "test", vote: "YES", reason: "Good", risk: 0.2 }],
    });

    const reviewer = template.asReviewer();
    const result = await reviewer({ text: "hello" }, { name: "test", args: [], attempt: 1 });
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.rationale).toBe("Good");
    expect(result.block).toBe(false);
  });

  it("asReviewer() blocks on NO votes", async () => {
    const template = createGuardTemplate("test", {
      rules: () => [{ evaluator: "test", vote: "NO", reason: "Bad", risk: 0.9 }],
    });

    const reviewer = template.asReviewer();
    const result = await reviewer({ text: "bad" }, { name: "test", args: [], attempt: 1 });
    expect(result.score).toBeLessThan(0.5);
    expect(result.block).toBe(true);
  });

  it("registers into a GuardEvaluatorRegistry", () => {
    const registry = new GuardEvaluatorRegistry();
    const template = createGuardTemplate("custom_domain", {
      rules: () => [{ evaluator: "custom", vote: "YES", reason: "OK", risk: 0.1 }],
    });

    template.register(registry);

    expect(registry.listTypes()).toContain("custom_domain");
  });

  it("evaluate with empty/undefined payload doesn't crash", () => {
    const template = createGuardTemplate("empty_payload_guard", {
      rules: () => [{ evaluator: "test", vote: "YES", reason: "OK", risk: 0.1 }],
    });

    const input: GuardEvaluateInput = { boardId: "test", action: { type: "empty_payload_guard", payload: {} } };
    expect(() => template.evaluate(input)).not.toThrow();
    const votes = template.evaluate(input);
    expect(votes.length).toBeGreaterThan(0);
  });

  it("hard-block patterns ignore non-string values in payload", () => {
    const template = createGuardTemplate("amount_guard", {
      rules: () => [{ evaluator: "amount", vote: "YES", reason: "OK", risk: 0.1 }],
      hardBlockPatterns: [/100000/],
    });

    // amount is a number, not a string — should NOT be scanned by hard-block
    const votes = template.evaluate(makeInput("amount_guard", { amount: 100000 }));
    expect(votes[0]!.vote).toBe("YES");
  });

  it("asReviewer() with REWRITE vote returns mid-range score (~0.2-0.5)", async () => {
    const template = createGuardTemplate("rewrite_guard", {
      rules: () => [{ evaluator: "test", vote: "REWRITE", reason: "Needs changes", risk: 0.5 }],
    });

    const reviewer = template.asReviewer();
    const result = await reviewer({ text: "draft" }, { name: "rewrite_guard", args: [], attempt: 1 });
    // REWRITE score formula: 0.5 - (risk ?? 0.5) * 0.3 = 0.5 - 0.15 = 0.35
    expect(result.score).toBeGreaterThanOrEqual(0.2);
    expect(result.score).toBeLessThanOrEqual(0.5);
    expect(result.block).toBe(false);
  });

  it("asReviewer() with empty votes returns score 1.0", async () => {
    const template = createGuardTemplate("empty_rules_guard", {
      rules: () => [],
    });

    const reviewer = template.asReviewer();
    const result = await reviewer({ text: "hello" }, { name: "empty_rules_guard", args: [], attempt: 1 });
    expect(result.score).toBe(1.0);
    expect(result.block).toBe(false);
  });
});
