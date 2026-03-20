import * as fs from "fs";
import * as path from "path";
import { listRepos, listSkills, listVersions, fetchSkillAt } from "./fetcher.js";
import { buildRubric } from "./rubric-builder.js";
import { executeSkill, loadFixtureReadme, loadFixtureFiles } from "./executor.js";
import { checkHallucinations } from "./hallucination-checker.js";
import type { SandboxRunLog } from "./types.js";

const PORT = 3457;
const DATA_DIR = path.join(import.meta.dir, "..", ".data", "runs");
const UI_DIR = path.join(import.meta.dir, "..", "ui");

let isRunning = false;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

    // API: list repos
    if (pathname === "/api/repos" && req.method === "GET") {
      return jsonResponse(listRepos());
    }

    // API: list skills for a repo
    if (pathname === "/api/skills" && req.method === "GET") {
      const repo = url.searchParams.get("repo") || "";
      return jsonResponse(listSkills(repo));
    }

    // API: list versions (tags + branches)
    if (pathname === "/api/versions" && req.method === "GET") {
      const owner = url.searchParams.get("owner") || "";
      const repo = url.searchParams.get("repo") || "";
      if (!owner || !repo) {
        return jsonResponse({ error: "owner and repo required" }, 400);
      }
      return jsonResponse(listVersions(owner, repo));
    }

    // API: status
    if (pathname === "/api/status" && req.method === "GET") {
      return jsonResponse({ running: isRunning });
    }

    // API: run sandbox
    if (pathname === "/api/run-sandbox" && req.method === "POST") {
      if (isRunning) {
        return jsonResponse({ error: "A sandbox run is already in progress" }, 409);
      }

      let body: any;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const { repo, skill, version, model } = body;
      if (!repo || !skill || !version || !model) {
        return jsonResponse(
          { error: "Missing required fields: repo, skill, version, model" },
          400,
        );
      }

      const repoInfo = listRepos().find((r) => r.label === repo);
      if (!repoInfo) {
        return jsonResponse({ error: `Unknown repo: ${repo}` }, 400);
      }

      isRunning = true;
      const start = Date.now();

      try {
        // 1. Fetch SKILL.md
        console.log(`Fetching ${skill}/SKILL.md at ${version}...`);
        const skillContent = fetchSkillAt(repoInfo.owner, repoInfo.repo, skill, version);
        if (!skillContent) {
          return jsonResponse(
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

        return jsonResponse(result);
      } catch (err: any) {
        console.error("Sandbox run failed:", err);
        return jsonResponse({ error: err.message || "Sandbox run failed" }, 500);
      } finally {
        isRunning = false;
      }
    }

    // API: list past runs
    if (pathname === "/api/runs" && req.method === "GET") {
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
        return jsonResponse(runs);
      } catch {
        return jsonResponse([]);
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Skill Sandbox server running on http://localhost:${PORT}`);
