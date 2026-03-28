# @consensus-tools/dashboard

React/Vite web UI for managing boards, workflows, and audit trails. Not published (private).

## Tech Stack

React 18, Vite, Tailwind CSS, Radix UI, dnd-kit (drag-and-drop), Lucide icons, Geist font, react-router-dom.

## Commands

```bash
pnpm --filter @consensus-tools/dashboard dev    # localhost:5000
pnpm --filter @consensus-tools/dashboard build  # production build
pnpm --filter @consensus-tools/dashboard test   # vitest
```

## Routes

- `/` — Workflows dashboard
- `/boards` — Board list
- `/boards/:boardId` — Board detail
- `/boards/run/:runId` — Run detail
- `/settings` — Settings

## Architecture

- Vite proxies `/api` requests to `localhost:9888` (local-board)
- 3s polling for real-time audit event timeline
- Drag-drop workflow builder via dnd-kit
- Guard decisions visualized as ALLOW/BLOCK/REWRITE/REQUIRE_HUMAN
