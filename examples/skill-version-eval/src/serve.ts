import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { fileURLToPath } from "url";
import { listCommits, fetchContent } from "./fetcher.js";
import { runVersionEval, runDiffGuard } from "./eval-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);

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
        const results = await runVersionEval(skill, contentA, contentB, refA, refB, model as any);
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
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const PORT = 3456;
  const server = http.createServer(createApp());
  server.listen(PORT, () => {
    console.log(`Skill Version Eval server running on http://localhost:${PORT}`);
  });
}
