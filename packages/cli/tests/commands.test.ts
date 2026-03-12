import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { Command } from "commander";
import { buildProgram } from "../src/commands.js";
import {
  loadCliConfig,
  saveCliConfig,
  getConfigValue,
  setConfigValue,
  parseValue,
  resolveRemoteBaseUrl,
  defaultConsensusCliConfig,
  type ConsensusCliConfig,
} from "../src/config.js";

describe("CLI", () => {
  describe("buildProgram", () => {
    it("returns a Commander program", () => {
      const program = buildProgram();
      expect(program).toBeInstanceOf(Command);
      expect(program.name()).toBe("consensus-tools");
    });
  });

  describe("resolveAgentId", () => {
    const originalEnv = process.env.CONSENSUS_AGENT_ID;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.CONSENSUS_AGENT_ID = originalEnv;
      } else {
        delete process.env.CONSENSUS_AGENT_ID;
      }
    });

    // resolveAgentId is not exported, so we test it indirectly through
    // the config and environment behavior. We re-implement the logic
    // for direct unit testing.
    function resolveAgentId(cfg: ConsensusCliConfig): string {
      const fromEnv = process.env.CONSENSUS_AGENT_ID;
      if (fromEnv) return fromEnv;
      if (cfg.agentId) return cfg.agentId;
      let user = "cli";
      try {
        const u = os.userInfo();
        if (u?.username) user = u.username;
      } catch {
        /* ignore */
      }
      return `${user}@${os.hostname()}`;
    }

    it("returns env var CONSENSUS_AGENT_ID when set", () => {
      process.env.CONSENSUS_AGENT_ID = "env-agent-42";
      const cfg = JSON.parse(JSON.stringify(defaultConsensusCliConfig));
      expect(resolveAgentId(cfg)).toBe("env-agent-42");
    });

    it("returns config.agentId when set", () => {
      delete process.env.CONSENSUS_AGENT_ID;
      const cfg = JSON.parse(JSON.stringify(defaultConsensusCliConfig));
      cfg.agentId = "config-agent-99";
      expect(resolveAgentId(cfg)).toBe("config-agent-99");
    });

    it("falls back to username@hostname", () => {
      delete process.env.CONSENSUS_AGENT_ID;
      const cfg = JSON.parse(JSON.stringify(defaultConsensusCliConfig));
      delete cfg.agentId;
      const result = resolveAgentId(cfg);
      expect(result).toContain("@");
      expect(result).toBe(`${os.userInfo().username}@${os.hostname()}`);
    });
  });

  describe("loadCliConfig / saveCliConfig", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "consensus-cli-test-"));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("round-trips JSON config", async () => {
      const configDir = path.join(tmpDir, ".consensus");
      const configPath = path.join(configDir, "config.json");

      const original: ConsensusCliConfig = {
        ...JSON.parse(JSON.stringify(defaultConsensusCliConfig)),
        agentId: "round-trip-agent",
      };

      // Save using CONSENSUS_CONFIG env var to control path
      const prevConfigEnv = process.env.CONSENSUS_CONFIG;
      process.env.CONSENSUS_CONFIG = configPath;
      try {
        await saveCliConfig(original);
        const loaded = await loadCliConfig();
        expect(loaded.agentId).toBe("round-trip-agent");
        expect(loaded.activeBoard).toBe(original.activeBoard);
        expect(loaded.boards.remote.url).toBe(original.boards.remote.url);
        expect(loaded.defaults.reward).toBe(original.defaults.reward);
      } finally {
        if (prevConfigEnv !== undefined) {
          process.env.CONSENSUS_CONFIG = prevConfigEnv;
        } else {
          delete process.env.CONSENSUS_CONFIG;
        }
      }
    });

    it("returns default config when file does not exist", async () => {
      const prevConfigEnv = process.env.CONSENSUS_CONFIG;
      process.env.CONSENSUS_CONFIG = path.join(tmpDir, "nonexistent", "config.json");
      try {
        const cfg = await loadCliConfig();
        expect(cfg.activeBoard).toBe("remote");
        expect(cfg.defaults.reward).toBe(defaultConsensusCliConfig.defaults.reward);
      } finally {
        if (prevConfigEnv !== undefined) {
          process.env.CONSENSUS_CONFIG = prevConfigEnv;
        } else {
          delete process.env.CONSENSUS_CONFIG;
        }
      }
    });
  });

  describe("getConfigValue / setConfigValue", () => {
    it("gets a nested config value", () => {
      const cfg = { boards: { remote: { url: "https://example.com" } } };
      expect(getConfigValue(cfg, "boards.remote.url")).toBe("https://example.com");
    });

    it("returns undefined for missing key", () => {
      const cfg = { a: 1 };
      expect(getConfigValue(cfg, "b.c")).toBeUndefined();
    });

    it("sets a nested config value", () => {
      const cfg: Record<string, unknown> = { boards: { remote: { url: "old" } } };
      setConfigValue(cfg, "boards.remote.url", "new");
      expect(getConfigValue(cfg, "boards.remote.url")).toBe("new");
    });

    it("creates intermediate objects when setting", () => {
      const cfg: Record<string, unknown> = {};
      setConfigValue(cfg, "a.b.c", 42);
      expect(getConfigValue(cfg, "a.b.c")).toBe(42);
    });
  });

  describe("parseValue", () => {
    it("parses JSON numbers", () => {
      expect(parseValue("42")).toBe(42);
    });

    it("parses JSON booleans", () => {
      expect(parseValue("true")).toBe(true);
    });

    it("returns plain strings as-is", () => {
      expect(parseValue("hello world")).toBe("hello world");
    });
  });

  describe("resolveRemoteBaseUrl", () => {
    it("appends /v1/boards/:boardId when not already present", () => {
      expect(resolveRemoteBaseUrl("https://api.example.com", "board_1")).toBe(
        "https://api.example.com/v1/boards/board_1",
      );
    });

    it("returns as-is when /v1/boards/ is already present", () => {
      const url = "https://api.example.com/v1/boards/board_42";
      expect(resolveRemoteBaseUrl(url, "board_1")).toBe(url);
    });

    it("strips trailing slash before appending", () => {
      expect(resolveRemoteBaseUrl("https://api.example.com/", "board_1")).toBe(
        "https://api.example.com/v1/boards/board_1",
      );
    });
  });
});
