# @consensus-tools/secrets

AES-256-GCM credential encryption with scrypt key derivation. Uses only Node.js built-in `crypto` module.

## Key Exports

- `CredentialManager` — upsert, get, list, delete credentials keyed by `provider:keyName`
- `encrypt(plaintext, key)` / `decrypt(ciphertext, key)` — low-level crypto

## Gotchas

- In-memory only — credentials are lost on process exit. No built-in persistence layer.
- Changing the master secret loses all previously encrypted values (scrypt-derived keys change).
- Random IV per encryption — same plaintext produces different ciphertexts.
