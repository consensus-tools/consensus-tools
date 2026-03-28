# @consensus-tools/sdk-client

HTTP client for the consensus-tools board API. Full job lifecycle with automatic retry and exponential backoff.

## Key Exports

- `ConsensusToolsClient` — post, claim, submit, vote, resolve jobs; poll status
- `ClientOptions` — baseUrl, accessToken, retry config, timeout

## Gotchas

- Access token (API key) is required for authentication.
- Retry uses exponential backoff — check defaults before overriding.
- No auto-polling for job completion — the caller must poll `getStatus()`.
