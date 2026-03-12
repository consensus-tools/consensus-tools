# Migration Guide: v0.2.0 → Monorepo

This guide covers migrating from `@consensus-tools/consensus-tools@0.2.0` (the monolithic single-package release) to the new monorepo structure.

## What Changed

The monolithic package has been split into 10 focused packages:

| Old Import | New Package |
|------------|-------------|
| `consensus-tools` (default export) | `@consensus-tools/openclaw` |
| `consensus-tools/src/types` | `@consensus-tools/schemas` |
| `consensus-tools/src/jobs/engine` | `@consensus-tools/core` |
| `consensus-tools/src/jobs/consensus` | `@consensus-tools/core` (resolve) or `@consensus-tools/policies` |
| `consensus-tools/src/ledger/*` | `@consensus-tools/core` (ledger) |
| `consensus-tools/src/storage/*` | `@consensus-tools/core` (storage) |
| `consensus-tools/src/network/client` | `@consensus-tools/sdk-client` |
| `consensus-tools/src/network/server` | `@consensus-tools/sdk-node` |
| `consensus-tools/src/cli` | `@consensus-tools/cli` |

## Import Changes

### Types

```diff
- import type { Job, Submission, Vote } from 'consensus-tools/src/types';
+ import type { Job, Submission, Vote } from '@consensus-tools/schemas';
```

### Engine

```diff
- import { JobEngine } from 'consensus-tools/src/jobs/engine';
- import { LedgerEngine } from 'consensus-tools/src/ledger/ledger';
+ import { JobEngine, LedgerEngine } from '@consensus-tools/core';
```

### Storage

```diff
- import { createStorage } from 'consensus-tools/src/storage/IStorage';
+ import { createStorage } from '@consensus-tools/core';
```

### Policies

Policies are now individual modules instead of one monolithic `resolveConsensus()`:

```diff
- import { resolveConsensus } from 'consensus-tools/src/jobs/consensus';
+ import { createRegistryResolver } from '@consensus-tools/policies';
+ const resolver = createRegistryResolver();
```

Or use individual policies:

```ts
import { approvalVote } from '@consensus-tools/policies';
const result = approvalVote(input);
```

### Client

```diff
- import { ConsensusToolsClient } from 'consensus-tools/src/network/client';
- const client = new ConsensusToolsClient(url, token);
+ import { ConsensusToolsClient } from '@consensus-tools/sdk-client';
+ const client = new ConsensusToolsClient({ baseUrl: url, accessToken: token });
```

### OpenClaw Plugin

The plugin registration is unchanged:

```diff
- import register from 'consensus-tools';
+ import { register } from '@consensus-tools/openclaw';
```

## Key API Changes

### JobEngine Constructor

The `JobEngine` constructor now accepts an optional `PolicyResolver` parameter:

```diff
- const engine = new JobEngine(storage, ledger, config, logger);
+ import { createRegistryResolver } from '@consensus-tools/policies';
+ const resolver = createRegistryResolver();
+ const engine = new JobEngine(storage, ledger, config, logger, resolver);
```

### Config Validation

Config validation no longer uses AJV. The config schema is now a Zod schema in `@consensus-tools/schemas`:

```diff
- import Ajv from 'ajv';
- import { configSchema } from 'consensus-tools/src/config';
+ import { consensusToolsConfigSchema } from '@consensus-tools/schemas';
+ const result = consensusToolsConfigSchema.safeParse(rawConfig);
```

### LocalBoard (New)

A new convenience class bundles engine + ledger + storage:

```ts
import { LocalBoard, createStorage } from '@consensus-tools/core';

const storage = createStorage(config);
const board = new LocalBoard(storage, config);
await board.init();

const job = await board.postJob('agent-1', { title: 'Review PR', description: '...' });
```

## Deprecation

The `@consensus-tools/consensus-tools@0.2.0` package is deprecated. It will not receive further updates. Use the new scoped packages instead.
