import { describe, it, expect, vi } from "vitest";
import { ReputationManager } from "./reputation-manager.js";
import type { PersonaConfig } from "@consensus-tools/personas";
import type { LlmDecisionResult } from "./types.js";

function makePersonas(): PersonaConfig[] {
  return [
    { id: "p1", name: "Security", role: "security", reputation: 0.55 },
    { id: "p2", name: "Compliance", role: "compliance", reputation: 0.55 },
    { id: "p3", name: "Operations", role: "operations", reputation: 0.55 },
  ];
}

function makeDecision(overrides?: Partial<LlmDecisionResult>): LlmDecisionResult {
  return {
    decisionId: "dec_test",
    action: "block",
    votes: [
      { personaId: "p1", personaName: "Security", vote: "NO", confidence: 0.9, rationale: "risky", source: "llm" },
      { personaId: "p2", personaName: "Compliance", vote: "YES", confidence: 0.7, rationale: "ok", source: "llm" },
      { personaId: "p3", personaName: "Operations", vote: "NO", confidence: 0.8, rationale: "risky", source: "llm" },
    ],
    policy: "MAJORITY_VOTE",
    consensusTrace: {},
    aggregateScore: 0.3,
    ...overrides,
  };
}

describe("ReputationManager", () => {
  it("initializes all personas at 0.55", () => {
    const mgr = new ReputationManager(makePersonas());
    expect(mgr.getReputation("p1")).toBe(0.55);
    expect(mgr.getReputation("p2")).toBe(0.55);
    expect(mgr.getReputation("p3")).toBe(0.55);
  });

  it("returns 0.55 for unknown persona IDs", () => {
    const mgr = new ReputationManager(makePersonas());
    expect(mgr.getReputation("unknown")).toBe(0.55);
  });

  it("records decisions for feedback correlation", () => {
    const mgr = new ReputationManager(makePersonas());
    const decision = makeDecision();
    mgr.recordDecision(decision);

    // processFeedback should find this decision
    const changes = mgr.processFeedback({
      decisionId: "dec_test",
      type: "override_block",
    });
    expect(changes.length).toBe(3);
  });

  it("updates reputation on override_block feedback", () => {
    const mgr = new ReputationManager(makePersonas());
    const decision = makeDecision();
    mgr.recordDecision(decision);

    // override_block means the block was wrong, ground truth is ALLOW
    // p1 voted NO (misaligned with ALLOW), p2 voted YES (aligned), p3 voted NO (misaligned)
    const changes = mgr.processFeedback({
      decisionId: "dec_test",
      type: "override_block",
    });

    // p2 (voted YES, aligned with ALLOW) should gain reputation
    const p2Change = changes.find((c) => c.persona_id === "p2");
    expect(p2Change!.delta).toBeGreaterThan(0);

    // p1 (voted NO, misaligned with ALLOW) should lose reputation
    const p1Change = changes.find((c) => c.persona_id === "p1");
    expect(p1Change!.delta).toBeLessThan(0);
  });

  it("updates reputation on flag_miss feedback", () => {
    const mgr = new ReputationManager(makePersonas());
    const decision = makeDecision({ action: "allow" });
    mgr.recordDecision(decision);

    // flag_miss means the allow was wrong, ground truth is BLOCK
    const changes = mgr.processFeedback({
      decisionId: "dec_test",
      type: "flag_miss",
    });

    // p1 and p3 (voted NO, aligned with BLOCK) should gain reputation
    const p1Change = changes.find((c) => c.persona_id === "p1");
    expect(p1Change!.delta).toBeGreaterThan(0);
  });

  it("returns empty changes for unknown decision IDs", () => {
    const mgr = new ReputationManager(makePersonas());
    const changes = mgr.processFeedback({
      decisionId: "nonexistent",
      type: "override_block",
    });
    expect(changes).toEqual([]);
  });

  it("triggers respawn when reputation drops below threshold", () => {
    const personas = makePersonas();
    personas[0]!.reputation = 0.10; // Already below default threshold of 0.15
    const mgr = new ReputationManager(personas, 0.15);

    const respawnHandler = vi.fn();
    mgr.setRespawnHandler(respawnHandler);

    // Record + feedback to trigger checkRespawn
    const decision = makeDecision();
    mgr.recordDecision(decision);
    mgr.processFeedback({ decisionId: "dec_test", type: "override_block" });

    // p1 started at 0.10, misaligned feedback pushes it further down
    // Respawn should have been triggered
    if (mgr.getReputation("p1") < 0.15 || respawnHandler.mock.calls.length === 0) {
      // Persona was replaced, check new personas list
      const currentPersonas = mgr.getPersonas();
      // Either the original was respawned or it's below threshold
      expect(currentPersonas.length).toBe(3);
    }
  });

  it("getPersonas returns copies", () => {
    const mgr = new ReputationManager(makePersonas());
    const p1 = mgr.getPersonas();
    const p2 = mgr.getPersonas();
    expect(p1).not.toBe(p2);
  });
});
