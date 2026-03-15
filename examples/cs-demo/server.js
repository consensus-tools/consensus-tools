import "dotenv/config";
import express from "express";
import { createOpenAI } from "@ai-sdk/openai";
import { createTelemetry } from "./lib/telemetry.js";
import { generateScenario } from "./lib/scenarios.js";
import { getCSResponse, rewriteCSResponse } from "./lib/cs-agent.js";
import { runGuards, TIER_CONFIG } from "./lib/guard-pipeline.js";
import { formatHitlMessage } from "./lib/hitl.js";
import { randomUUID } from "node:crypto";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required. Set it in .env");
  process.exit(1);
}

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
const model = openai("gpt-4o");

const AUDIT_PATH = "./.data/audit.ndjson";
const { sseSink, emit, buffer } = createTelemetry(AUDIT_PATH);

// ── State ────────────────────────────────────────────────────────────
// Guard reputation: { [personaId]: number }
let guardReputation = {};
// Run history: { [runId]: RunState }
let runs = {};

function initGuardRep() {
  const personas = ["security-analyst", "compliance-officer", "operations-engineer", "legal-reviewer", "cx-quality"];
  guardReputation = {};
  for (const id of personas) guardReputation[id] = 1000;
}
initGuardRep();

// ── Routes ───────────────────────────────────────────────────────────

app.get("/api/tiers", (_req, res) => {
  res.json(
    Object.entries(TIER_CONFIG).map(([id, config]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      guardCount: config.count,
      riskThreshold: config.riskThreshold,
    }))
  );
});

app.get("/api/reputation", (_req, res) => {
  res.json(
    Object.entries(guardReputation).map(([id, rep]) => ({
      guardId: id,
      guardName: formatGuardName(id),
      reputation: rep,
    }))
  );
});

app.get("/api/telemetry/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  sseSink.addClient(res);
  req.on("close", () => sseSink.removeClient(res));
});

app.post("/api/run", async (req, res) => {
  try {
    const riskTier = String(req.body.riskTier || "").slice(0, 20);
    if (!TIER_CONFIG[riskTier]) {
      return res.status(400).json({ error: `Invalid risk tier. Must be low, medium, high, or critical.` });
    }

    const runId = `run_${randomUUID().slice(0, 8)}`;
    const tierConfig = TIER_CONFIG[riskTier];

    // Step 1: Generate scenario
    emit("job.submitted", runId, { step: "scenario", riskTier });
    const scenario = await generateScenario(riskTier, model);
    emit("job.submitted", runId, { step: "scenario-complete", riskTier });

    // Step 2: CS agent drafts response
    emit("job.submitted", runId, { step: "cs-agent" });
    const csResponse = await getCSResponse(scenario, model);
    emit("job.submitted", runId, { step: "cs-agent-complete" });

    // Step 3: Guard pipeline
    emit("job.submitted", runId, { step: "guard-eval", guardCount: tierConfig.count });
    const guardResult = await runGuards(csResponse, scenario, riskTier, guardReputation, model);

    // Emit individual guard votes
    for (const vote of guardResult.votes) {
      emit("job.voted", runId, {
        step: "guard-vote",
        evaluator: vote.evaluator,
        vote: vote.vote,
        risk: vote.risk,
        reason: vote.reason,
      });
    }

    emit("job.resolved", runId, {
      step: "guard-decision",
      decision: guardResult.decision,
      combinedRisk: guardResult.combinedRisk,
      quorumMet: guardResult.quorumMet,
    });

    // Build run state — cycles tracks every response + guard evaluation
    const initialCycle = {
      cycle: 0,
      response: csResponse,
      guardResult: {
        decision: guardResult.decision,
        votes: guardResult.votes,
        combinedRisk: guardResult.combinedRisk,
        quorumMet: guardResult.quorumMet,
        tally: guardResult.tally,
      },
    };

    const run = {
      id: runId,
      riskTier,
      scenario,
      csResponse,
      currentResponse: csResponse,
      guardResult,
      decision: guardResult.decision,
      rewriteCount: 0,
      resolved: false,
      flaggedBad: false,
      hitlMessage: null,
      cycles: [initialCycle],
    };

    // Handle decision
    if (guardResult.decision === "ALLOW") {
      run.resolved = true;
      run.allowVotes = guardResult.votes;
      for (const vote of guardResult.votes) {
        guardReputation[vote.evaluator] = (guardReputation[vote.evaluator] ?? 1000) + 1;
        emit("ledger.payout", runId, { amount: 1, guardName: vote.evaluator, newBalance: guardReputation[vote.evaluator] });
      }
    } else if (guardResult.decision === "REQUIRE_HUMAN") {
      run.hitlMessage = formatHitlMessage(runId, guardResult.votes, guardResult.combinedRisk, tierConfig.riskThreshold);
    } else if (guardResult.decision === "REWRITE") {
      const rewriteResult = await handleRewrite(run, model);
      Object.assign(run, rewriteResult);
    }
    // BLOCK: run stays unresolved, no further action

    runs[runId] = run;

    res.json({
      runId: run.id,
      riskTier: run.riskTier,
      scenario: run.scenario,
      csResponse: run.csResponse,
      currentResponse: run.currentResponse,
      decision: run.decision,
      cycles: run.cycles,
      rewriteCount: run.rewriteCount,
      resolved: run.resolved,
      hitlMessage: run.hitlMessage,
    });
  } catch (err) {
    console.error("Run error:", err);
    res.status(503).json({ error: err.message });
  }
});

