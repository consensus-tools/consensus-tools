# @consensus-tools/secrets

Credential encryption and management for consensus-tools — AES-256-GCM at rest.

## Install

```bash
pnpm add @consensus-tools/secrets
```

## Usage

```typescript
import { CredentialManager } from "@consensus-tools/secrets";

const manager = new CredentialManager({ masterKey });

// Store and retrieve encrypted credentials
await manager.set("slack-token", "xoxb-...");
const token = await manager.get("slack-token");
```

## What's included

- **`CredentialManager`** — key-value credential store with encryption at rest
- **`encrypt` / `decrypt`** — low-level AES-256-GCM utilities

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
