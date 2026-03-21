import { describe, it, expect } from "vitest";
import { ConsensusCallbackHandler } from "../src/callback.js";

describe("ConsensusCallbackHandler", () => {
  it("creates a callback handler", () => {
    const handler = new ConsensusCallbackHandler();
    expect(handler).toBeTruthy();
    expect(handler.name).toBe("consensus-tools");
  });

  it("records tool calls", async () => {
    const handler = new ConsensusCallbackHandler();
    await handler.handleToolStart({ id: ["langchain_community", "tools", "consensus_guard_publish"], name: "consensus_guard_publish", type: "not_implemented" }, '{"payload":{}}', "run-1");
    expect(handler.getDecisionLog()).toHaveLength(1);
    expect(handler.getDecisionLog()[0]!.tool).toBe("consensus_guard_publish");
  });

  it("records tool results", async () => {
    const handler = new ConsensusCallbackHandler();
    await handler.handleToolStart({ id: ["langchain_community", "tools", "consensus_guard_publish"], name: "consensus_guard_publish", type: "not_implemented" }, '{"payload":{}}', "run-1");
    await handler.handleToolEnd('{"decision":"ALLOW","risk":0.2}', "run-1");
    const log = handler.getDecisionLog();
    expect(log[0]!.result).toBeTruthy();
    expect(JSON.parse(log[0]!.result!).decision).toBe("ALLOW");
  });

  it("exports decision log as JSON string", () => {
    const handler = new ConsensusCallbackHandler();
    const json = handler.toJSONString();
    expect(json).toBe("[]");
  });

  it("ignores non-consensus_guard tool calls", async () => {
    const handler = new ConsensusCallbackHandler();
    await handler.handleToolStart({ id: ["langchain_community", "tools", "other_tool"], name: "other_tool", type: "not_implemented" }, '{"payload":{}}', "run-2");
    expect(handler.getDecisionLog()).toHaveLength(0);
  });

  it("clear() empties the decision log", async () => {
    const handler = new ConsensusCallbackHandler();
    await handler.handleToolStart({ id: ["langchain_community", "tools", "consensus_guard_publish"], name: "consensus_guard_publish", type: "not_implemented" }, '{"payload":{}}', "run-3");
    expect(handler.getDecisionLog()).toHaveLength(1);
    handler.clear();
    expect(handler.getDecisionLog()).toHaveLength(0);
  });
});
