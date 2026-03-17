# @consensus-tools/dashboard

Manage consensus boards, build workflows, and inspect audit trails from a web UI. Connects to a running local-board API server and provides real-time visibility into jobs, guard decisions, and agent activity.

## Quick start

```bash
# 1. Start the API server (required)
pnpm --filter @consensus-tools/local-board dev

# 2. Start the dashboard
pnpm --filter @consensus-tools/dashboard dev
```

Open `http://localhost:5000`. The Vite dev server proxies `/api` requests to the local-board at `localhost:9888`.

## Pages

| Route                    | Page               | What you can do                                          |
|--------------------------|--------------------|----------------------------------------------------------|
| `/`                      | Workflows          | Build, run, and monitor DAG workflows with drag-and-drop |
| `/boards`                | Boards             | Browse consensus boards with run counts and status        |
| `/boards/:boardId`       | Board Detail       | Inspect per-run audit tables, participants, decisions     |
| `/boards/run/:runId`     | Run Detail         | View full event timeline with expandable JSON payloads   |
| `/settings`              | Settings           | Configure credentials, adapters, and system options      |

Routes under `/local-board/` mirror the `/boards/` routes for backward compatibility.

## Features

- Drag-and-drop workflow builder with a node palette (trigger, agent, guard, HITL, action)
- Real-time audit event timeline with 3-second polling
- Per-run inline event tables with expandable JSON payloads
- Agent management panel (register, suspend, activate)
- Guard decision visualization showing ALLOW, BLOCK, REWRITE, and REQUIRE_HUMAN outcomes
- Resizable JSON inspector with copy-to-clipboard

## Tech stack

React 18, Vite, Tailwind CSS, Radix UI, react-router-dom, dnd-kit, Lucide icons, Geist font.

## Scripts

```bash
pnpm --filter @consensus-tools/dashboard dev          # Dev server on port 5000
pnpm --filter @consensus-tools/dashboard build        # Production build to dist/
pnpm --filter @consensus-tools/dashboard typecheck     # Type-check without emit
pnpm --filter @consensus-tools/dashboard test          # Run vitest
```

## Build output

```bash
pnpm --filter @consensus-tools/dashboard build
# Static files written to apps/dashboard/dist/
```

Serve the `dist/` directory with any static file server. API requests must be proxied to the local-board server.
