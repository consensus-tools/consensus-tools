# @consensus-tools/workflows

Workflow execution engine with templates and cron scheduling for consensus-tools.

## Install

```bash
pnpm add @consensus-tools/workflows
```

## Usage

```typescript
import { WorkflowRunner, CronScheduler, listTemplates } from "@consensus-tools/workflows";

// List built-in workflow templates
const templates = listTemplates();

// Execute workflow nodes
import { NodeExecutor, validateWorkflowDefinition } from "@consensus-tools/workflows";
```

## What's included

- **Runner** — `WorkflowRunner`, `WorkflowTemplate`, `WorkflowStepHandler`
- **Node execution** — `NodeExecutor`, `validateWorkflowDefinition`
- **Scheduling** — `CronScheduler`, `shouldRunNow`
- **Built-in templates** — `prMergeGuardTemplate`, `linearTaskDecompTemplate`, `cronAutoAssignTemplate`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
