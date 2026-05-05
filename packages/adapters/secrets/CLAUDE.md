# @consensus-tools/secrets

AES-256-GCM credential encryption with scrypt key derivation. Uses only Node.js built-in `crypto` module.

## Key Exports

- `CredentialManager` — upsert, get, list, delete credentials keyed by `provider:keyName`
- `encrypt(plaintext, key)` / `decrypt(ciphertext, key)` — low-level crypto

## Gotchas

- In-memory only — credentials are lost on process exit. No built-in persistence layer.
- Changing the master secret loses all previously encrypted values (scrypt-derived keys change).
- Scrypt salt is hardcoded to `"consensus-tools-salt"` — all installations share the same salt.
- Random IV per encryption — same plaintext produces different ciphertexts.

## Code Style

- `decrypt` failures in `get()` log via `console.warn` and return null. Silent null is dangerous when the master secret is wrong vs the entry is missing — operators need the breadcrumb.
- Never reuse an IV. The `encrypt()` function must always generate a fresh random IV. Reusing IVs with AES-GCM breaks confidentiality.
- All credentials are in-memory only by design. Don't add disk persistence here; that belongs in a storage backend with its own at-rest encryption strategy.
- Master secret comparison uses `crypto.timingSafeEqual` — never `===` on secret-derived values.
- New credentials APIs must not log the plaintext or the encrypted blob. Log identifiers (`provider:keyName`), never material.
