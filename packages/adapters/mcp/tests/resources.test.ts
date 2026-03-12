import { describe, it, expect } from "vitest";
import { resourceTemplates, listResources, readResource } from "../src/resources.js";
import { makeMockCtx } from "./helpers.js";

describe("resources", () => {
  describe("resourceTemplates", () => {
    it("has 3 templates", () => {
      expect(resourceTemplates).toHaveLength(3);
    });
  });

  describe("listResources", () => {
    it("returns resources for boards that have jobs", async () => {
      const ctx = makeMockCtx({
        storage: {
          getState: async () => ({
            jobs: [
              { boardId: "board-1", id: "j1", title: "Job 1" },
              { boardId: "board-2", id: "j2", title: "Job 2" },
              { boardId: "board-1", id: "j3", title: "Job 3" },
            ],
            bids: [],
            claims: [],
            submissions: [],
            votes: [],
            resolutions: [],
            ledger: [],
            audit: [],
            errors: [],
            agents: [],
            participants: [],
            workflows: [],
            workflowRuns: [],
            cronSchedules: [],
            hitlApprovals: [],
            guardResults: [],
          }),
          update: async () => {},
          init: async () => {},
        } as any,
      });

      const resources = await listResources(ctx);

      // 2 unique boards * 3 resource types = 6
      expect(resources).toHaveLength(6);
      expect(resources.some((r) => r.uri === "consensus://boards/board-1/jobs")).toBe(true);
      expect(resources.some((r) => r.uri === "consensus://boards/board-2/ledger")).toBe(true);
      expect(resources.some((r) => r.uri === "consensus://boards/board-1/agents")).toBe(true);
    });
  });

  describe("readResource", () => {
    it("returns filtered jobs for a valid jobs URI", async () => {
      const ctx = makeMockCtx({
        storage: {
          getState: async () => ({
            jobs: [
              { boardId: "board-1", id: "j1", title: "Job 1" },
              { boardId: "board-2", id: "j2", title: "Job 2" },
            ],
            bids: [],
            claims: [],
            submissions: [],
            votes: [],
            resolutions: [],
            ledger: [],
            audit: [],
            errors: [],
            agents: [],
            participants: [],
            workflows: [],
            workflowRuns: [],
            cronSchedules: [],
            hitlApprovals: [],
            guardResults: [],
          }),
          update: async () => {},
          init: async () => {},
        } as any,
      });

      const result = await readResource("consensus://boards/board-1/jobs", ctx);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe("application/json");

      const jobs = JSON.parse(result.contents[0].text);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe("j1");
    });

    it("throws for unknown collection", async () => {
      const ctx = makeMockCtx();
      await expect(readResource("consensus://boards/board-1/unknown", ctx)).rejects.toThrow(
        "Unknown resource collection: unknown",
      );
    });

    it("throws for invalid URI", async () => {
      const ctx = makeMockCtx();
      await expect(readResource("not-a-valid-uri", ctx)).rejects.toThrow("Invalid resource URI");
    });
  });
});
