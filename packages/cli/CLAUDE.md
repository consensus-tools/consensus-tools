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
