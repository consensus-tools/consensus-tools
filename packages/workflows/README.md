# @consensus-tools/workflows

DAG-based workflow engine with checkpoint execution, HITL pause/resume, and cron scheduling for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/workflows)](https://www.npmjs.com/package/@consensus-tools/workflows)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/workflows
```

## What it does

Workflows orchestrate multi-step agent processes as directed acyclic graphs. Each node in the graph represents a discrete operation — triggering an event, running an agent evaluation, checking a guard, waiting for human approval, or executing an action. The runner persists execution state after each node, so workflows survive restarts and can pause indefinitely at HITL nodes.

## Node types

| Node | Role |
|------|------|
| `trigger` | Entry point — initiates the workflow (webhook, cron, manual) |
| `agent` | Runs AI evaluation with configurable personas and model |
| `group` | Runs multiple agents in parallel, collects results |
| `guard` | Evaluates an action through the guard engine with risk scoring |
| `hitl` | Pauses execution until a human approves, rejects, or rewrites |
| `action` | Executes a side effect (API call, notification, integration) |

## Usage

```typescript
import { WorkflowRunner } from "@consensus-tools/workflows";

const runner = new WorkflowRunner({
  storage,
  nodeExecutor,
});

// Create a workflow
const workflow = await runner.createWorkflow({
  name: "PR Review Guard",
  definition: {
    nodes: [
      { id: "trigger", type: "trigger", config: { source: "github" } },
      { id: "review", type: "group", config: { agentCount: 3, persona: "code-reviewer" } },
      { id: "guard", type: "guard", config: { guardType: "code_merge", quorum: 0.7 } },
      { id: "approve", type: "hitl", config: { channel: "slack", timeoutSec: 300 } },
    ],
    edges: [
      { from: "trigger", to: "review" },
      { from: "review", to: "guard" },
      { from: "guard", to: "approve" },
    ],
  },
});

// Run it
const run = await runner.run(workflow.id, { pr: { number: 42 } });

// Resume after human approval
await runner.resume(workflow.id, run.runId, "YES", "reviewer@company.com");
```

## Built-in templates

| Template | Description |
|----------|-------------|
| `prMergeGuardTemplate` | GitHub PR review with multi-agent evaluation, guard gate, and Slack approval |
| `linearTaskDecompTemplate` | Decompose a Linear task into subtasks via consensus |
| `cronAutoAssignTemplate` | Periodically assign unassigned work items via multi-agent voting |

Access templates:

```typescript
import { listTemplates, getTemplateById } from "@consensus-tools/workflows";

const templates = listTemplates(); // all available templates
const template = getTemplateById("pr-merge-guard");
```

## Cron scheduling

```typescript
import { CronScheduler, shouldRunNow } from "@consensus-tools/workflows";

const scheduler = new CronScheduler({ storage, workflowRunner });

// Register a schedule (5-field cron: minute hour dom month dow)
await scheduler.register({
  workflowId: "wf_123",
  cron: "*/15 * * * *", // every 15 minutes
});

// Check and execute due schedules
await scheduler.tick();
```

## API

| Export | Description |
|--------|-------------|
| `WorkflowRunner` | Checkpoint-based workflow orchestrator with create/run/resume/list |
| `NodeExecutor` | Executes individual workflow nodes with dependency injection |
| `validateWorkflowDefinition(def)` | Validates node types, edges, and configuration |
| `CronScheduler` | Cron-based workflow scheduling with tick loop |
| `shouldRunNow(cron, now)` | Check if a cron expression matches current time |
| `prMergeGuardTemplate` | PR merge review template |
| `linearTaskDecompTemplate` | Linear task decomposition template |
| `cronAutoAssignTemplate` | Cron auto-assignment template |
| `listTemplates()` | List all available workflow templates |
| `getTemplateById(id)` | Get a template by ID |

## How it fits

Tier 3 package. Depends on `core`, `guards`, `evals`, and `integrations`. Used by `sdk-node` and `mcp` for workflow execution.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
