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

## Code Style

- HITL nodes pause; they never block the event loop. Resume must be explicit via `runner.resume()` — no implicit timeouts.
- Defensive `JSON.parse` of LLM-derived strings catches and skips with a one-line comment. LLM outputs are noisy and per-vote skip is the right default — don't escalate parse failures.
- No automatic retry — failed nodes stay failed until explicit resume. Don't add backoff loops here; retry policy belongs to the caller.
- Templates registered imperatively via `registerTemplate()`. No auto-discovery — keep registration explicit so missing templates fail loudly at startup, not at runtime.
- Node executors are dispatched by `node.type`. Unknown types throw — never default-execute. Workflows with unknown nodes are corrupt and should fail fast.
- Cursor checkpoint after every node completion. Never batch updates "for performance" — resumability matters more.
