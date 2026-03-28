import { describe, it, expect, vi } from "vitest";
import { consensus } from "./index.js";
import { MemoryStorage } from "@consensus-tools/storage";
import type { ModelAdapter, ModelMessage } from "./types.js";

function createAllowModel(): ModelAdapter {
  return async (_messages: ModelMessage[]) =>
    "VOTE: YES\nCONFIDENCE: 0.9\nRATIONALE: Looks safe.";
}

function createBlockModel(): ModelAdapter {
  return async (_messages: ModelMessage[]) =>
    "VOTE: NO\nCONFIDENCE: 0.9\nRATIONALE: Dangerous.";
}

function createMockExecutor() {
  return vi.fn(async (toolName: string, args: Record<string, unknown>) => {
    return { tool: toolName, result: "executed", args };
  });
}

describe("LLM mode audit storage", () => {
  it("writes audit entry to storage after allow decision", async () => {
    const store = new MemoryStorage();
    await store.init();
    const executor = createMockExecutor();

    const safe = consensus.wrap(executor, {
      model: createAllowModel(),
      storage: store,
      logger: false,
    });

    await safe("send_email", { to: "test@test.com" });

    const state = await store.getState();
    const audits = (state as any).audit;
    expect(audits).toBeDefined();
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe("allow");
    expect(audits[0].decisionId).toBeDefined();
    expect(audits[0].policy).toBeDefined();
    expect(audits[0].personaCount).toBe(3);
  });

  it("writes audit entry to storage after block decision", async () => {
    const store = new MemoryStorage();
    await store.init();
    const executor = createMockExecutor();

    const safe = consensus.wrap(executor, {
      model: createBlockModel(),
      storage: store,
      failPolicy: "open",
      logger: false,
    });

    await safe("send_email", { to: "test@test.com" });

    const state = await store.getState();
    const audits = (state as any).audit;
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe("block");
  });

  it("writes audit entry in shadow mode", async () => {
    const store = new MemoryStorage();
    await store.init();
    const executor = createMockExecutor();

    const safe = consensus.wrap(executor, {
      model: createBlockModel(),
      mode: "shadow",
      storage: store,
      logger: false,
    });

    await safe("send_email", { to: "test@test.com" });

    const state = await store.getState();
    const audits = (state as any).audit;
    expect(audits.length).toBe(1);
    expect(audits[0].mode).toBe("shadow");
  });

  it("uses memory storage by default (no crash)", async () => {
    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model: createAllowModel(),
      logger: false,
    });

    // Should not throw — default memory storage
    await safe("send_email", { to: "test@test.com" });
  });
});
