import { describe, it, expect, beforeEach } from "vitest";
import { handle } from "../src/tools/agent-tools.js";
import { makeMockCtx, parseContent } from "./helpers.js";
import type { McpContext } from "../src/context.js";

let ctx: McpContext;

beforeEach(() => {
  ctx = makeMockCtx();
});

describe("agent tools", () => {
  it("agent.register calls createAgent with correct args", async () => {
    const result = await handle("agent.register", {
      id: "a1", name: "Agent One", kind: "internal", scopes: ["send_email"],
    }, ctx);
    expect(ctx.agentRegistry.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a1", name: "Agent One", kind: "internal", scopes: ["send_email"] }),
    );
    const data = parseContent(result);
    expect(data.id).toBe("agent-1");
  });

  it("agent.list returns agents", async () => {
    (ctx.agentRegistry.listAgents as any).mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    const result = await handle("agent.list", {}, ctx);
    const data = parseContent(result);
    expect(data.agents).toHaveLength(2);
  });

  it("agent.suspend returns agent on success", async () => {
    (ctx.agentRegistry.suspendAgent as any).mockResolvedValue({ id: "a1", status: "suspended" });
    const result = await handle("agent.suspend", { id: "a1" }, ctx);
    const data = parseContent(result);
    expect(data.status).toBe("suspended");
  });

  it("agent.suspend returns isError when agent not found", async () => {
    const result = await handle("agent.suspend", { id: "nonexistent" }, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("agent.activate returns agent on success", async () => {
    (ctx.agentRegistry.activateAgent as any).mockResolvedValue({ id: "a1", status: "active" });
    const result = await handle("agent.activate", { id: "a1" }, ctx);
    const data = parseContent(result);
    expect(data.status).toBe("active");
  });

  it("agent.activate returns isError when agent not found", async () => {
    const result = await handle("agent.activate", { id: "nonexistent" }, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("unknown tool returns isError", async () => {
    const result = await handle("agent.unknown", {}, ctx);
    expect((result as any).isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
  });

  it("propagates errors from registry", async () => {
    (ctx.agentRegistry.createAgent as any).mockRejectedValue(new Error("Duplicate ID"));
    const result = await handle("agent.register", {
      id: "a1", name: "Agent", kind: "internal", scopes: [],
    }, ctx);
    expect((result as any).isError).toBe(true);
    expect(result.content[0].text).toContain("Duplicate ID");
  });
});
