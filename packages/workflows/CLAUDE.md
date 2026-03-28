# @consensus-tools/workflows

Workflow execution engine: node-graph DAG, checkpoint persistence, human-in-the-loop pauses, cron scheduling.

## Key Exports

- `WorkflowRunner` — create, execute, resume workflows
- `NodeExecutor` — execute individual workflow nodes
- `CronScheduler` — manage cron-triggered workflows
- `validateWorkflowDefinition()` — schema validation of workflow DAG
- Templates: `prMergeGuardTemplate`, `linearTaskDecompTemplate`, `cronAutoAssignTemplate`

## Architecture

- Workflow = DAG of nodes. Node types: trigger, guard, hitl, action.
- Progress tracked via cursor Map in storage (checkpointed, resumable).
- Templates must be registered imperatively via `WorkflowRunner.registerTemplate()`.

## Gotchas

- HITL nodes pause on `waiting` status — `resume()` must provide decision + userId.
- No automatic retry on failed nodes — explicit resume required.
- Node execution is sequential within a single workflow run (no parallel nodes).
- Templates are not auto-discovered.
- CronScheduler is basic — external cron runner needed for production.
