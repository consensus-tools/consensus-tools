# T15: Migrate Bun Examples to vitest + tsx

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all 3 Bun-based examples (skill-version-eval, skill-sandbox, wrapper-demo) to use vitest + tsx, matching the monorepo standard so Turbo runs their tests in CI.

**Architecture:** Replace `Bun.serve()` with Node's native `http.createServer` (no Express needed — these are simple JSON API servers). Convert `bun:test` imports to `vitest`. Replace `bun run` scripts with `tsx`. Replace `import.meta.dir` with `fileURLToPath(import.meta.url)`. The server refactor extracts a `createApp()` function that returns a request handler, making it testable without binding a port.

**Tech Stack:** Node.js native `http`, vitest, tsx, TypeScript

---

## File Structure

### wrapper-demo (trivial — script change only)

| File | Action | Change |
|------|--------|--------|
| `examples/wrapper-demo/package.json` | Modify | `bun run` → `tsx`, add devDeps |

### skill-sandbox (server migration, no tests)

| File | Action | Change |
|------|--------|--------|
| `examples/skill-sandbox/src/serve.ts` | Modify | `Bun.serve()` → `http.createServer`, fix `import.meta.dir` |
| `examples/skill-sandbox/package.json` | Modify | `bun run` → `tsx`, add devDeps |

### skill-version-eval (server migration + test migration)

| File | Action | Change |
|------|--------|--------|
| `examples/skill-version-eval/src/serve.ts` | Modify | `Bun.serve()` → `http.createServer` with exported `createApp()` |
| `examples/skill-version-eval/src/serve.test.ts` | Modify | `bun:test` → `vitest`, use `createApp()` instead of importing serve.ts |
| `examples/skill-version-eval/src/fetcher.test.ts` | Modify | `bun:test` → `vitest`, `mock()` → `vi.fn()` |
| `examples/skill-version-eval/package.json` | Modify | Scripts + devDeps |

---

## Task 1: wrapper-demo — Script migration

**Files:**
- Modify: `examples/wrapper-demo/package.json`

- [ ] **Step 1: Update package.json**

Replace the full `package.json` with:

```json
{
  "name": "example-wrapper-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "demo": "tsx src/index.ts",
    "test": "echo 'no tests — run demo manually'"
  },
  "dependencies": {
    "@consensus-tools/guards": "workspace:*",
    "@consensus-tools/wrapper": "workspace:*",
    "@consensus-tools/schemas": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.21.0"
  }
}
```

- [ ] **Step 2: Install deps**

```bash
cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools
pnpm install --filter example-wrapper-demo
```

- [ ] **Step 3: Update the docstring in src/index.ts**

In `examples/wrapper-demo/src/index.ts`, replace the comment `* Run: bun run src/index.ts` with `* Run: tsx src/index.ts`.

- [ ] **Step 4: Commit**

```bash
git add examples/wrapper-demo/
git commit -m "chore(wrapper-demo): migrate from bun to tsx (T15)"
```

---

## Task 2: skill-sandbox — Server migration

**Files:**
- Modify: `examples/skill-sandbox/package.json`
- Modify: `examples/skill-sandbox/src/serve.ts`

- [ ] **Step 1: Update package.json**

Replace the full `package.json` with:

```json
{
  "name": "example-skill-sandbox",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/serve.ts",
    "test": "echo 'no tests — run demo manually'"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.78.0",
    "@consensus-tools/evals": "workspace:*",
    "@consensus-tools/guards": "workspace:*",
    "@consensus-tools/schemas": "workspace:*",
    "openai": "^5.0.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0"
  }
}
```

- [ ] **Step 2: Convert serve.ts from Bun.serve to Node http**

Replace the full contents of `examples/skill-sandbox/src/serve.ts`. The key changes:
- `import.meta.dir` → `path.dirname(fileURLToPath(import.meta.url))`
- `Bun.serve({ fetch(req) { ... } })` → `http.createServer(async (req, res) => { ... }).listen(PORT)`
- `new Response(...)` → Node `res.writeHead(...).end(...)` helpers

