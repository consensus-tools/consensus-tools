import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * End-to-end test that drives the SHIPPED MCP binary over real stdio JSON-RPC.
 *
 * Unlike the other suites (which call tool handlers in-process with a mocked
 * context), this spawns `dist/entry.js` exactly as `bin/cli.js` does and speaks
 * the wire protocol. It is the only coverage for entry.ts, the StdioServer
 * transport framing, and the real storage round-trip. Requires a prior build
 * (`pnpm build`); turbo's `test` task depends on `build`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(here, "..", "dist", "entry.js");

/** Minimal newline-delimited JSON-RPC client over a child process' stdio. */
class StdioClient {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<number, (msg: any) => void>();
  private buf = "";
  private nextId = 1;
  stderr = "";

  constructor(entry: string, storagePath: string) {
    this.child = spawn(process.execPath, [entry], {
      env: { ...process.env, CONSENSUS_STORAGE_PATH: storagePath, CONSENSUS_AGENT_ID: "e2e-agent" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.on("data", (d) => (this.stderr += d.toString()));
    this.child.stdout.on("data", (chunk) => {
      this.buf += chunk.toString();
      let nl: number;
      while ((nl = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line) continue;
        let msg: any;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          this.pending.get(msg.id)!(msg);
          this.pending.delete(msg.id);
        }
      }
    });
  }

  request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for ${method} (id=${id})`)),
        8000,
      );
      this.pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  notify(method: string, params?: unknown): void {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  /** Parse the JSON text payload of a tools/call result's first content block. */
  static payload(callResult: any): any {
    const text = callResult?.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : undefined;
  }

  kill(): void { this.child.kill(); }
}

describe("MCP stdio e2e (shipped binary)", () => {
  let client: StdioClient;
  let tmpDir: string;
  let initResult: any;

  beforeAll(async () => {
    if (!existsSync(ENTRY)) {
      throw new Error(`Build artifact missing: ${ENTRY}. Run \`pnpm build\` first.`);
    }
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-e2e-"));
    client = new StdioClient(ENTRY, join(tmpDir, "state.json"));
    const init = await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "e2e", version: "0.0.0" },
    });
    initResult = init.result;
    client.notify("notifications/initialized");
  }, 30000);

  afterAll(() => {
    client?.kill();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("completes the initialize handshake with server identity", () => {
    expect(initResult?.serverInfo?.name).toBe("consensus-tools");
    expect(initResult?.serverInfo?.version).toBeTruthy();
    expect(initResult?.protocolVersion).toBe("2024-11-05");
  });

  it("advertises tools over the wire, each with an input schema", async () => {
    const res = await client.request("tools/list", {});
    const tools = res.result?.tools ?? [];
    // The server is documented to expose a large tool surface; assert a healthy
    // floor rather than an exact count so adding a tool doesn't break the test,
    // but every advertised tool MUST carry an input schema (drift guard).
    expect(tools.length).toBeGreaterThanOrEqual(24);
    expect(tools.every((t: any) => t.inputSchema && typeof t.inputSchema === "object")).toBe(true);
    const names: string[] = tools.map((t: any) => t.name);
    for (const expected of ["agent.register", "agent.list", "guard.evaluate", "consensus_post_job"]) {
      expect(names).toContain(expected);
    }
  });

  it("lists no agents on a fresh store", async () => {
    const res = await client.request("tools/call", { name: "agent.list", arguments: {} });
    expect(StdioClient.payload(res)).toEqual({ agents: [] });
  });

  it("persists a write and reflects it on the next read (round-trip)", async () => {
    const register = await client.request("tools/call", {
      name: "agent.register",
      arguments: { id: "e2e-1", name: "E2E Agent", kind: "internal", scopes: [] },
    });
    expect(register.result?.isError).not.toBe(true);
    const created = StdioClient.payload(register);
    expect(created.id).toBe("e2e-1");

    const list = await client.request("tools/call", { name: "agent.list", arguments: {} });
    const { agents } = StdioClient.payload(list);
    expect(agents.map((a: any) => a.id)).toContain("e2e-1");
  });

  it("returns a structured error for invalid tool input (not a crash)", async () => {
    const res = await client.request("tools/call", {
      name: "agent.register",
      arguments: { name: "missing required id/kind/scopes" },
    });
    // Either MCP-level error or a tool-level isError result — never a hang/crash.
    expect(res.error || res.result?.isError).toBeTruthy();
  });

  it("handles an unknown tool gracefully", async () => {
    const res = await client.request("tools/call", {
      name: "no_such_tool",
      arguments: {},
    });
    expect(res.error || res.result?.isError).toBeTruthy();
  });
});
