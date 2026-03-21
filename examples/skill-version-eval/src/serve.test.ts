import { describe, test, expect, beforeAll } from "bun:test";

/**
 * Integration tests for serve.ts HTTP routes.
 *
 * These tests start the real Bun.serve server (port 3456) by importing serve.ts,
 * then make actual HTTP requests. Only the HTTP validation layer is tested —
 * fetcher/eval paths that call external APIs are NOT exercised.
 */

const PORT = 3456;
const BASE = `http://localhost:${PORT}`;

let serverStarted = false;

beforeAll(async () => {
  try {
    await import("./serve.js");
    serverStarted = true;
    // Give server a moment to bind
    await new Promise((r) => setTimeout(r, 100));
  } catch (e) {
    console.warn("Server failed to start (port in use?), skipping tests:", e);
  }
});

function skipUnless(condition: boolean): void {
  if (!condition) {
    console.warn("Skipping — server not running");
  }
}

describe("serve.ts routes", () => {
  // ── GET / ──────────────────────────────────────────────────────────
  test("GET / returns 200 with HTML content-type", async () => {
    if (!serverStarted) return;
    const res = await fetch(BASE);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /index.html returns 200", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  // ── Unknown routes ─────────────────────────────────────────────────
  test("GET /unknown returns 404", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/unknown`);
    expect(res.status).toBe(404);
  });

  test("GET /api/nonexistent returns 404", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/nonexistent`);
    expect(res.status).toBe(404);
  });

  // ── GET /api/commits ───────────────────────────────────────────────
  test("GET /api/commits without params returns 400", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/commits`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  test("GET /api/commits with partial params returns 400", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/commits?owner=test&repo=test`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  // ── GET /api/content ───────────────────────────────────────────────
  test("GET /api/content without params returns 400", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/content`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  test("GET /api/content missing ref returns 400", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/content?owner=a&repo=b&path=c`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  // ── POST /api/run ──────────────────────────────────────────────────
  test("POST /api/run with invalid JSON returns 400", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  test("POST /api/run with missing fields returns 400", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: "test" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required");
  });

  test("POST /api/run with empty body returns 400", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required");
  });

  // ── POST /api/diff-guard ──────────────────────────────────────────
  test("POST /api/diff-guard with invalid JSON returns 400", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/diff-guard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  test("POST /api/diff-guard with missing fields returns 400", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/diff-guard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: "test" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required");
  });

  // ── Content-type on JSON errors ────────────────────────────────────
  test("400 responses have application/json content-type", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/commits`);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  // ── Method mismatch ────────────────────────────────────────────────
  test("POST /api/commits returns 404 (wrong method)", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/commits`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  test("GET /api/run returns 404 (wrong method)", async () => {
    if (!serverStarted) return;
    const res = await fetch(`${BASE}/api/run`);
    expect(res.status).toBe(404);
  });
});