async function handleRewrite(run, mdl) {
  const MAX_REWRITES = 2;
  let currentResponse = run.currentResponse;
  let lastGuardResult = run.guardResult;
  let rewriteCount = run.rewriteCount;

  while (rewriteCount < MAX_REWRITES) {
    rewriteCount++;
    emit("job.submitted", run.id, { step: "rewrite", cycle: rewriteCount });

    const feedback = lastGuardResult.votes.filter((v) => v.vote !== "YES");
    currentResponse = await rewriteCSResponse(run.scenario, currentResponse, feedback, mdl);

    emit("job.submitted", run.id, { step: "rewrite-complete", cycle: rewriteCount });

    emit("job.submitted", run.id, { step: "guard-re-eval", cycle: rewriteCount });
    const newGuardResult = await runGuards(currentResponse, run.scenario, run.riskTier, guardReputation, mdl);

    for (const vote of newGuardResult.votes) {
      emit("job.voted", run.id, { step: "guard-vote", evaluator: vote.evaluator, vote: vote.vote, risk: vote.risk, cycle: rewriteCount });
    }

    emit("job.resolved", run.id, { step: "guard-decision", decision: newGuardResult.decision, cycle: rewriteCount });
    lastGuardResult = newGuardResult;

    // Record this cycle
    run.cycles.push({
      cycle: rewriteCount,
      response: currentResponse,
      guardResult: {
        decision: newGuardResult.decision,
        votes: newGuardResult.votes,
        combinedRisk: newGuardResult.combinedRisk,
        quorumMet: newGuardResult.quorumMet,
        tally: newGuardResult.tally,
      },
    });

    if (newGuardResult.decision === "ALLOW") {
      run.allowVotes = newGuardResult.votes;
      for (const vote of newGuardResult.votes) {
        guardReputation[vote.evaluator] = (guardReputation[vote.evaluator] ?? 1000) + 1;
        emit("ledger.payout", run.id, { amount: 1, guardName: vote.evaluator, newBalance: guardReputation[vote.evaluator] });
      }
      return {
        currentResponse,
        guardResult: newGuardResult,
        decision: "ALLOW",
        rewriteCount,
        resolved: true,
        hitlMessage: null,
      };
    }

    if (newGuardResult.decision === "BLOCK") {
      return { currentResponse, guardResult: newGuardResult, decision: "BLOCK", rewriteCount, resolved: false, hitlMessage: null };
    }
  }

  // Exhausted rewrites → escalate to HITL
  // Slash guards who kept voting YES on content that needed rewrites
  for (const vote of lastGuardResult.votes) {
    if (vote.vote === "YES") {
      guardReputation[vote.evaluator] = (guardReputation[vote.evaluator] ?? 1000) - 5;
      emit("ledger.slash", run.id, { amount: 5, guardName: vote.evaluator, reason: "missed_issues_in_rewrite", newBalance: guardReputation[vote.evaluator] });
    } else {
      guardReputation[vote.evaluator] = (guardReputation[vote.evaluator] ?? 1000) + 3;
      emit("ledger.payout", run.id, { amount: 3, guardName: vote.evaluator, newBalance: guardReputation[vote.evaluator] });
    }
  }

  const tierConfig = TIER_CONFIG[run.riskTier];
  return {
    currentResponse,
    guardResult: lastGuardResult,
    decision: "REQUIRE_HUMAN",
    rewriteCount,
    resolved: false,
    hitlMessage: formatHitlMessage(run.id, lastGuardResult.votes, lastGuardResult.combinedRisk, tierConfig.riskThreshold),
  };
}

