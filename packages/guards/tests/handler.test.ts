import { describe, it, expect, beforeEach } from "vitest";
import type {
  GuardEvaluateInput,
  GuardResult,
  StorageState,
} from "@consensus-tools/schemas";
import type { IStorage } from "@consensus-tools/storage";
import { defaultState } from "@consensus-tools/storage";
import { GuardHandler } from "../src/handler.js";

/** Minimal in-memory IStorage for testing. */
class MemoryStorage implements IStorage {
  private state: StorageState = defaultState();

  async init(): Promise<void> {}

  async getState(): Promise<StorageState> {
    return this.state;
  }

  async saveState(state: StorageState): Promise<void> {
    this.state = state;
  }

  async update<T>(fn: (state: StorageState) => T | Promise<T>): Promise<{ state: StorageState; result: T }> {
    const result = await fn(this.state);
    return { state: this.state, result };
  }
}

function makeInput(overrides: Partial<GuardEvaluateInput> & { action: GuardEvaluateInput["action"] }): GuardEvaluateInput {
  return {
    boardId: "test-board",
    ...overrides,
  };
}

describe("GuardHandler", () => {
  let storage: MemoryStorage;
  let handler: GuardHandler;

  beforeEach(() => {
    storage = new MemoryStorage();
    handler = new GuardHandler({
      storage,
      enableLogging: false,
    });
  });

  it("clean agent action → ALLOW", async () => {
    const input = makeInput({
      action: {
        type: "agent_action",
        payload: { irreversible: false, risk_level: "low" },
      },
    });
    const result = await handler.evaluate(input);
    expect(result.decision).toBe("ALLOW");
    expect(result.guard_type).toBe("agent_action");
  });

  it("irreversible agent action → BLOCK", async () => {
    const input = makeInput({
      action: {
        type: "agent_action",
        payload: { irreversible: true },
      },
    });
    const result = await handler.evaluate(input);
    expect(result.decision).toBe("BLOCK");
    expect(result.risk_score).toBeGreaterThan(0.7);
  });

  it("production deployment → decision based on risk threshold", async () => {
    const input = makeInput({
      action: {
        type: "deployment",
        payload: { env: "prod", ci_passed: true },
      },
    });
    const result = await handler.evaluate(input);
    // Production deployment gets risk 0.8, which exceeds default 0.7 threshold.
    // With a REWRITE vote and rewriteRatio > 0.5 → REWRITE
    expect(["REWRITE", "BLOCK"]).toContain(result.decision);
    expect(result.risk_score).toBeGreaterThan(0.7);
  });

  it("hard-block flags in text → BLOCK", async () => {
    const input = makeInput({
      action: {
        type: "support_reply",
        payload: { message: "Here is your SSN: 123-45-6789" },
      },
    });
    const result = await handler.evaluate(input);
    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("Hard-block flags detected");
    expect(result.risk_score).toBe(1.0);
  });

  it("idempotency: same input returns same result", async () => {
    const input = makeInput({
      action: {
        type: "agent_action",
        payload: { irreversible: false },
      },
    });
    const result1 = await handler.evaluate(input);
    const result2 = await handler.evaluate(input);
    expect(result1.audit_id).toBe(result2.audit_id);
    expect(result1.decision).toBe(result2.decision);
    // Should be the exact same object from cache
    expect(result1).toBe(result2);
  });

  it("stores guard result in storage", async () => {
    const input = makeInput({
      action: {
        type: "send_email",
        payload: { to: "user@example.com", body: "Hello there" },
      },
    });
    await handler.evaluate(input);
    const state = await storage.getState();
    expect(state.guardResults).toHaveLength(1);
    expect(state.guardResults[0]!.guard_type).toBe("send_email");
  });

  it("unknown domain type → graceful handling", async () => {
    const input = makeInput({
      action: {
        type: "unknown_type",
        payload: {},
      },
    });
    const result = await handler.evaluate(input);
    // Unknown types fall back to generic evaluator, normalizeGuardType → "agent_action"
    expect(result.guard_type).toBe("agent_action");
    expect(result.decision).toBeDefined();
  });

  it("custom evaluator via registry", async () => {
    handler.registry.register("custom_guard", (_input) => [
      { evaluator: "custom", vote: "NO", reason: "Custom block", risk: 0.99 },
    ]);

    const input = makeInput({
      action: {
        type: "custom_guard",
        payload: {},
      },
    });
    const result = await handler.evaluate(input);
    expect(result.decision).toBe("BLOCK");
    expect(result.votes).toBeDefined();
    expect(result.votes![0]!.evaluator).toBe("custom");
  });

  it("idempotency via storage: new handler sees prior result", async () => {
    const input = makeInput({
      action: {
        type: "agent_action",
        payload: { irreversible: false },
      },
    });
    const result1 = await handler.evaluate(input);

    // Create a new handler with the same storage
    const handler2 = new GuardHandler({ storage, enableLogging: false });
    const result2 = await handler2.evaluate(input);
    expect(result2.audit_id).toBe(result1.audit_id);
    expect(result2.decision).toBe(result1.decision);
  });
});
