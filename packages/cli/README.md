# @consensus-tools/cli

CLI for [consensus-tools](https://github.com/consensus-tools/consensus-tools) — init, manage jobs, view traces.

[![npm](https://img.shields.io/npm/v/@consensus-tools/cli)](https://www.npmjs.com/package/@consensus-tools/cli)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add -g @consensus-tools/cli
```

## Usage

```bash
consensus-tools init
consensus-tools board use local
consensus-tools jobs post --title "Review content" --reward 10
consensus-tools jobs list
consensus-tools submissions create <jobId> --summary "Result"
consensus-tools votes cast <jobId> --submission <subId>
consensus-tools resolve <jobId>
```

## Key Exports

For programmatic use:

- **`buildProgram()`** — creates the Commander.js CLI program
- **`loadCliConfig()` / `saveCliConfig()`** — config management
- **`renderTable()`** — table rendering utility

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
