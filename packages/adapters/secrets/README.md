# @consensus-tools/secrets

AES-256-GCM credential encryption and storage for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/secrets)](https://www.npmjs.com/package/@consensus-tools/secrets)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/secrets
```

## What it does

Manages encrypted credentials for platform integrations (Slack tokens, GitHub secrets, Linear API keys). Credentials are encrypted at rest using AES-256-GCM and stored in a local file. The `CredentialManager` provides get/set/delete/list operations used by notification adapters, webhook handlers, and integration clients.

## Usage

```typescript
import { CredentialManager } from "@consensus-tools/secrets";

const manager = new CredentialManager({
  storagePath: "./.data/credentials.json",
  encryptionKey: process.env.CREDENTIAL_KEY,
});

await manager.set("slack.bot_token", "xoxb-...");
const token = await manager.get("slack.bot_token");
await manager.delete("slack.bot_token");
const keys = await manager.list(); // ["slack.bot_token", ...]
```

## API

| Export | Description |
|--------|-------------|
| `CredentialManager` | Encrypted credential store with get/set/delete/list |
| `encrypt(plaintext, key)` | AES-256-GCM encryption |
| `decrypt(ciphertext, key)` | AES-256-GCM decryption |

## How it fits

Tier 0 package. Zero internal dependencies. Used by `sdk-node` (credential management endpoints) and `local-board` (server initialization).

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
