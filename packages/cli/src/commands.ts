import os from "node:os";
import { Command } from "commander";
import { ConsensusToolsClient } from "@consensus-tools/sdk-client";
import {
  loadCliConfig,
  saveCliConfig,
  getConfigValue,
  setConfigValue,
  parseValue,
  resolveRemoteBaseUrl,
  type ConsensusCliConfig,
} from "./config.js";
import { renderTable } from "./util/table.js";

function resolveAgentId(cfg: ConsensusCliConfig): string {
  const fromEnv = process.env.CONSENSUS_AGENT_ID;
  if (fromEnv) return fromEnv;
  if (cfg.agentId) return cfg.agentId;
  let user = "cli";
  try { const u = os.userInfo(); if (u?.username) user = u.username; } catch { /* ignore */ }
  const id = `${user}@${os.hostname()}`;
  console.warn(`[cli] Using default agent ID: ${id}. Set CONSENSUS_AGENT_ID or run 'consensus-tools config set agentId <id>' for stable identity.`);
  return id;
}

function createRemoteClient(cfg: ConsensusCliConfig): ConsensusToolsClient {
  const baseUrl = resolveRemoteBaseUrl(cfg.boards.remote.url, cfg.boards.remote.boardId);
  const envName = cfg.boards.remote.auth.apiKeyEnv || "CONSENSUS_API_KEY";
  const token = process.env[envName] || "";
  if (!token) throw new Error(`Missing access token. Set ${envName}.`);
  return new ConsensusToolsClient({ baseUrl, accessToken: token });
}

function output(data: unknown, json: boolean) {
  if (json || typeof data !== "string") console.log(JSON.stringify(data, null, 2));
  else console.log(data);
}

