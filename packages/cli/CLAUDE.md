# @consensus-tools/cli

CLI for managing consensus jobs, boards, guard playground, and configuration.

## Command Groups

- **config:** get/set configuration
- **board:** local or remote board management
- **jobs:** post, list, get, claim, submit, vote, resolve
- **traces:** view and export traces
- **playground:** evaluate canned guard scenarios

## Key Exports

- `buildProgram()` — returns Commander program with all commands
- `loadCliConfig()` / `saveCliConfig()` — config file I/O
- `renderTable()` — aligned table output

## Architecture

- Commander.js-based
- Board modes: local (in-process) or remote (HTTP via sdk-client)
- Agent ID resolved from: env `CONSENSUS_AGENT_ID` → config → `user@hostname` default
- `scenarios/` directory contains canned JSON fixtures for playground evaluation

## Gotchas

- Remote board requires `CONSENSUS_API_KEY` in environment.
- CLI options override env vars, which override config file.
- `scenarios/` are published with the package as example data, not config.

## Code Style

- Commander program built via `buildProgram()` returning a fresh instance. **Never share state via module-level singletons** — tests need clean programs, and singletons leak between invocations.
- Config precedence is fixed: CLI flags > env vars > config file. Document any deviation; never silently merge in unexpected directions.
- All table output goes through `renderTable()`. Don't roll new formatters per command — output drift is a UX regression even when the data is right.
- Errors exit with a non-zero status code AND a stderr message. Stdout stays parsable for callers who pipe into `jq` or `grep`.
- Long-running commands (job posts, polls) print progress to stderr. Stdout is the result; stderr is the chatter.
- `scenarios/` is example data published with the package — don't import from it for runtime config or default values.
