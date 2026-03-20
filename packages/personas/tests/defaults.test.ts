import { describe, it, expect } from "vitest";
import { getPersonasByPack, PERSONA_PACKS } from "../src/defaults.js";

describe("getPersonasByPack", () => {
  it("returns 3 default eval personas", () => {
    const personas = getPersonasByPack("default");
    expect(personas).toHaveLength(3);
    expect(personas[0]!.id).toBe("security-analyst");
    expect(personas[0]!.systemPrompt).toBeTruthy();
    expect(personas[0]!.evaluationFocus).toBeTruthy();
  });

  it("returns 5 skill-review personas", () => {
    const personas = getPersonasByPack("skill-review");
    expect(personas).toHaveLength(5);
    expect(personas[0]!.id).toBe("doc-architect");
  });

  it("returns 5 governance personas", () => {
    const personas = getPersonasByPack("governance");
    expect(personas).toHaveLength(5);
    expect(personas[0]!.role).toBe("reliability");
    expect(personas[0]!.reputation).toBe(0.55);
    expect(personas[0]!.non_negotiables).toBeTruthy();
  });

  it("respects count parameter", () => {
    const personas = getPersonasByPack("default", 2);
    expect(personas).toHaveLength(2);
  });

  it("returns all if count exceeds available", () => {
    const personas = getPersonasByPack("default", 100);
    expect(personas).toHaveLength(3);
  });

  it("throws on unknown pack name", () => {
    expect(() => getPersonasByPack("nonexistent")).toThrow("Unknown persona pack");
  });

  it("returns copies, not references", () => {
    const a = getPersonasByPack("default");
    const b = getPersonasByPack("default");
    expect(a[0]).not.toBe(b[0]);
    expect(a[0]).toEqual(b[0]);
  });

  it("all personas have unique ids within a pack", () => {
    for (const pack of PERSONA_PACKS) {
      const personas = getPersonasByPack(pack);
      const ids = personas.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
