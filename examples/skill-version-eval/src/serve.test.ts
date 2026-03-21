import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as http from "http";
import { createApp } from "./serve.js";

/**
 * Integration tests for serve.ts HTTP routes.
 *
 * Uses createApp() to start a server on a random port,
 * then makes actual HTTP requests. Only the HTTP validation layer is tested —
 * fetcher/eval paths that call external APIs are NOT exercised.
 */

let server: http.Server;
let BASE: string;

beforeAll(async () => {
  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      BASE = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("serve.ts routes", () => {
  // ── GET / ──────────────────────────────────────────────────────────
  it("GET / returns 200 with HTML content-type", async () => {
    const res = await fetch(BASE);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("GET /index.html returns 200", async () => {
    const res = await fetch(`${BASE}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  // ── Unknown routes ─────────────────────────────────────────────────
  it("GET /unknown returns 404", async () => {
    const res = await fetch(`${BASE}/unknown`);
    expect(res.status).toBe(404);
  });

  it("GET /api/nonexistent returns 404", async () => {
    const res = await fetch(`${BASE}/api/nonexistent`);
    expect(res.status).toBe(404);
  });

  // ── GET /api/commits ───────────────────────────────────────────────
  it("GET /api/commits without params returns 400", async () => {
    const res = await fetch(`${BASE}/api/commits`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("GET /api/commits with partial params returns 400", async () => {
    const res = await fetch(`${BASE}/api/commits?owner=test&repo=test`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  // ── GET /api/content ───────────────────────────────────────────────
  it("GET /api/content without params returns 400", async () => {
    const res = await fetch(`${BASE}/api/content`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("GET /api/content missing ref returns 400", async () => {
    const res = await fetch(`${BASE}/api/content?owner=a&repo=b&path=c`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  // ── POST /api/run ──────────────────────────────────────────────────
  it("POST /api/run with invalid JSON returns 400", async () => {
    const res = await fetch(`${BASE}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("POST /api/run with missing fields returns 400", async () => {
    const res = await fetch(`${BASE}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: "test" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required");
  });

  it("POST /api/run with empty body returns 400", async () => {
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
  it("POST /api/diff-guard with invalid JSON returns 400", async () => {
    const res = await fetch(`${BASE}/api/diff-guard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid JSON");
  });

  it("POST /api/diff-guard with missing fields returns 400", async () => {
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
  it("400 responses have application/json content-type", async () => {
    const res = await fetch(`${BASE}/api/commits`);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  // ── Method mismatch ────────────────────────────────────────────────
  it("POST /api/commits returns 404 (wrong method)", async () => {
    const res = await fetch(`${BASE}/api/commits`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("GET /api/run returns 404 (wrong method)", async () => {
    const res = await fetch(`${BASE}/api/run`);
    expect(res.status).toBe(404);
  });
});
