import { describe, it, expect } from "vitest";
import { createPolicyTemplate } from "../src/templates.js";
import { createPolicyRegistry } from "../src/registry.js";
import type { ConsensusInput, ConsensusPolicyType } from "@consensus-tools/schemas";
import { makeJob, makeInput, makeSubmission, makeVote } from "./helpers.js";

describe("createPolicyTemplate", () => {
  it("creates a template extending a base policy", () => {
    const template = createPolicyTemplate("strict_approval", {
      base: "APPROVAL_VOTE",
      overrides: { quorum: 0.9, riskThreshold: 0.3 },
    });
    expect(template.name).toBe("strict_approval");
    expect(template.base).toBe("APPROVAL_VOTE");
  });

  it("registers into a PolicyRegistry", () => {
    const template = createPolicyTemplate("strict_approval", {
      base: "APPROVAL_VOTE",
      overrides: { quorum: 0.9 },
    });

    const registry = createPolicyRegistry();
    template.register(registry);

    expect(registry.has("strict_approval" as any)).toBe(true);
  });

  it("resolver delegates to the base policy with merged config", () => {
    const template = createPolicyTemplate("strict_majority", {
      base: "MAJORITY_VOTE",
      overrides: {},
    });

    expect(template.resolve).toBeTypeOf("function");
  });

  it("creates a template with custom pre-check", () => {
    const template = createPolicyTemplate("gated_approval", {
      base: "APPROVAL_VOTE",
      overrides: { quorum: 0.8 },
      preCheck: (input) => {
        const hasMinSubmissions = (input.submissions?.length ?? 0) >= 2;
        if (!hasMinSubmissions) {
          return { winner: null, reason: "Need at least 2 submissions", settled: false };
        }
        return null; // proceed to base policy
      },
    });

    expect(template.name).toBe("gated_approval");
  });

  it("throws on unknown base policy", () => {
    expect(() => createPolicyTemplate("bad", {
      base: "NONEXISTENT" as any,
      overrides: {},
    })).toThrow("Unknown base policy");
  });

  it("overrides merge into the policy config correctly", () => {
    const template = createPolicyTemplate("high_quorum_approval", {
      base: "APPROVAL_VOTE",
      overrides: { quorum: 5 },
    });

    // Run resolve with a job that has a low quorum — the override should enforce quorum: 5
    const job = makeJob({
      consensusPolicy: {
        type: "APPROVAL_VOTE",
        quorum: 1,
        minScore: 1,
        minMargin: 0,
        tieBreak: "earliest",
        approvalVote: { weightMode: "equal", settlement: "immediate" },
      },
    });

    // Provide 1 submission with 1 vote — would pass quorum:1 but not quorum:5
    const s1 = makeSubmission({ agentId: "a1" });
    const v1 = makeVote({ submissionId: s1.id, score: 1 });
    const result = template.resolve(makeInput({ job, submissions: [s1], votes: [v1] }));
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.reason).toBe("quorum_not_met");
  });

  it("preCheck returning null proceeds to base resolver", () => {
    const template = createPolicyTemplate("passthrough_check", {
      base: "FIRST_SUBMISSION_WINS",
      overrides: {},
      preCheck: (_input) => null, // always returns null → proceed to base
    });

    const result = template.resolve(makeInput({ submissions: [], votes: [] }));
    // FIRST_SUBMISSION_WINS with no submissions returns no winners
    expect(result.winners).toEqual([]);
  });

  it("all 9 base policy names are accepted", () => {
    const bases: ConsensusPolicyType[] = [
      "FIRST_SUBMISSION_WINS",
      "HIGHEST_CONFIDENCE_SINGLE",
      "APPROVAL_VOTE",
      "OWNER_PICK",
      "TRUSTED_ARBITER",
      "TOP_K_SPLIT",
      "MAJORITY_VOTE",
      "WEIGHTED_VOTE_SIMPLE",
      "WEIGHTED_REPUTATION",
    ];

    for (const base of bases) {
      expect(() => createPolicyTemplate(`template_${base}`, {
        base,
        overrides: {},
      })).not.toThrow();
    }
  });
});
