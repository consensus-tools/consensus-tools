import { describe, it, expect, vi, afterEach } from "vitest";

// We import and re-export the helper so we can swap the DEV flag tested below.
// The actual DEV gating is tested via the exported isDev wrapper for unit tests.
import { safeParseJSON, _setDevForTesting } from "../safeJson";

afterEach(() => {
  vi.restoreAllMocks();
  // Restore DEV flag to the real env value after each test.
  _setDevForTesting(undefined);
});

describe("safeParseJSON", () => {
  it("returns the parsed value for valid JSON", () => {
    const result = safeParseJSON<{ x: number }>('{"x":42}', { x: 0 });
    expect(result).toEqual({ x: 42 });
  });

  it("returns an array parsed from valid JSON", () => {
    const result = safeParseJSON<number[]>("[1,2,3]", []);
    expect(result).toEqual([1, 2, 3]);
  });

  it("returns the fallback for malformed JSON", () => {
    _setDevForTesting(false);
    const result = safeParseJSON<string[]>("{bad json}", []);
    expect(result).toEqual([]);
  });

  it("returns the fallback for null input (no warn)", () => {
    _setDevForTesting(true);
    const warnSpy = vi.spyOn(console, "warn");
    const result = safeParseJSON<number>(null, 99);
    expect(result).toBe(99);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns the fallback for undefined input (no warn)", () => {
    _setDevForTesting(true);
    const warnSpy = vi.spyOn(console, "warn");
    const result = safeParseJSON<number>(undefined, 99);
    expect(result).toBe(99);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns the fallback for empty string input (no warn)", () => {
    _setDevForTesting(true);
    const warnSpy = vi.spyOn(console, "warn");
    const result = safeParseJSON<number>("", 99);
    expect(result).toBe(99);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns in DEV mode when JSON is malformed", () => {
    _setDevForTesting(true);
    const warnSpy = vi.spyOn(console, "warn");
    safeParseJSON<null>("{bad}", null, "myContext");
    expect(warnSpy).toHaveBeenCalledOnce();
    const [msg] = warnSpy.mock.calls[0];
    expect(msg).toContain("myContext");
  });

  it("does NOT warn in production mode when JSON is malformed", () => {
    _setDevForTesting(false);
    const warnSpy = vi.spyOn(console, "warn");
    safeParseJSON<null>("{bad}", null, "myContext");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("includes context label in warn message when provided", () => {
    _setDevForTesting(true);
    const warnSpy = vi.spyOn(console, "warn");
    safeParseJSON("{broken}", null, "MyLabel");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("[MyLabel]");
  });

  it("warning never includes raw input content (no token/PII leak)", () => {
    _setDevForTesting(true);
    const warnSpy = vi.spyOn(console, "warn");
    const sensitiveInput = '{"api_key":"sk-ant-api03-SECRET_TOKEN_XYZ"';
    safeParseJSON(sensitiveInput, null);
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg: string = warnSpy.mock.calls[0][0];
    expect(msg).not.toContain("api_key");
    expect(msg).not.toContain("sk-ant");
    expect(msg).not.toContain("SECRET");
  });

  it("warning reports input length only", () => {
    _setDevForTesting(true);
    const warnSpy = vi.spyOn(console, "warn");
    const longInput = "{" + "a".repeat(200);
    safeParseJSON(longInput, null);
    expect(warnSpy).toHaveBeenCalledOnce();
    const msg: string = warnSpy.mock.calls[0][0];
    expect(msg).toContain(`length=${longInput.length}`);
  });

  // Valid-but-falsy JSON values must round-trip, NOT be replaced with the fallback.
  // A future refactor that uses `if (!result) return fallback` would silently break
  // these — pin the contract.
  it("returns the parsed value 'false' (not the fallback)", () => {
    expect(safeParseJSON<boolean | string>("false", "FALLBACK")).toBe(false);
  });

  it("returns the parsed value '0' (not the fallback)", () => {
    expect(safeParseJSON<number>("0", 99)).toBe(0);
  });

  it("returns the parsed value 'null' (not the fallback)", () => {
    expect(safeParseJSON<unknown>("null", "FALLBACK")).toBeNull();
  });

  it("returns the parsed value '\"\"' (the empty string, not the fallback)", () => {
    expect(safeParseJSON<string>('""', "FALLBACK")).toBe("");
  });
});
