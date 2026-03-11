import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestServer, makeConfig } from "./helpers.js";
import type { ConsensusToolsServer } from "../src/server.js";

describe("Auth token validation", () => {
  let server: ConsensusToolsServer;
  let baseUrl: string;

  beforeAll(async () => {
    const config = makeConfig({ server: { authToken: "secret-token" } });
    const ctx = await createTestServer({ config });
    server = ctx.server;
    baseUrl = ctx.baseUrl;
  });

  afterAll(async () => {
    await server?.stop();
  });

  it("rejects request without token when authToken configured", async () => {
    const res = await fetch(`${baseUrl}/jobs`);
    expect(res.status).toBe(401);
  });

  it("rejects request with wrong token", async () => {
    const res = await fetch(`${baseUrl}/jobs`, {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts request with correct token", async () => {
    const res = await fetch(`${baseUrl}/jobs`, {
      headers: { authorization: "Bearer secret-token" },
    });
    expect(res.status).toBe(200);
  });
});

describe("No auth token configured", () => {
  let server: ConsensusToolsServer;
  let baseUrl: string;

  beforeAll(async () => {
    const ctx = await createTestServer();
    server = ctx.server;
    baseUrl = ctx.baseUrl;
  });

  afterAll(async () => {
    await server?.stop();
  });

  it("allows request when no authToken configured", async () => {
    const res = await fetch(`${baseUrl}/jobs`);
    expect(res.status).toBe(200);
  });
});
