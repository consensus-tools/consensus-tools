import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { createTempStorage } from "./helpers.js";
import { defaultState } from "../src/interface.js";

describe("JsonStorage", () => {
  it("init creates file with default state", async () => {
    const { filePath } = await createTempStorage();
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.jobs).toEqual([]);
    expect(parsed.ledger).toEqual([]);
  });

  it("getState returns default empty state", async () => {
    const { storage } = await createTempStorage();
    const state = await storage.getState();
    expect(state.jobs).toEqual([]);
    expect(state.ledger).toEqual([]);
    expect(state.agents).toEqual([]);
  });

  it("saveState persists and getState reads back", async () => {
    const { storage } = await createTempStorage();
    const state = defaultState();
    state.jobs.push({
      id: "job-1",
      title: "Test",
      description: "desc",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      createdByAgentId: "agent",
      tags: [],
      priority: 0,
      requiredCapabilities: [],
      inputs: {},
      constraints: {},
      reward: 1,
      stakeRequired: 0,
      maxParticipants: 1,
      minParticipants: 1,
      consensusPolicy: { type: "FIRST_SUBMISSION_WINS" },
      slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 },
      escrowPolicy: { type: "mint" },
      status: "OPEN",
    } as any);
    await storage.saveState(state);

    const loaded = await storage.getState();
    expect(loaded.jobs).toHaveLength(1);
    expect(loaded.jobs[0].id).toBe("job-1");
  });

  it("update mutates state atomically", async () => {
    const { storage } = await createTempStorage();
    await storage.update((state) => {
      state.errors.push({ id: "e1", at: "", message: "test" } as any);
    });
    const state = await storage.getState();
    expect(state.errors).toHaveLength(1);
  });

  it("concurrent updates are serialized by Mutex", async () => {
    const { storage } = await createTempStorage();
    await Promise.all([
      storage.update((state) => { state.errors.push({ id: "e1", at: "", message: "a" } as any); }),
      storage.update((state) => { state.errors.push({ id: "e2", at: "", message: "b" } as any); }),
    ]);
    const state = await storage.getState();
    expect(state.errors).toHaveLength(2);
  });

  it("corrupt file throws descriptive error", async () => {
    const { storage, filePath } = await createTempStorage();
    await fs.writeFile(filePath, "not-json{{{", "utf8");
    await expect(storage.getState()).rejects.toThrow("corrupt");
  });
});