```typescript
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { fileURLToPath } from "url";
import { listRepos, listSkills, listVersions, fetchSkillAt } from "./fetcher.js";
import { buildRubric } from "./rubric-builder.js";
import { executeSkill, loadFixtureReadme, loadFixtureFiles } from "./executor.js";
import { checkHallucinations } from "./hallucination-checker.js";
import type { SandboxRunLog } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3457;
const DATA_DIR = path.join(__dirname, "..", ".data", "runs");
const UI_DIR = path.join(__dirname, "..", "ui");

let isRunning = false;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const { pathname } = url;
  const method = req.method || "GET";

  // Serve UI
  if (pathname === "/" || pathname === "/index.html") {
    const htmlPath = path.join(UI_DIR, "index.html");
    try {
      const html = fs.readFileSync(htmlPath, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("UI not found");
    }
    return;
  }

  // API: list repos
  if (pathname === "/api/repos" && method === "GET") {
    return sendJson(res, listRepos());
  }

  // API: list skills for a repo
  if (pathname === "/api/skills" && method === "GET") {
    const repo = url.searchParams.get("repo") || "";
    return sendJson(res, listSkills(repo));
  }

  // API: list versions (tags + branches)
  if (pathname === "/api/versions" && method === "GET") {
    const owner = url.searchParams.get("owner") || "";
    const repo = url.searchParams.get("repo") || "";
    if (!owner || !repo) {
      return sendJson(res, { error: "owner and repo required" }, 400);
    }
    return sendJson(res, listVersions(owner, repo));
  }

  // API: status
  if (pathname === "/api/status" && method === "GET") {
    return sendJson(res, { running: isRunning });
  }

  // API: run sandbox
  if (pathname === "/api/run-sandbox" && method === "POST") {
    if (isRunning) {
      return sendJson(res, { error: "A sandbox run is already in progress" }, 409);
    }

    let body: any;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch {
      return sendJson(res, { error: "Invalid JSON body" }, 400);
    }

    const { repo, skill, version, model } = body;
    if (!repo || !skill || !version || !model) {
      return sendJson(
        res,
        { error: "Missing required fields: repo, skill, version, model" },
        400,
      );
    }

    const repoInfo = listRepos().find((r) => r.label === repo);
    if (!repoInfo) {
      return sendJson(res, { error: `Unknown repo: ${repo}` }, 400);
    }

    isRunning = true;
    const start = Date.now();

    try {
      // 1. Fetch SKILL.md
      console.log(`Fetching ${skill}/SKILL.md at ${version}...`);
      const skillContent = fetchSkillAt(repoInfo.owner, repoInfo.repo, skill, version);
      if (!skillContent) {
        return sendJson(
          res,
          { error: `Could not fetch ${skill}/SKILL.md at ref ${version}` },
          404,
        );
      }

      // 2. Load synthetic repo fixtures
      const readme = loadFixtureReadme();
      const { listing } = loadFixtureFiles();

      // 3. Build rubric via consensus
      console.log("Building rubric via consensus...");
      const rubric = await buildRubric(skillContent, readme, listing, model as any);
      console.log(`Rubric built: ${rubric.claims.length} claims, ${rubric.weakPoints.length} weak points`);

      // 4. Execute skill
      console.log("Executing skill against synthetic repo...");
      const executionOutput = await executeSkill(skillContent, rubric, model as any);
      console.log(`Execution complete: ${executionOutput.length} chars`);

      // 5. Check hallucinations via consensus
      console.log("Checking for hallucinations...");
      const hallucinationResult = await checkHallucinations(executionOutput, rubric, model as any);
      console.log(`Hallucination check: ${hallucinationResult.hallucinationCount} found, decision: ${hallucinationResult.decision}`);

      // 6. Build result
      const result: SandboxRunLog = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        skill,
        repo: repo,
        version,
        model,
        rubric,
        executionOutput,
        checkResults: hallucinationResult.checkResults,
        decision: hallucinationResult.decision,
        combinedRisk: hallucinationResult.combinedRisk,
        hallucinationCount: hallucinationResult.hallucinationCount,
        durationMs: Date.now() - start,
      };

      // 7. Save to .data/runs/
      ensureDataDir();
      const runFile = path.join(DATA_DIR, `${result.id}.json`);
      fs.writeFileSync(runFile, JSON.stringify(result, null, 2));
      console.log(`Results saved to ${runFile}`);

      return sendJson(res, result);
    } catch (err: any) {
      console.error("Sandbox run failed:", err);
      return sendJson(res, { error: err.message || "Sandbox run failed" }, 500);
    } finally {
      isRunning = false;
    }
  }

  // API: list past runs
  if (pathname === "/api/runs" && method === "GET") {
    ensureDataDir();
    try {
      const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
      const runs = files
        .map((f) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          return (b.timestamp || "").localeCompare(a.timestamp || "");
        });
      return sendJson(res, runs);
    } catch {
      return sendJson(res, []);
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Skill Sandbox server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Install deps**

```bash
cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools
pnpm install --filter example-skill-sandbox
```

- [ ] **Step 4: Verify typecheck**

```bash
cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools/examples/skill-sandbox
npx tsc --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext src/serve.ts 2>&1 || echo "Typecheck skipped — no tsconfig"
```

If there's no tsconfig, just verify no obvious syntax errors by running:
```bash
cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools
npx tsx examples/skill-sandbox/src/serve.ts &
sleep 1
curl -s http://localhost:3457/ | head -c 100
kill %1 2>/dev/null
```

- [ ] **Step 5: Commit**

```bash
git add examples/skill-sandbox/
git commit -m "chore(skill-sandbox): migrate from Bun.serve to Node http + tsx (T15)"
```

---

## Task 3: skill-version-eval — Server migration

**Files:**
- Modify: `examples/skill-version-eval/src/serve.ts`
- Modify: `examples/skill-version-eval/package.json`

- [ ] **Step 1: Update package.json**

Replace the full `package.json` with:

```json
{
  "name": "example-skill-version-eval",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/serve.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.78.0",
    "@consensus-tools/evals": "workspace:*",
    "@consensus-tools/guards": "workspace:*",
    "@consensus-tools/schemas": "workspace:*",
    "openai": "^5.0.0"
  },
  "devDependencies": {
    "tsx": "^4.21.0",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Convert serve.ts — extract createApp() + Node http**

Replace the full contents of `examples/skill-version-eval/src/serve.ts`. Key design: export a `createApp()` function that returns a Node `http.RequestListener`, so tests can create a server on any port without side effects.

```typescript
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { fileURLToPath } from "url";
import { listCommits, fetchContent } from "./fetcher.js";
import { runVersionEval, runDiffGuard } from "./eval-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UI_DIR = path.join(__dirname, "..", "ui");

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * Creates the HTTP request handler. Exported for testing —
 * tests can create their own http.createServer(createApp()) on any port.
 */
export function createApp(): http.RequestListener {
  let isRunning = false;

  return async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const { pathname } = url;
    const method = req.method || "GET";

    // Serve UI
    if (pathname === "/" || pathname === "/index.html") {
      const htmlPath = path.join(UI_DIR, "index.html");
      try {
        const html = fs.readFileSync(htmlPath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
      } catch {
        res.writeHead(404);
        res.end("UI not found");
      }
      return;
    }

    // API: list commits for a file
    if (pathname === "/api/commits" && method === "GET") {
      const owner = url.searchParams.get("owner") || "";
      const repo = url.searchParams.get("repo") || "";
      const filePath = url.searchParams.get("path") || "";
      if (!owner || !repo || !filePath) {
        return sendJson(res, { error: "owner, repo, and path are required" }, 400);
      }
      try {
        const commits = await listCommits(owner, repo, filePath);
        return sendJson(res, commits);
      } catch (err: any) {
        const status = err.message?.includes("rate limit") ? 429 : 502;
        return sendJson(res, { error: err.message || "Failed to fetch commits" }, status);
      }
    }

    // API: fetch file content at a specific ref
    if (pathname === "/api/content" && method === "GET") {
      const owner = url.searchParams.get("owner") || "";
      const repo = url.searchParams.get("repo") || "";
      const filePath = url.searchParams.get("path") || "";
      const ref = url.searchParams.get("ref") || "";
      if (!owner || !repo || !filePath || !ref) {
        return sendJson(res, { error: "owner, repo, path, and ref are required" }, 400);
      }
      try {
        const content = await fetchContent(owner, repo, filePath, ref);
        if (content === null) {
          return sendJson(res, { error: "File not found at this ref" }, 404);
        }
        return sendJson(res, { content });
      } catch (err: any) {
        const status = err.message?.includes("rate limit") ? 429 : 502;
        return sendJson(res, { error: err.message || "Failed to fetch content" }, status);
      }
    }

    // API: run eval
    if (pathname === "/api/run" && method === "POST") {
      if (isRunning) {
        return sendJson(res, { error: "An evaluation is already running" }, 409);
      }

      let body: any;
      try {
        const raw = await readBody(req);
        body = JSON.parse(raw);
      } catch {
        return sendJson(res, { error: "Invalid JSON body" }, 400);
      }

      const { skill, contentA, contentB, refA, refB, model } = body;
      if (!skill || !contentA || !contentB || !refA || !refB || !model) {
        return sendJson(
          res,
          { error: "Missing required fields: skill, contentA, contentB, refA, refB, model" },
          400,
        );
      }

      isRunning = true;
      try {
        console.log(`Running eval: ${skill} ${refA} vs ${refB} with ${model}...`);
        const results = await runVersionEval(
          skill,
          contentA,
          contentB,
          refA,
          refB,
          model as any,
        );

        console.log(`Eval complete: single=${results.single.winner}, consensus=${results.consensus.winner}`);
        return sendJson(res, results);
      } catch (err: any) {
        console.error("Eval failed:", err);
        return sendJson(res, { error: err.message || "Eval failed" }, 500);
      } finally {
        isRunning = false;
      }
    }

    // API: run diff guard
    if (pathname === "/api/diff-guard" && method === "POST") {
      if (isRunning) {
        return sendJson(res, { error: "An evaluation is already running" }, 409);
      }

      let body: any;
      try {
        const raw = await readBody(req);
        body = JSON.parse(raw);
      } catch {
        return sendJson(res, { error: "Invalid JSON" }, 400);
      }

      const { skill, contentA, contentB, model, proposalId } = body;
      if (!skill || !contentA || !contentB || !model || !proposalId) {
        return sendJson(res, { error: "Missing required fields" }, 400);
      }

      isRunning = true;
      try {
        console.log(`Running diff guard: ${skill} with ${model}...`);
        const result = await runDiffGuard(skill, contentA, contentB, model as any, proposalId);
        return sendJson(res, result);
      } catch (err: any) {
        return sendJson(res, { error: err.message || "Diff guard failed" }, 500);
      } finally {
        isRunning = false;
      }
    }

    res.writeHead(404);
    res.end("Not found");
  };
}

// Start server only when run directly (not imported by tests)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const PORT = 3456;
  const server = http.createServer(createApp());
  server.listen(PORT, () => {
    console.log(`Skill Version Eval server running on http://localhost:${PORT}`);
  });
}
```

- [ ] **Step 3: Install deps**

```bash
cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools
pnpm install --filter example-skill-version-eval
```

- [ ] **Step 4: Commit**

```bash
git add examples/skill-version-eval/package.json examples/skill-version-eval/src/serve.ts
git commit -m "chore(skill-version-eval): migrate serve.ts from Bun.serve to Node http + createApp (T15)"
```

---

## Task 4: skill-version-eval — Migrate fetcher.test.ts to vitest

**Files:**
- Modify: `examples/skill-version-eval/src/fetcher.test.ts`

- [ ] **Step 1: Convert the test file from bun:test to vitest**

Replace the ENTIRE contents of `examples/skill-version-eval/src/fetcher.test.ts`. The changes are:
- `import { describe, test, expect, mock } from "bun:test"` → `import { describe, it, expect, vi } from "vitest"`
- `test(` → `it(`
- `mock(async (...)` → `vi.fn(async (...)` (for fetch mocking)

```typescript
import { describe, it, expect, vi } from "vitest";
import type { CommitEntry } from "./types.js";

describe("listCommits", () => {
  it("returns commits for a valid file path", async () => {
    const { listCommits } = await import("./fetcher.js");

    const mockResponse = [
      {
        sha: "abc1234567890def1234567890abcdef12345678",
        commit: {
          message: "Fix browse timeout handling\n\nLonger description",
          committer: { date: "2026-03-18T20:00:00Z" },
        },
      },
      {
        sha: "def5678901234abc5678901234defabc56789012",
        commit: {
          message: "Add retry logic",
          committer: { date: "2026-03-17T15:00:00Z" },
        },
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/commits")) {
        return new Response(JSON.stringify(mockResponse), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    try {
      const commits = await listCommits("garrytan", "gstack", "qa/SKILL.md");
      expect(commits).toHaveLength(2);
      expect(commits[0].sha).toBe("abc1234567890def1234567890abcdef12345678");
      expect(commits[0].shortSha).toBe("abc1234");
      expect(commits[0].message).toBe("Fix browse timeout handling");
      expect(commits[0].date).toBe("2026-03-18T20:00:00Z");
      expect(commits[1].message).toBe("Add retry logic");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns empty array on 404", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    }) as typeof fetch;

    try {
      const commits = await listCommits("owner", "repo", "nonexistent/file.md");
      expect(commits).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on 403 rate limit", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "X-RateLimit-Remaining": "0" },
      });
    }) as typeof fetch;

    try {
      await expect(listCommits("owner", "repo", "file.md")).rejects.toThrow("rate limit");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("fetchContent", () => {
  it("returns raw content for a valid file + ref", async () => {
    const { fetchContent } = await import("./fetcher.js");

    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return new Response("# Skill Title\n\nContent here", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }) as typeof fetch;

    try {
      const content = await fetchContent("owner", "repo", "qa/SKILL.md", "abc1234");
      expect(content).toBe("# Skill Title\n\nContent here");
      expect(capturedUrl).toContain("/contents/qa/SKILL.md");
      expect(capturedUrl).not.toContain("%2F");
      expect(capturedUrl).toContain("ref=abc1234");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns null on 404", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      const content = await fetchContent("owner", "repo", "qa/SKILL.md", "deadbeef");
      expect(content).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on 403 rate limit", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "X-RateLimit-Remaining": "0" },
      });
    }) as typeof fetch;

    try {
      await expect(fetchContent("owner", "repo", "file.md", "abc")).rejects.toThrow("rate limit");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("403 without X-RateLimit-Remaining header throws generic 403 error", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response("Forbidden", { status: 403 });
    }) as typeof fetch;

    try {
      await expect(fetchContent("owner", "repo", "file.md", "abc")).rejects.toThrow("403");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fetchContent with 500 error throws", async () => {
    const { fetchContent } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response("Internal Server Error", { status: 500 });
    }) as typeof fetch;

    try {
      await expect(fetchContent("owner", "repo", "file.md", "abc")).rejects.toThrow("500");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("listCommits — edge cases", () => {
  it("listCommits with API returning empty array returns []", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    try {
      const commits = await listCommits("owner", "repo", "file.md");
      expect(commits).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("commit message with newlines only returns first line", async () => {
    const { listCommits } = await import("./fetcher.js");

    const mockResponse = [
      {
        sha: "aabbccdd11223344aabbccdd11223344aabbccdd",
        commit: {
          message: "First line\nSecond line\nThird",
          committer: { date: "2026-03-19T10:00:00Z" },
        },
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify(mockResponse), { status: 200 });
    }) as typeof fetch;

    try {
      const commits = await listCommits("owner", "repo", "file.md");
      expect(commits).toHaveLength(1);
      expect(commits[0].message).toBe("First line");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("githubFetch — authentication", () => {
  it("sends Authorization header when GITHUB_TOKEN is set", async () => {
    const { listCommits } = await import("./fetcher.js");

    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_test_token_123";

    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}),
      );
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    try {
      await listCommits("owner", "repo", "file.md");
      expect(capturedHeaders["Authorization"]).toBe("Bearer ghp_test_token_123");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });

  it("does NOT send Authorization header when GITHUB_TOKEN is unset", async () => {
    const { listCommits } = await import("./fetcher.js");

    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}),
      );
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    try {
      await listCommits("owner", "repo", "file.md");
      expect(capturedHeaders["Authorization"]).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });

  it("401 with GITHUB_TOKEN set throws enriched error mentioning token", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "ghp_bad_token";

    globalThis.fetch = vi.fn(async () => {
      return new Response("Bad credentials", { status: 401 });
    }) as typeof fetch;

    try {
      await expect(listCommits("owner", "repo", "file.md")).rejects.toThrow("GITHUB_TOKEN");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });

  it("401 without GITHUB_TOKEN throws generic 401 error", async () => {
    const { listCommits } = await import("./fetcher.js");

    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    globalThis.fetch = vi.fn(async () => {
      return new Response("Bad credentials", { status: 401 });
    }) as typeof fetch;

    try {
      await expect(listCommits("owner", "repo", "file.md")).rejects.toThrow("401");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalEnv;
    }
  });
});
```

- [ ] **Step 2: Run fetcher tests**

```bash
cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools
pnpm --filter example-skill-version-eval test -- src/fetcher.test.ts
```

Expected: All 12 fetcher tests PASS.

- [ ] **Step 3: Commit**

```bash
git add examples/skill-version-eval/src/fetcher.test.ts
git commit -m "test(skill-version-eval): migrate fetcher.test.ts from bun:test to vitest (T15)"
```

---

## Task 5: skill-version-eval — Migrate serve.test.ts to vitest

**Files:**
- Modify: `examples/skill-version-eval/src/serve.test.ts`

- [ ] **Step 1: Convert serve.test.ts to vitest with createApp()**

Replace the ENTIRE contents of `examples/skill-version-eval/src/serve.test.ts`. Key changes:
- Use `createApp()` to create a server on a random port in `beforeAll`
- Clean up server in `afterAll`
- `bun:test` → `vitest`

```typescript
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
```

- [ ] **Step 2: Run all tests**

```bash
cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools
pnpm --filter example-skill-version-eval test
```

Expected: All tests PASS (fetcher tests + serve integration tests).

- [ ] **Step 3: Commit**

```bash
git add examples/skill-version-eval/src/serve.test.ts
git commit -m "test(skill-version-eval): migrate serve.test.ts from bun:test to vitest + createApp (T15)"
```

---

## Task 6: Update TODOS.md + full verify

**Files:**
- Modify: `TODOS.md`

- [ ] **Step 1: Mark T15 as done in TODOS.md**

Replace the T15 section header and content with:

```markdown
## ~~T15: Migrate Bun examples to vitest + tsx~~ DONE (2026-03-20)

Converted all 3 Bun examples to monorepo standard. wrapper-demo: script change only. skill-sandbox: Bun.serve → Node http.createServer. skill-version-eval: Bun.serve → Node http with exported createApp(), bun:test → vitest (fetcher + serve integration tests). All tests now run via `pnpm test` / Turbo.
```

- [ ] **Step 2: Update priority block**

Remove T15 from P3 line.

- [ ] **Step 3: Build and test everything**

```bash
cd /Users/kaicianflone/repos/claude-consensus-workspace/consensus-tools
pnpm build && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add TODOS.md
git commit -m "docs: mark T15 (Bun migration) as done in TODOS.md"
```
