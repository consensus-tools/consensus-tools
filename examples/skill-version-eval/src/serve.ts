import * as fs from "fs";
import * as path from "path";
import { listRepos, listSkills, listVersions, fetchSkillAt } from "./fetcher.js";
import { runVersionEval, runDiffGuard } from "./eval-runner.js";

const PORT = 3456;
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

    // API: run eval
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

      const { repo, skill, versionA, versionB, model } = body;
      if (!repo || !skill || !versionA || !versionB || !model) {
        return jsonResponse(
          { error: "Missing required fields: repo, skill, versionA, versionB, model" },
          400,
        );
      }

      const repoInfo = listRepos().find((r) => r.label === repo);
      if (!repoInfo) {
        return jsonResponse({ error: `Unknown repo: ${repo}` }, 400);
      }

      isRunning = true;
      try {
        console.log(`Fetching ${skill}/SKILL.md at ${versionA}...`);
        const contentA = fetchSkillAt(repoInfo.owner, repoInfo.repo, skill, versionA);
        if (!contentA) {
          return jsonResponse(
            { error: `${skill}/SKILL.md not found at "${versionA}" — this skill may not exist on that branch/tag` },
            404,
          );
        }

        console.log(`Fetching ${skill}/SKILL.md at ${versionB}...`);
        const contentB = fetchSkillAt(repoInfo.owner, repoInfo.repo, skill, versionB);
        if (!contentB) {
          return jsonResponse(
            { error: `${skill}/SKILL.md not found at "${versionB}" — this skill may not exist on that branch/tag` },
            404,
          );
        }

        console.log(`Running eval: ${skill} ${versionA} vs ${versionB} with ${model}...`);
        const results = await runVersionEval(
          skill,
          contentA,
          contentB,
          versionA,
          versionB,
          model as any,
        );

        // Save results
        ensureDataDir();
        const runFile = path.join(DATA_DIR, `${results.single.proposalId}.json`);
        fs.writeFileSync(runFile, JSON.stringify(results, null, 2));
        console.log(`Results saved to ${runFile}`);

        return jsonResponse(results);
      } catch (err: any) {
        console.error("Eval failed:", err);
        return jsonResponse({ error: err.message || "Eval failed" }, 500);
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
            const tA = a.single?.timestamp || a.consensus?.timestamp || "";
            const tB = b.single?.timestamp || b.consensus?.timestamp || "";
            return tB.localeCompare(tA);
          });
        return jsonResponse(runs);
      } catch {
        return jsonResponse([]);
      }
    }

    // API: run diff guard (optional, triggered by button)
    if (pathname === "/api/diff-guard" && req.method === "POST") {
      if (isRunning) {
        return jsonResponse({ error: "An evaluation is already running" }, 409);
      }

      let body: any;
      try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

      const { repo, skill, versionA, versionB, model, proposalId } = body;
      if (!repo || !skill || !versionA || !versionB || !model || !proposalId) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      const repoInfo = listRepos().find((r) => r.label === repo);
      if (!repoInfo) return jsonResponse({ error: `Unknown repo: ${repo}` }, 400);

      isRunning = true;
      try {
        const contentA = fetchSkillAt(repoInfo.owner, repoInfo.repo, skill, versionA);
        const contentB = fetchSkillAt(repoInfo.owner, repoInfo.repo, skill, versionB);
        if (!contentA || !contentB) {
          return jsonResponse({ error: "Could not fetch one or both versions" }, 404);
        }

        console.log(`Running diff guard: ${skill} ${versionA} vs ${versionB}...`);
        const result = await runDiffGuard(skill, contentA, contentB, model as any, proposalId);

        // Save alongside the eval run
        ensureDataDir();
        const guardFile = path.join(DATA_DIR, `guard-${result.id}.json`);
        fs.writeFileSync(guardFile, JSON.stringify(result, null, 2));

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
