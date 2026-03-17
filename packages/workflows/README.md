# @consensus-tools/workflows

Define multi-step workflows with node-graph execution, checkpoint persistence, human-in-the-loop pauses, and cron scheduling.

## Install

```bash
pnpm add @consensus-tools/workflows
```

## Quick Start -- WorkflowRunner

```typescript
import { WorkflowRunner } from "@consensus-tools/workflows";
import { createStorage } from "@consensus-tools/core";

const storage = await createStorage(config);
const runner = new WorkflowRunner(storage);

// Create and run a workflow
const workflow = await runner.createWorkflow("My Review", {
  nodes: [
    { id: "trigger", type: "trigger", label: "Start", config: { source: "manual" } },
    { id: "guard", type: "guard", label: "Code Guard", config: { guardType: "code_merge" } },
    { id: "approve", type: "hitl", label: "Human Approval", config: { channel: "slack" } },
    { id: "merge", type: "action", label: "Merge", config: { action: "github.merge_pr" } },
  ],
});

const run = await runner.run(workflow.id);
// run.status => "completed" | "waiting" | "failed"

// Resume after human approval
const resumed = await runner.resume(workflow.id, run.runId, "approved", "alice");
```

## Templates -- Pre-built Workflows

```typescript
import { WorkflowRunner, prMergeGuardTemplate, listTemplates, getTemplateById } from "@consensus-tools/workflows";

// Register a built-in template
const runner = new WorkflowRunner(storage);
runner.registerTemplate(prMergeGuardTemplate);

// List all template definitions
const templates = listTemplates();
// => [{ id: "template-github-pr", name: "Template 1 - GitHub PR Merge Guard", ... }, ...]

const tmpl = getTemplateById("template-linear-tasks");
```

Three built-in templates:

| Template | ID | Description |
|---|---|---|
| PR Merge Guard | `template-github-pr` | GitHub PR -> parallel agent review -> guard -> human approval -> merge |
| Linear Task Decomposition | `template-linear-tasks` | Linear task -> agent decomposition -> guard -> human approval -> create subtasks |
| Cron Auto-Assign | `template-linear-assign` | Cron -> fetch unassigned subtasks -> parallel review -> guard -> assign |

## NodeExecutor -- Graph-based Execution

```typescript
import { NodeExecutor, validateWorkflowDefinition } from "@consensus-tools/workflows";

const validation = validateWorkflowDefinition(definition);
if (!validation.valid) console.error(validation.errors);

const executor = new NodeExecutor(deps); // deps: { engine, guardEngine, storage, ... }
const output = await executor.execute(node, context, { boardId, runId, workflowId });
```

Node types: `trigger`, `agent`, `group` (parallel), `guard`, `hitl`, `action`.

## CronScheduler

```typescript
import { CronScheduler, shouldRunNow } from "@consensus-tools/workflows";

const cron = new CronScheduler(storage, async (workflowId) => {
  await runner.run(workflowId);
});

await cron.register(workflow.id, "*/30 * * * *"); // every 30 minutes
cron.start();

// Check manually
shouldRunNow("0 9 * * 1"); // true if it's 9:00 on Monday

await cron.list();
await cron.unregister(workflow.id);
cron.stop();
```

## Exports

| Export | Description |
|---|---|
| `WorkflowRunner` | Create, run, resume workflows with checkpoint persistence |
| `NodeExecutor` | Execute individual nodes in a workflow graph |
| `validateWorkflowDefinition` | Validate a workflow definition before execution |
| `CronScheduler` | IStorage-backed cron scheduling with dedup |
| `shouldRunNow(expr)` | Check if a 5-field cron expression matches now |
| `prMergeGuardTemplate` | Template: GitHub PR merge guard |
| `linearTaskDecompTemplate` | Template: Linear task decomposition |
| `cronAutoAssignTemplate` | Template: Cron auto-assign subtasks |
| `listTemplates()` / `getTemplateById(id)` | Discover built-in templates |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