app.post("/api/hitl-respond", async (req, res) => {
  try {
    const { runId, decision } = req.body;
    const run = runs[runId];
    if (!run) return res.status(404).json({ error: "Run not found" });
    if (run.resolved) return res.status(400).json({ error: "Run already resolved" });

    if (decision === "APPROVE") {
      run.decision = "ALLOW";
      run.resolved = true;
      run.allowVotes = run.guardResult.votes;
      emit("job.resolved", runId, { step: "hitl-approve" });
      for (const vote of run.guardResult.votes) {
        guardReputation[vote.evaluator] = (guardReputation[vote.evaluator] ?? 1000) + 1;
        emit("ledger.payout", runId, { amount: 1, guardName: vote.evaluator, newBalance: guardReputation[vote.evaluator] });
      }
    } else if (decision === "REJECT") {
      run.decision = "BLOCK";
      run.resolved = true;
      emit("job.resolved", runId, { step: "hitl-reject" });
    } else if (decision === "REVISE") {
      // Rewrite loop
      emit("job.submitted", runId, { step: "hitl-revise" });
      const rewriteResult = await handleRewrite(run, model);
      Object.assign(run, rewriteResult);
    } else {
      return res.status(400).json({ error: "Invalid decision. Must be APPROVE, REJECT, or REVISE." });
    }

    res.json({
      runId: run.id,
      scenario: run.scenario,
      decision: run.decision,
      currentResponse: run.currentResponse,
      resolved: run.resolved,
      rewriteCount: run.rewriteCount,
      cycles: run.cycles,
      hitlMessage: run.hitlMessage,
      guardResult: run.guardResult ? {
        decision: run.guardResult.decision,
        votes: run.guardResult.votes,
        combinedRisk: run.guardResult.combinedRisk,
      } : null,
    });
  } catch (err) {
    console.error("HITL error:", err);
    res.status(503).json({ error: err.message });
  }
});

app.post("/api/flag-bad", (req, res) => {
  const { runId } = req.body;
  const run = runs[runId];
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.flaggedBad) return res.status(400).json({ error: "Already flagged" });
  if (!run.resolved || run.decision !== "ALLOW") {
    return res.status(400).json({ error: "Can only flag approved responses" });
  }

  run.flaggedBad = true;

  // Slash guards who voted YES on the ALLOW decision, reward those who flagged
  const votesToSlash = run.allowVotes || run.guardResult.votes;
  for (const vote of votesToSlash) {
    if (vote.vote === "YES") {
      // Revoke the +1 from clean consensus and slash -10
      guardReputation[vote.evaluator] = (guardReputation[vote.evaluator] ?? 1000) - 11;
      emit("ledger.slash", runId, { amount: 11, guardName: vote.evaluator, reason: "approved_bad_response", newBalance: guardReputation[vote.evaluator] });
    } else {
      guardReputation[vote.evaluator] = (guardReputation[vote.evaluator] ?? 1000) + 5;
      emit("ledger.payout", runId, { amount: 5, guardName: vote.evaluator, reason: "correctly_flagged", newBalance: guardReputation[vote.evaluator] });
    }
  }

  res.json({
    runId,
    flaggedBad: true,
    reputation: Object.entries(guardReputation).map(([id, rep]) => ({
      guardId: id,
      guardName: formatGuardName(id),
      reputation: rep,
    })),
  });
});

app.get("/api/telemetry/export", async (_req, res) => {
  await buffer.flush();
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(AUDIT_PATH, "utf-8");
    const events = raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=telemetry.json");
    res.json(events);
  } catch {
    res.status(404).json({ error: "No telemetry data yet" });
  }
});

app.post("/api/reset", async (_req, res) => {
  runs = {};
  initGuardRep();
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(AUDIT_PATH, "", "utf-8");
  } catch {}
  res.json({ success: true });
});

function formatGuardName(id) {
  return id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Start ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`CS Guard Demo running at http://localhost:${PORT}`);
});
