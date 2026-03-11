# @consensus-tools/wrapper

Runtime decision firewall — wraps any function with consensus gates. Part of [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/wrapper)](https://www.npmjs.com/package/@consensus-tools/wrapper)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/wrapper
```

## Usage

```typescript
import { consensus } from "@consensus-tools/wrapper";

const safeSend = consensus(sendEmail, {
  reviewers: [humanReviewer, aiSafetyReviewer],
  strategy: { mode: "unanimous" },
  hooks: {
    onBlock: (ctx) => console.log("Blocked:", ctx.reason),
  },
});

const result = await safeSend({ to: "user@example.com", body: "Hello" });
```

## Key Exports

- **`consensus(fn, options)`** — wraps any async function with reviewer-based consensus
- **`aggregateScores()`** — strategy aggregation (unanimous, majority, threshold)
- Types: `ConsensusOptions`, `ReviewerFn`, `ReviewContext`, `ReviewResult`, `Strategy`, `DecisionResult`, `LifecycleHooks`

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
