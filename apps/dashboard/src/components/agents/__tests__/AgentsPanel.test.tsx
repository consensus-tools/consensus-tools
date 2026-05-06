/**
 * Regression tests for parseAgentMetadata (AgentsPanel finding E + finding C).
 *
 * Finding E: mutations in startEdit/saveEdit must NOT mutate the source
 *   participants array. parseAgentMetadata must return a fresh object.
 * Finding C: Date, Map, Set, and class instances must be rejected → {}.
 */
import { describe, it, expect } from "vitest";
import { parseAgentMetadata } from "../parseAgentMetadata";

// ── Finding E: mutation safety ──────────────────────────────────────────────

describe("parseAgentMetadata — mutation safety (finding E)", () => {
  it("Test 1: returned object is fresh — mutating it does NOT mutate p.metadata", () => {
    const original = { agentType: "internal", url: "x" };
    const participant = { metadata: original };

    const result = parseAgentMetadata(participant);

    // Sanity: the result has the right values
    expect(result.agentType).toBe("internal");
    expect(result.url).toBe("x");

    // Mutate the result (simulating what startEdit/saveEdit do)
    (result as Record<string, unknown>).agentType = "mutated";
    (result as Record<string, unknown>).newField = "injected";

    // The source object must be unaffected
    expect(original.agentType).toBe("internal");
    expect((original as Record<string, unknown>).newField).toBeUndefined();
  });
});

// ── Finding C: reject non-plain-object instances ────────────────────────────

describe("parseAgentMetadata — non-plain-object rejection (finding C)", () => {
  it("Test 2: Date instance → {}", () => {
    const result = parseAgentMetadata({ metadata: new Date() });
    expect(result).toEqual({});
  });

  it("Test 3: Map instance → {}", () => {
    const result = parseAgentMetadata({ metadata: new Map([["a", 1]]) });
    expect(result).toEqual({});
  });

  it("Test 4: Set instance → {}", () => {
    const result = parseAgentMetadata({ metadata: new Set([1, 2]) });
    expect(result).toEqual({});
  });
});

// ── metadata_json string path ───────────────────────────────────────────────

describe("parseAgentMetadata — metadata_json string path", () => {
  it("Test 5: valid metadata_json with agentType='internal' → {agentType: 'internal'}", () => {
    const result = parseAgentMetadata({
      metadata_json: '{"agentType":"internal"}',
    });
    expect(result).toMatchObject({ agentType: "internal" });
  });

  it("Test 6: invalid JSON in metadata_json → {}", () => {
    const result = parseAgentMetadata({ metadata_json: "{bad json" });
    expect(result).toEqual({});
  });
});

// ── missing metadata ────────────────────────────────────────────────────────

describe("parseAgentMetadata — missing metadata", () => {
  it("Test 7: no metadata and no metadata_json → {}", () => {
    const result = parseAgentMetadata({});
    expect(result).toEqual({});
  });
});
