import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { fileURLToPath } from "url";
import { listRepos, listSkills, listVersions, fetchSkillAt } from "./fetcher.js";
import { buildRubric } from "./rubric-builder.js";
import { executeSkill, loadFixtureReadme, loadFixtureFiles } from "./executor.js";
import { checkHallucinations } from "./hallucination-checker.js";
import type { SandboxRunLog } from "./types.js";

const PORT = 3457;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
      return;
    } catch {
      res.writeHead(404);
      res.end("UI not found");
      return;
    }
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
      body = JSON.parse(await readBody(req));
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
