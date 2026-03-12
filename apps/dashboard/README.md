# @consensus-tools/dashboard

Web dashboard for managing boards, workflows, agents, and audit trails in [consensus-tools](https://github.com/consensus-tools/consensus-tools).

## Tech stack

React 18, Vite, Tailwind CSS, Radix UI, react-router-dom, dnd-kit

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Workflows Dashboard | Create, run, and monitor workflows with drag-and-drop builder |
| `/boards` | Boards | List consensus boards with run counts and status |
| `/boards/:boardId` | Board Detail | Per-run audit tables, participants, decision traces |
| `/boards/run/:runId` | Run Detail | Full event timeline with expandable JSON payloads |
| `/settings` | Settings | Credentials, adapters, and system configuration |

## Features

- Drag-and-drop workflow builder with node palette (trigger, agent, guard, HITL, action)
- Real-time audit event timeline with 3-second polling
- Per-run inline event tables with expandable JSON
- Agent management panel (register, suspend, activate)
- Guard decision visualization (ALLOW/BLOCK/REWRITE/REQUIRE_HUMAN)
- Resizable JSON inspector with copy buttons

## Development

```bash
# Requires a running local-board API server at localhost:9888
pnpm --filter @consensus-tools/local-board dev

# Start the dashboard on port 5000
pnpm --filter @consensus-tools/dashboard dev
```

The Vite dev server proxies `/api` requests to `http://localhost:9888`.

## Build

```bash
pnpm --filter @consensus-tools/dashboard build
# Output: apps/dashboard/dist/
```
