# @consensus-tools/secrets

In-memory credential store with AES-256-GCM encryption at rest. Credentials are keyed by `provider` + `keyName` (e.g. `slack` / `bot_token`) and encrypted using a master secret derived via scrypt.

## Install

```bash
pnpm add @consensus-tools/secrets
```

## Basic Usage

```typescript
import { CredentialManager } from "@consensus-tools/secrets";

// Initialize with a master secret (string, derived internally via scrypt)
const creds = new CredentialManager("my-master-secret");

// Store a credential (upsert semantics -- inserts or updates)
const result = creds.upsert("slack", "bot_token", "xoxb-abc-123");
// => { id: "cred_1", provider: "slack", keyName: "bot_token", updated: false }

// Retrieve the decrypted value
const token = creds.get("slack", "bot_token");
// => "xoxb-abc-123"

// List all stored credentials (values are never exposed)
const all = creds.list();
// => [{ provider: "slack", keyName: "bot_token", createdAt: ..., updatedAt: ... }]

// Check which keys exist for a provider
const status = creds.getProviderStatus("slack");
// => { bot_token: true }

// Remove a credential
creds.delete("slack", "bot_token");
```

## Low-Level Encryption

Use `encrypt` and `decrypt` directly when you need to handle ciphertext yourself:

```typescript
import { encrypt, decrypt } from "@consensus-tools/secrets";
import crypto from "node:crypto";

const key = crypto.scryptSync("my-secret", "consensus-tools-salt", 32);
const ciphertext = encrypt("sensitive-value", key); // base64 string (IV + tag + ciphertext)
const plaintext = decrypt(ciphertext, key);          // "sensitive-value"
```

## Exports Reference

| Export | Kind | Description |
|---|---|---|
| `CredentialManager` | Class | In-memory encrypted credential store. Constructor takes a `secret: string`. |
| `encrypt(plaintext, key)` | Function | AES-256-GCM encrypt. Returns base64 string. `key` is a 32-byte `Buffer`. |
| `decrypt(encoded, key)` | Function | AES-256-GCM decrypt. Takes base64 string, returns plaintext. |

### CredentialManager Methods

| Method | Signature | Returns |
|---|---|---|
| `upsert` | `(provider, keyName, value) => { id, provider, keyName, updated }` | Insert or update a credential |
| `get` | `(provider, keyName) => string \| null` | Decrypted value, or `null` if missing/corrupt |
| `list` | `() => Array<{ provider, keyName, createdAt, updatedAt }>` | All credentials (no values) |
| `delete` | `(provider, keyName) => boolean` | `true` if removed |
| `getProviderStatus` | `(provider) => Record<string, boolean>` | Map of keyName to `true` for a provider |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
