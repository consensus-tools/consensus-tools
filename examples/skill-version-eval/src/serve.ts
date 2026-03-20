import * as fs from "fs";
import * as path from "path";
import { listCommits, fetchContent } from "./fetcher.js";
import { runVersionEval, runDiffGuard } from "./eval-runner.js";

const PORT = 3456;
const UI_DIR = path.join(import.meta.dir, "..", "ui");

let isRunning = false;

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // Serve UI
    if (pathname === "/" || pathname === "/index.html") {
      const htmlPath = path.join(UI_DIR, "index.html");
      try {
        const html = fs.readFileSync(htmlPath, "utf-8");
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      } catch {
        return new Response("UI not found", { status: 404 });
      }
    }

    // API: list commits for a file
    if (pathname === "/api/commits" && req.method === "GET") {
      const owner = url.searchParams.get("owner") || "";
      const repo = url.searchParams.get("repo") || "";
      const filePath = url.searchParams.get("path") || "";
      if (!owner || !repo || !filePath) {
        return jsonResponse({ error: "owner, repo, and path are required" }, 400);
      }
      try {
        const commits = await listCommits(owner, repo, filePath);
        return jsonResponse(commits);
      } catch (err: any) {
        const status = err.message?.includes("rate limit") ? 429 : 502;
        return jsonResponse({ error: err.message || "Failed to fetch commits" }, status);
      }
    }

    // API: fetch file content at a specific ref
    if (pathname === "/api/content" && req.method === "GET") {
      const owner = url.searchParams.get("owner") || "";
      const repo = url.searchParams.get("repo") || "";
      const filePath = url.searchParams.get("path") || "";
      const ref = url.searchParams.get("ref") || "";
      if (!owner || !repo || !filePath || !ref) {
        return jsonResponse({ error: "owner, repo, path, and ref are required" }, 400);
      }
      try {
        const content = await fetchContent(owner, repo, filePath, ref);
        if (content === null) {
          return jsonResponse({ error: "File not found at this ref" }, 404);
        }
        return jsonResponse({ content });
      } catch (err: any) {
        const status = err.message?.includes("rate limit") ? 429 : 502;
        return jsonResponse({ error: err.message || "Failed to fetch content" }, status);
      }
    }

    // API: run eval (client sends content — server does NOT re-fetch from GitHub)
    if (pathname === "/api/run" && req.method === "POST") {
      if (isRunning) {
        return jsonResponse({ error: "An evaluation is already running" }, 409);
      }

      let body: any;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const { skill, contentA, contentB, refA, refB, model } = body;
      if (!skill || !contentA || !contentB || !refA || !refB || !model) {
        return jsonResponse(
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
        return jsonResponse(results);
      } catch (err: any) {
        console.error("Eval failed:", err);
        return jsonResponse({ error: err.message || "Eval failed" }, 500);
      } finally {
        isRunning = false;
      }
    }

    // API: run diff guard (client sends content)
    if (pathname === "/api/diff-guard" && req.method === "POST") {
      if (isRunning) {
        return jsonResponse({ error: "An evaluation is already running" }, 409);
      }

      let body: any;
      try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

      const { skill, contentA, contentB, model, proposalId } = body;
      if (!skill || !contentA || !contentB || !model || !proposalId) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      isRunning = true;
      try {
        console.log(`Running diff guard: ${skill} with ${model}...`);
        const result = await runDiffGuard(skill, contentA, contentB, model as any, proposalId);
        return jsonResponse(result);
      } catch (err: any) {
        return jsonResponse({ error: err.message || "Diff guard failed" }, 500);
      } finally {
        isRunning = false;
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Skill Version Eval server running on http://localhost:${PORT}`);
