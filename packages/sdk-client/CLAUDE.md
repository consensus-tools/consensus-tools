# @consensus-tools/sdk-client

HTTP client for the consensus-tools board API. Full job lifecycle with automatic retry and exponential backoff.

## Key Exports

- `ConsensusToolsClient` — post, claim, submit, vote, resolve jobs; poll status
- `ClientOptions` — baseUrl, accessToken, retry config, timeout

## Gotchas

- Access token (API key) is required for authentication.
- Retry uses exponential backoff — check defaults before overriding.
- No auto-polling for job completion — the caller must poll `getStatus()`.

## Code Style

- Retries use exponential backoff with jitter — configured **once** in `ClientOptions`. Don't roll custom retry loops around individual calls.
- Auth token is required at construction. Throw `ConfigError` at construction time, not on first call — fail fast on misconfiguration.
- No background polling. `getStatus()` is the only mechanism; the caller owns the cadence. Surprise timers are surprise resource leaks.
- HTTP errors carry the response body on `.cause` so callers can inspect server responses. Don't pre-parse or strip — preserve full fidelity.
- Idempotency keys: when the caller provides one, propagate it. Never auto-generate one inside the client — repeat calls would dedupe unexpectedly.
- Timeouts are AbortController-based. Always abort the underlying fetch on timeout — don't leave dangling sockets.
