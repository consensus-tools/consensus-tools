import { describe, it, expect } from "vitest";
import { consensusCliConfigSchema, defaultConsensusCliConfig } from "../src/config.js";

describe("config validation", () => {
  it("valid config (defaultConsensusCliConfig) passes validation", () => {
    const result = consensusCliConfigSchema.safeParse(defaultConsensusCliConfig);
    expect(result.success).toBe(true);
  });

  it("config with wrong activeBoard value fails", () => {
    const invalid = { ...defaultConsensusCliConfig, activeBoard: "invalid-board" };
    const result = consensusCliConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("config missing required fields fails", () => {
    const result = consensusCliConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("schema matches the ConsensusCliConfig interface shape", () => {
    const result = consensusCliConfigSchema.safeParse(defaultConsensusCliConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const data = result.data;
    expect(data).toHaveProperty("activeBoard");
    expect(data).toHaveProperty("boards.local.type", "local");
    expect(data).toHaveProperty("boards.local.root");
    expect(data).toHaveProperty("boards.local.jobsPath");
    expect(data).toHaveProperty("boards.local.ledgerPath");
    expect(data).toHaveProperty("boards.remote.type", "remote");
    expect(data).toHaveProperty("boards.remote.url");
    expect(data).toHaveProperty("boards.remote.boardId");
    expect(data).toHaveProperty("boards.remote.auth.type", "apiKey");
    expect(data).toHaveProperty("boards.remote.auth.apiKeyEnv");
    expect(data).toHaveProperty("defaults.policy");
    expect(data).toHaveProperty("defaults.reward");
    expect(data).toHaveProperty("defaults.stake");
    expect(data).toHaveProperty("defaults.leaseSeconds");
  });
});