export function buildProgram(): Command {
  const program = new Command("consensus-tools")
    .description("Decision infrastructure for agentic systems")
    .version("0.1.0");

  // config get/set
  const configCmd = program.command("config").description("Manage config");
  configCmd.command("get <key>").action(async (key: string) => {
    const cfg = await loadCliConfig();
    output(getConfigValue(cfg as unknown as Record<string, unknown>, key) ?? null, true);
  });
  configCmd.command("set <key> <value>").action(async (key: string, value: string) => {
    const cfg = await loadCliConfig();
    setConfigValue(cfg as unknown as Record<string, unknown>, key, parseValue(value));
    await saveCliConfig(cfg);
    output({ ok: true }, true);
  });

  // board use
  const board = program.command("board").description("Manage active board");
  board.command("use <type> [url]").action(async (type: string, url?: string) => {
    if (type !== "local" && type !== "remote") throw new Error("board type must be local or remote");
    const cfg = await loadCliConfig();
    cfg.activeBoard = type;
    if (type === "remote" && url) cfg.boards.remote.url = url;
    await saveCliConfig(cfg);
    output({ activeBoard: cfg.activeBoard, url: cfg.boards.remote.url }, true);
  });

  // jobs
  const jobs = program.command("jobs").description("Manage jobs");
  jobs.command("post")
    .requiredOption("--title <title>", "Job title")
    .option("--desc <desc>", "Job description")
    .option("--mode <mode>", "Job mode")
    .option("--policy <policy>", "Policy key")
    .option("--reward <n>", "Reward", parseFloat)
    .option("--stake <n>", "Stake", parseFloat)
    .option("--expires <seconds>", "Expires seconds", parseInt)
    .option("--json", "JSON output")
    .action(async (opts) => {
      const cfg = await loadCliConfig();
      const agentId = resolveAgentId(cfg);
      const client = createRemoteClient(cfg);
      const job = await client.postJob(agentId, {
        title: opts.title, description: opts.desc || opts.title,
        mode: opts.mode, reward: opts.reward, stakeRequired: opts.stake,
        expiresSeconds: opts.expires,
      });
      output(job, opts.json);
    });

  jobs.command("list")
    .option("--tag <tag>")
    .option("--status <status>")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const cfg = await loadCliConfig();
      const client = createRemoteClient(cfg);
      const list = await client.listJobs({ tag: opts.tag, status: opts.status });
      if (opts.json) return output(list, true);
      console.log(renderTable(
        list.map((j) => ({ id: j.id, title: j.title, status: j.status })),
        [{ key: "id", label: "ID" }, { key: "title", label: "Title" }, { key: "status", label: "Status" }],
      ));
    });

  jobs.command("get <jobId>")
    .option("--json", "JSON output")
    .action(async (jobId: string, opts) => {
      const cfg = await loadCliConfig();
      const client = createRemoteClient(cfg);
      output(await client.getJob(jobId), opts.json);
    });

  // submit
  program.command("submit <jobId>")
    .requiredOption("--artifact <json>", "Artifact JSON string")
    .option("--confidence <n>", "Confidence 0-1", parseFloat)
    .option("--json", "JSON output")
    .action(async (jobId: string, opts) => {
      const cfg = await loadCliConfig();
      const agentId = resolveAgentId(cfg);
      const client = createRemoteClient(cfg);
      const submission = await client.submitJob(agentId, jobId, {
        artifacts: JSON.parse(opts.artifact),
        confidence: opts.confidence ?? 0.5,
      });
      output(submission, opts.json);
    });

  // vote
  program.command("vote <jobId>")
    .requiredOption("--submission <id>", "Submission ID")
    .option("--score <n>", "Score", parseFloat)
    .option("--weight <n>", "Weight", parseFloat)
    .option("--json", "JSON output")
    .action(async (jobId: string, opts) => {
      const cfg = await loadCliConfig();
      const agentId = resolveAgentId(cfg);
      const client = createRemoteClient(cfg);
      output(await client.vote(agentId, jobId, {
        submissionId: opts.submission,
        score: opts.score ?? 1,
        weight: opts.weight,
      }), opts.json);
    });

  // resolve
  program.command("resolve <jobId>")
    .option("--winner <agentId>", "Winner agent")
    .option("--submission <submissionId>", "Winning submission")
    .option("--json", "JSON output")
    .action(async (jobId: string, opts) => {
      const cfg = await loadCliConfig();
      const agentId = resolveAgentId(cfg);
      const client = createRemoteClient(cfg);
      output(await client.resolveJob(agentId, jobId, {
        manualWinners: opts.winner ? [opts.winner] : undefined,
        manualSubmissionId: opts.submission,
      }), opts.json);
    });

  // status
  program.command("status <jobId>")
    .option("--json", "JSON output")
    .action(async (jobId: string, opts) => {
      const cfg = await loadCliConfig();
      const client = createRemoteClient(cfg);
      output(await client.getStatus(jobId), opts.json);
    });

  // explain
  program.command("explain <auditId>")
    .description("Explain a guard decision in plain language (requires ANTHROPIC_API_KEY or OPENAI_API_KEY)")
    .option("--json", "JSON output")
    .option("--verbose", "Print the prompt sent to the LLM")
    .action(async (auditId: string, opts) => {
      // Load local storage to find the guard result
      const { explainDecision, guardResultToExplainInput } = await import("@consensus-tools/core");
      const { JsonStorage } = await import("@consensus-tools/storage");
      const cfg = await loadCliConfig();
      const storagePath = cfg.boards.local.storagePath ?? "./data/local-board.json";
      const storage = new JsonStorage(storagePath);
      await storage.init();

      const state = await storage.getState();
      const guardResult = state.guardResults.find((r) => r.audit_id === auditId);
      if (!guardResult) {
        console.error(`Error: No guard result found for audit ID: ${auditId}`);
        process.exit(1);
      }

      const input = guardResultToExplainInput(guardResult);

      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!anthropicKey && !openaiKey) {
        console.error("Error: Set ANTHROPIC_API_KEY or OPENAI_API_KEY to use LLM features");
        process.exit(1);
      }

      // Log which LLM provider is being used (visibility into implicit preference)
      console.error(`[consensus] Using ${anthropicKey ? "Anthropic" : "OpenAI"} for LLM explanation`);

      const maxTokens = 1024;
      let llm;
      if (anthropicKey) {
        const Anthropic = (await import("@anthropic-ai/sdk" as string)).default;
        const client = new Anthropic({ apiKey: anthropicKey });
        const model = "claude-sonnet-4-20250514";
        llm = async (prompt: string) => {
          const res = await client.messages.create({
            model,
            max_tokens: maxTokens,
            messages: [{ role: "user", content: prompt }],
          });
          const block = res.content?.[0];
          return block?.type === "text" ? block.text : "";
        };
      } else {
        const OpenAI = (await import("openai" as string)).default;
        const client = new OpenAI({ apiKey: openaiKey });
        const model = "gpt-4o-mini";
        llm = async (prompt: string) => {
          const res = await client.chat.completions.create({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens,
          });
          return res.choices?.[0]?.message?.content ?? "";
        };
      }

      const onPrompt = opts.verbose ? (prompt: string) => console.error("[prompt]\n" + prompt + "\n") : undefined;
      const result = await explainDecision(input, { llm, onPrompt });

      if (result.status === "error") {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      if (opts.json) {
        output(result, true);
      } else {
        console.log(result.narrative);
      }
    });

  // audit
  program.command("audit")
    .description("Show a summary of recent guard decisions")
    .option("--since <iso>", "Only include decisions after this ISO timestamp")
    .option("--domain <type>", "Filter by guard domain (e.g., send_email, code_merge)")
    .option("--decision <decision>", "Filter by decision (e.g., BLOCK, ALLOW)")
    .option("--limit <n>", "Maximum number of rows (default: 50)", parseInt)
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { summarizeGuardActivity, formatSummaryTable } = await import("@consensus-tools/core");
      const { JsonStorage } = await import("@consensus-tools/storage");
      const cfg = await loadCliConfig();
      const storagePath = cfg.boards.local.storagePath ?? "./data/local-board.json";
      const storage = new JsonStorage(storagePath);
      await storage.init();

      const summary = await summarizeGuardActivity(storage, {
        since: opts.since,
        domain: opts.domain,
        decision: opts.decision,
        limit: opts.limit,
      });

      if (opts.json) {
        output(summary, true);
      } else {
        console.log(formatSummaryTable(summary));
      }
    });

  return program;
}
