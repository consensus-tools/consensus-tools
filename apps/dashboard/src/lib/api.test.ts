import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getBoards, getBoard, getRun, createBoard,
  getEvents, getRunIds, clearEvents,
  evalAction,
  getWorkflows, createWorkflow, updateWorkflow, runWorkflow, deleteWorkflow,
  connectAgent, listAgents,
  getTemplates, getCredentialsList, getAdapters,
  approveWorkflowRun,
} from "./api";

const originalFetch = globalThis.fetch;

function mockFetch(data: any, ok = true, status = 200) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(data),
  }) as any;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("API client", () => {
  describe("Boards & Runs", () => {
    it("getBoards fetches /api/mcp/boards", async () => {
      mockFetch([{ id: "b1" }]);
      const result = await getBoards();
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/mcp/boards");
      expect(result).toEqual([{ id: "b1" }]);
    });

    it("getBoard fetches /api/mcp/boards/:id", async () => {
      mockFetch({ id: "b1", runs: [] });
      await getBoard("b1");
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/mcp/boards/b1");
    });

    it("getRun fetches /api/mcp/runs/:id", async () => {
      mockFetch({ id: "r1" });
      await getRun("r1");
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/mcp/runs/r1");
    });

    it("createBoard throws on error", async () => {
      mockFetch(null, false, 404);
      await expect(createBoard("test-board")).rejects.toThrow("404");
    });
  });

  describe("Events", () => {
    it("getEvents constructs query params correctly", async () => {
      mockFetch([]);
      await getEvents({ boardId: "b1", limit: 50 });
      const url = (globalThis.fetch as any).mock.calls[0][0] as string;
      expect(url).toContain("boardId=b1");
      expect(url).toContain("limit=50");
    });

    it("getEvents omits undefined params", async () => {
      mockFetch([]);
      await getEvents({ boardId: "b1", runId: undefined });
      const url = (globalThis.fetch as any).mock.calls[0][0] as string;
      expect(url).not.toContain("runId");
    });

    it("getRunIds extracts unique runIds from events", async () => {
      mockFetch([
        { details: { runId: "r1" } },
        { details: { runId: "r2" } },
        { details: { runId: "r1" } },
        { details: {} },
      ]);
      const result = await getRunIds();
      expect(result.runIds).toHaveLength(2);
      expect(result.runIds).toContain("r1");
      expect(result.runIds).toContain("r2");
    });

    it("clearEvents DELETEs /api/mcp/events", async () => {
      mockFetch({ ok: true, deleted: 5 });
      const result = await clearEvents({ runId: "r1" });
      const url = (globalThis.fetch as any).mock.calls[0][0] as string;
      expect(url).toContain("/api/mcp/events");
      expect(url).toContain("runId=r1");
      expect(result).toEqual({ ok: true, deleted: 5 });
    });
  });

  describe("Guard Evaluation", () => {
    it("evalAction POSTs to /api/guard.evaluate", async () => {
      mockFetch({ decision: "ALLOW" });
      const result = await evalAction({ boardId: "b1", action: { type: "test", payload: {} } });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/guard.evaluate",
        expect.objectContaining({ method: "POST" }),
      );
      expect(result.decision).toBe("ALLOW");
    });

    it("throws on non-ok response", async () => {
      mockFetch(null, false, 500);
      await expect(evalAction({})).rejects.toThrow("500");
    });
  });

  describe("Workflows", () => {
    it("getWorkflows fetches /api/workflows", async () => {
      mockFetch([]);
      await getWorkflows();
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/workflows");
    });

    it("createWorkflow POSTs name and definition", async () => {
      mockFetch({ id: "wf-1" });
      await createWorkflow("My WF", { steps: [] });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workflows",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "My WF", definition: { steps: [] } }),
        }),
      );
    });

    it("updateWorkflow PUTs to /api/workflows/:id", async () => {
      mockFetch({ id: "wf-1" });
      await updateWorkflow("wf-1", { name: "Updated" });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workflows/wf-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });

    it("runWorkflow POSTs to /api/workflows/:id/run", async () => {
      mockFetch({ id: "run-1" });
      await runWorkflow("wf-1");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workflows/wf-1/run",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("deleteWorkflow DELETEs /api/workflows/:id", async () => {
      mockFetch({ ok: true });
      await deleteWorkflow("wf-1");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workflows/wf-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("approveWorkflowRun POSTs to /api/workflow-runs/:runId/approve", async () => {
      mockFetch({ ok: true });
      await approveWorkflowRun("r1", "YES");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/workflow-runs/r1/approve",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ decision: "YES", approver: "human" }),
        }),
      );
    });
  });

  describe("Agents", () => {
    it("connectAgent POSTs to /api/agents with correct shape", async () => {
      mockFetch({ id: "agent-1" });
      await connectAgent({ name: "MyAgent", scopes: ["send_email"] });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/agents",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ id: "MyAgent", name: "MyAgent", kind: "external", scopes: ["send_email"], boards: [], workflows: [] }),
        }),
      );
    });

    it("listAgents fetches /api/agents", async () => {
      mockFetch([]);
      await listAgents();
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/agents");
    });
  });

  describe("Templates", () => {
    it("getTemplates fetches /api/templates", async () => {
      mockFetch({ templates: [{ id: "t1" }] });
      const result = await getTemplates();
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/templates");
      expect(result).toEqual({ templates: [{ id: "t1" }] });
    });
  });

  describe("Credentials", () => {
    it("getCredentialsList fetches /api/settings/credentials", async () => {
      mockFetch({ credentials: [] });
      const result = await getCredentialsList();
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/settings/credentials");
      expect(result).toEqual({ credentials: [] });
    });
  });

  describe("Adapters", () => {
    it("getAdapters fetches /api/settings/adapters", async () => {
      mockFetch({ adapters: { slack: true } });
      const result = await getAdapters();
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/settings/adapters");
      expect(result).toEqual({ adapters: { slack: true } });
    });
  });
});
