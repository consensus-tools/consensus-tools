import { describe, it, expect } from "vitest";
import {
  jobPostInputSchema,
  claimInputSchema,
  submitInputSchema,
  voteInputSchema,
  resolveInputSchema,
  workflowCreateInputSchema,
  cronRegisterInputSchema,
  agentIdFieldSchema,
} from "../src/inputs.js";

describe("jobPostInputSchema", () => {
  it("should accept valid input", () => {
    const result = jobPostInputSchema.safeParse({
      title: "Summarize document",
      rewardAmount: 100,
      mode: "SUBMISSION",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing title", () => {
    const result = jobPostInputSchema.safeParse({ rewardAmount: 50 });
    expect(result.success).toBe(false);
  });

  it("should reject negative reward", () => {
    const result = jobPostInputSchema.safeParse({
      title: "Task",
      rewardAmount: -10,
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid mode", () => {
    const result = jobPostInputSchema.safeParse({
      title: "Task",
      mode: "invalid_mode",
    });
    expect(result.success).toBe(false);
  });
});

describe("claimInputSchema", () => {
  it("should accept valid input", () => {
    const result = claimInputSchema.safeParse({
      stakeAmount: 10,
      leaseSeconds: 60,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing stakeAmount", () => {
    const result = claimInputSchema.safeParse({ leaseSeconds: 60 });
    expect(result.success).toBe(false);
  });

  it("should reject leaseSeconds less than 1", () => {
    const result = claimInputSchema.safeParse({
      stakeAmount: 10,
      leaseSeconds: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("submitInputSchema", () => {
  it("should apply defaults for summary, confidence, and artifacts", () => {
    const result = submitInputSchema.parse({});
    expect(result.summary).toBe("");
    expect(result.confidence).toBe(0.5);
    expect(result.artifacts).toEqual({});
  });

  it("should reject confidence greater than 1", () => {
    const result = submitInputSchema.safeParse({ confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it("should reject confidence less than 0", () => {
    const result = submitInputSchema.safeParse({ confidence: -0.1 });
    expect(result.success).toBe(false);
  });
});

describe("voteInputSchema", () => {
  it("should accept an empty object (all fields optional)", () => {
    const result = voteInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should reject negative weight", () => {
    const result = voteInputSchema.safeParse({ weight: -1 });
    expect(result.success).toBe(false);
  });
});

describe("resolveInputSchema", () => {
  it("should accept an empty object", () => {
    const result = resolveInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept valid input with manualWinners", () => {
    const result = resolveInputSchema.safeParse({
      manualWinners: ["agent-1", "agent-2"],
    });
    expect(result.success).toBe(true);
  });
});

describe("workflowCreateInputSchema", () => {
  it("should accept valid input", () => {
    const result = workflowCreateInputSchema.safeParse({
      name: "my-workflow",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing name", () => {
    const result = workflowCreateInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should default definition to {}", () => {
    const result = workflowCreateInputSchema.parse({ name: "wf" });
    expect(result.definition).toEqual({});
  });
});

describe("cronRegisterInputSchema", () => {
  it("should accept valid input", () => {
    const result = cronRegisterInputSchema.safeParse({
      workflowId: "wf-1",
      cronExpression: "*/5 * * * *",
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing workflowId", () => {
    const result = cronRegisterInputSchema.safeParse({
      cronExpression: "*/5 * * * *",
    });
    expect(result.success).toBe(false);
  });

  it("should reject too-short cronExpression", () => {
    const result = cronRegisterInputSchema.safeParse({
      workflowId: "wf-1",
      cronExpression: "* *",
    });
    expect(result.success).toBe(false);
  });
});

describe("agentIdFieldSchema", () => {
  it("should accept valid agentId", () => {
    const result = agentIdFieldSchema.safeParse({ agentId: "agent-1" });
    expect(result.success).toBe(true);
  });

  it("should reject empty string agentId", () => {
    const result = agentIdFieldSchema.safeParse({ agentId: "" });
    expect(result.success).toBe(false);
  });

  it("should reject missing agentId", () => {
    const result = agentIdFieldSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
