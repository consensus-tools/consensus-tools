import { describe, it, expect } from "vitest";
import {
  DEFAULTS,
  DEFAULT_GUARD,
  DEFAULT_POLICY,
  DEFAULT_PERSONA_COUNT,
  DEFAULT_PERSONA_TRIO,
  policyToStrategy,
} from "../defaults.js";
import { ConfigError } from "../errors.js";

describe("DEFAULTS", () => {
  it("provides full defaults matching expected values", () => {
    expect(DEFAULTS.policy).toBe("majority");
    expect(DEFAULTS.guards).toEqual(["agent_action"]);
    expect(DEFAULTS.failPolicy).toBe("closed");
    expect(DEFAULTS.storage).toBe("memory");
    expect(DEFAULTS.logger).toBe(true);
  });

  it("exports expected guard and policy constants", () => {
    expect(DEFAULT_GUARD).toBe("agent_action");
    expect(DEFAULT_POLICY).toBe("majority");
    expect(DEFAULT_PERSONA_COUNT).toBe(3);
    expect(DEFAULT_PERSONA_TRIO).toEqual(["security", "compliance", "user-impact"]);
  });

  it("merges partial config with defaults", () => {
    const partial = { policy: "unanimous", failPolicy: "open" as const };
    const merged = { ...DEFAULTS, ...partial };
    expect(merged.policy).toBe("unanimous");
    expect(merged.failPolicy).toBe("open");
    // Untouched defaults remain
    expect(merged.guards).toEqual(["agent_action"]);
    expect(merged.storage).toBe("memory");
    expect(merged.logger).toBe(true);
  });
});

describe("policyToStrategy", () => {
  it("maps 'majority' to { strategy: 'majority' }", () => {
    expect(policyToStrategy("majority")).toEqual({ strategy: "majority" });
  });

  it("maps 'supermajority' to { strategy: 'threshold', threshold: 0.67 }", () => {
    expect(policyToStrategy("supermajority")).toEqual({ strategy: "threshold", threshold: 0.67 });
  });

  it("maps 'unanimous' to { strategy: 'unanimous' }", () => {
    expect(policyToStrategy("unanimous")).toEqual({ strategy: "unanimous" });
  });

  it("maps 'threshold:0.8' to { strategy: 'threshold', threshold: 0.8 }", () => {
    expect(policyToStrategy("threshold:0.8")).toEqual({ strategy: "threshold", threshold: 0.8 });
  });

  it("throws ConfigError for unknown policy name", () => {
    expect(() => policyToStrategy("bogus")).toThrow(ConfigError);
    expect(() => policyToStrategy("bogus")).toThrow('Unknown policy "bogus"');
  });

  it("throws ConfigError for invalid threshold value", () => {
    expect(() => policyToStrategy("threshold:abc")).toThrow(ConfigError);
    expect(() => policyToStrategy("threshold:abc")).toThrow("Invalid threshold value");
  });

  it("throws ConfigError for threshold out of range", () => {
    expect(() => policyToStrategy("threshold:1.5")).toThrow(ConfigError);
    expect(() => policyToStrategy("threshold:-0.1")).toThrow(ConfigError);
  });
});
