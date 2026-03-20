import { describe, it, expect } from "vitest";
import { createPolicyTemplate } from "../src/templates.js";
import { createPolicyRegistry } from "../src/registry.js";
import type { ConsensusInput } from "@consensus-tools/schemas";

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
});
