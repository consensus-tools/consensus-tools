import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";

import { consensus } from "../src/consensus.js";
import type { ReviewerFn, ReviewResult } from "../src/types.js";
import { GuardEngine } from "@consensus-tools/core";
import { JsonStorage } from "@consensus-tools/core";
import { createGuardEvaluatorRegistry } from "@consensus-tools/guards";
import type { GuardEvaluateInput, GuardResult } from "@consensus-tools/schemas";

describe("consensus + GuardEngine integration", () => {
  const tmpDir = path.join(os.tmpdir(), `consensus-integration-${randomUUID()}`);
  const storagePath = path.join(tmpDir, "state.json");

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("allows a safe action through the full pipeline", async () => {
    // 1. Real storage + evaluator registry + guard engine
    const storage = new JsonStorage(storagePath);
    await storage.init();

    const evaluatorRegistry = createGuardEvaluatorRegistry();
    const guardEngine = new GuardEngine({ storage, evaluatorRegistry });

    // 2. Reviewer that delegates to the real GuardEngine
    const guardReviewer: ReviewerFn<string> = async (output, _ctx) => {
      const input: GuardEvaluateInput = {
        boardId: "test-board",
        action: {
          type: "agent_action",
          payload: { description: output, risk: "low" },
        },
      };

      const result: GuardResult = await guardEngine.evaluate(input);

      return {
        score: 1 - result.risk_score,
        rationale: result.reason,
        block: result.decision === "BLOCK",
      };
    };

    // 3. Wrap a simple function with the guard reviewer
    const wrapped = consensus<string>({
      name: "safe-action",
      fn: async () => "read dashboard metrics",
      reviewers: [guardReviewer],
      strategy: { strategy: "threshold", threshold: 0.3 },
    });

    // 4. Invoke and verify the decision result structure
    const decision = await wrapped();

    assert.ok(
      ["allow", "block", "retry", "escalate"].includes(decision.action),
      `action should be a valid decision, got: ${decision.action}`,
    );
    assert.ok(Array.isArray(decision.scores), "scores should be an array");
    assert.equal(decision.scores.length, 1, "should have exactly one reviewer score");
    assert.equal(typeof decision.aggregateScore, "number", "aggregateScore should be a number");
    assert.equal(typeof decision.attempt, "number", "attempt should be a number");

    // The score should reflect the guard engine's risk assessment
    const reviewScore = decision.scores[0]!;
    assert.equal(typeof reviewScore.score, "number", "review score should be a number");
    assert.ok(reviewScore.score >= 0 && reviewScore.score <= 1, "score should be between 0 and 1");
    assert.equal(typeof reviewScore.rationale, "string", "rationale should be a string");

    // output should be present (either allowed or blocked, but output is set)
    assert.ok(decision.output !== undefined, "output should be defined");
  });

  it("allows a safe action and returns the wrapped function output", async () => {
    const storage = new JsonStorage(path.join(tmpDir, "state-allow.json"));
    await storage.init();

    const evaluatorRegistry = createGuardEvaluatorRegistry();
    const guardEngine = new GuardEngine({ storage, evaluatorRegistry });

    const guardReviewer: ReviewerFn<string> = async (output) => {
      const result = await guardEngine.evaluate({
        boardId: "test-board",
        action: {
          type: "agent_action",
          payload: { description: output },
        },
      });
      return {
        score: 1 - result.risk_score,
        rationale: result.reason,
        block: result.decision === "BLOCK",
      };
    };

    const wrapped = consensus<string>({
      name: "safe-read",
      fn: async () => "fetch user profile",
      reviewers: [guardReviewer],
      strategy: { strategy: "threshold", threshold: 0.3 },
    });

    const decision = await wrapped();

    // Verify the ALLOW path result shape
    assert.equal(decision.action, "allow", "safe action should be allowed");
    assert.equal(decision.output, "fetch user profile", "output should be the wrapped fn return value");
    assert.equal(decision.scores.length, 1);
    assert.ok(decision.aggregateScore > 0, "aggregate score should be positive");
    assert.equal(decision.attempt, 1, "should resolve on first attempt");
  });

  it("persists audit events in storage after evaluation", async () => {
    const auditStoragePath = path.join(tmpDir, "state-audit.json");
    const storage = new JsonStorage(auditStoragePath);
    await storage.init();

    const evaluatorRegistry = createGuardEvaluatorRegistry();
    const guardEngine = new GuardEngine({ storage, evaluatorRegistry });

    const guardReviewer: ReviewerFn<string> = async (output) => {
      const result = await guardEngine.evaluate({
        boardId: "audit-board",
        action: {
          type: "send_email",
          payload: { to: "user@example.com", body: output },
        },
      });
      return {
        score: 1 - result.risk_score,
        rationale: result.reason,
        block: result.decision === "BLOCK",
      };
    };

    const wrapped = consensus<string>({
      name: "email-action",
      fn: async () => "Hello, this is a test email.",
      reviewers: [guardReviewer],
      strategy: { strategy: "threshold", threshold: 0.3 },
    });

    await wrapped();

    // Verify that the guard engine persisted audit events
    const state = await storage.getState();
    assert.ok(state.audit.length > 0, "audit events should be persisted");
    assert.ok(state.guardResults.length > 0, "guard results should be persisted");

    // Check audit event types
    const auditTypes = state.audit.map((e) => e.type);
    assert.ok(auditTypes.includes("PROPOSED_ACTION"), "should have PROPOSED_ACTION audit event");
    assert.ok(auditTypes.includes("FINAL_DECISION"), "should have FINAL_DECISION audit event");
  });

  it("works with multiple reviewers including a guard reviewer", async () => {
    const storage = new JsonStorage(path.join(tmpDir, "state-multi.json"));
    await storage.init();

    const evaluatorRegistry = createGuardEvaluatorRegistry();
    const guardEngine = new GuardEngine({ storage, evaluatorRegistry });

    const guardReviewer: ReviewerFn<string> = async (output) => {
      const result = await guardEngine.evaluate({
        boardId: "multi-board",
        action: {
          type: "agent_action",
          payload: { description: output },
        },
      });
      return {
        score: 1 - result.risk_score,
        rationale: result.reason,
        block: result.decision === "BLOCK",
      };
    };

    // A simple static reviewer alongside the guard engine reviewer
    const staticReviewer: ReviewerFn<string> = () => ({
      score: 0.85,
      rationale: "static pass",
    });

    const wrapped = consensus<string>({
      name: "multi-reviewer",
      fn: async () => "safe operation",
      reviewers: [guardReviewer, staticReviewer],
      strategy: { strategy: "threshold", threshold: 0.3 },
    });

    const decision = await wrapped();

    assert.equal(decision.action, "allow");
    assert.equal(decision.scores.length, 2, "should have scores from both reviewers");
    assert.equal(decision.output, "safe operation");
  });
});
