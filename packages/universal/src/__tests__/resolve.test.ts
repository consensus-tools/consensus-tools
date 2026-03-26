import { describe, it, expect } from "vitest";
import { resolveWrappable } from "../resolve.js";

describe("resolveWrappable", () => {
  it("returns the function directly when input is a function", () => {
    const fn = async (name: string, args: Record<string, unknown>) => ({ name, args });
    const result = resolveWrappable(fn);
    expect(result).toBe(fn);
  });

  it("returns .execute when input has .execute", async () => {
    const obj = {
      state: "bound",
      execute: async function (name: string, args: Record<string, unknown>) {
        return { name, args, state: this.state };
      },
    };
    const resolved = resolveWrappable(obj as any);
    const output = await resolved("test", { a: 1 });
    expect(output).toEqual({ name: "test", args: { a: 1 }, state: "bound" });
  });

  it("returns .invoke when input has .invoke", async () => {
    const obj = {
      state: "invoked",
      invoke: async function (name: string, args: Record<string, unknown>) {
        return { name, args, state: this.state };
      },
    };
    const resolved = resolveWrappable(obj as any);
    const output = await resolved("test", { b: 2 });
    expect(output).toEqual({ name: "test", args: { b: 2 }, state: "invoked" });
  });

  it("returns .call when input has .call", async () => {
    const obj = {
      state: "called",
      call: async function (name: string, args: Record<string, unknown>) {
        return { name, args, state: this.state };
      },
    };
    const resolved = resolveWrappable(obj as any);
    const output = await resolved("test", { c: 3 });
    expect(output).toEqual({ name: "test", args: { c: 3 }, state: "called" });
  });

  it("prefers .execute over .invoke when both exist (resolution order)", async () => {
    const obj = {
      execute: async (_name: string, _args: Record<string, unknown>) => "execute-wins",
      invoke: async (_name: string, _args: Record<string, unknown>) => "invoke-loses",
    };
    const resolved = resolveWrappable(obj as any);
    const output = await resolved("test", {});
    expect(output).toBe("execute-wins");
  });

  it("throws TypeError for null", () => {
    expect(() => resolveWrappable(null as any)).toThrow(TypeError);
    expect(() => resolveWrappable(null as any)).toThrow("Expected a Wrappable");
  });

  it("throws TypeError for undefined", () => {
    expect(() => resolveWrappable(undefined as any)).toThrow(TypeError);
    expect(() => resolveWrappable(undefined as any)).toThrow("Expected a Wrappable");
  });

  it("throws TypeError for object with no matching methods", () => {
    const obj = { foo: () => "bar" };
    expect(() => resolveWrappable(obj as any)).toThrow(TypeError);
    expect(() => resolveWrappable(obj as any)).toThrow("Expected a Wrappable");
  });

  it("throws TypeError for string primitive", () => {
    expect(() => resolveWrappable("hello" as any)).toThrow(TypeError);
  });

  it("throws TypeError for number primitive", () => {
    expect(() => resolveWrappable(42 as any)).toThrow(TypeError);
  });
});
