import { describe, it, expect } from "vitest";
import { createTempStorage } from "./helpers.js";
import { AgentRegistry } from "../src/engine/agent-registry.js";

async function makeRegistry() {
  const { storage } = await createTempStorage();
  return new AgentRegistry(storage);
}

describe("AgentRegistry", () => {
  it("createAgent stores and returns agent", async () => {
    const reg = await makeRegistry();
    const agent = await reg.createAgent({
      id: "a1", name: "Agent 1", kind: "internal", scopes: ["send_email"],
    } as any);
    expect(agent.id).toBe("a1");
    expect(agent.status).toBe("active");
  });

  it("createAgent requires apiKeyHash for external", async () => {
    const reg = await makeRegistry();
    await expect(
      reg.createAgent({ id: "a1", name: "Ext", kind: "external", scopes: [] } as any),
    ).rejects.toThrow("apiKeyHash");
  });

  it("createAgent rejects duplicate ID", async () => {
    const reg = await makeRegistry();
    await reg.createAgent({ id: "a1", name: "A1", kind: "internal", scopes: [] } as any);
    await expect(
      reg.createAgent({ id: "a1", name: "A1 dup", kind: "internal", scopes: [] } as any),
    ).rejects.toThrow("already exists");
  });

  it("listAgents returns all agents", async () => {
    const reg = await makeRegistry();
    await reg.createAgent({ id: "a1", name: "A1", kind: "internal", scopes: [] } as any);
    await reg.createAgent({ id: "a2", name: "A2", kind: "internal", scopes: [] } as any);
    const agents = await reg.listAgents();
    expect(agents).toHaveLength(2);
  });

  it("suspendAgent sets status to suspended", async () => {
    const reg = await makeRegistry();
    await reg.createAgent({ id: "a1", name: "A1", kind: "internal", scopes: [] } as any);
    const agent = await reg.suspendAgent("a1");
    expect(agent?.status).toBe("suspended");
  });

  it("activateAgent reactivates suspended agent", async () => {
    const reg = await makeRegistry();
    await reg.createAgent({ id: "a1", name: "A1", kind: "internal", scopes: [] } as any);
    await reg.suspendAgent("a1");
    const agent = await reg.activateAgent("a1");
    expect(agent?.status).toBe("active");
  });

  it("removeAgent removes and returns true", async () => {
    const reg = await makeRegistry();
    await reg.createAgent({ id: "a1", name: "A1", kind: "internal", scopes: [] } as any);
    expect(await reg.removeAgent("a1")).toBe(true);
    expect(await reg.getAgent("a1")).toBeUndefined();
  });

  it("validateAgentScope checks scopes correctly", async () => {
    const reg = await makeRegistry();
    await reg.createAgent({ id: "a1", name: "A1", kind: "internal", scopes: ["send_email"] } as any);

    const allowed = await reg.validateAgentScope("a1", "send_email");
    expect(allowed.allowed).toBe(true);

    const denied = await reg.validateAgentScope("a1", "deploy");
    expect(denied.allowed).toBe(false);

    // Not found
    const notFound = await reg.validateAgentScope("nonexistent", "send_email");
    expect(notFound.allowed).toBe(false);

    // Suspended
    await reg.suspendAgent("a1");
    const suspended = await reg.validateAgentScope("a1", "send_email");
    expect(suspended.allowed).toBe(false);
  });
});
