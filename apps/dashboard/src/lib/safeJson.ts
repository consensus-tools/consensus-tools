/**
 * Safely parses a JSON string, returning a typed fallback value on failure.
 *
 * @param input    - The raw JSON string (or null/undefined).
 * @param fallback - Value returned when input is empty or unparseable.
 * @param context  - Optional label used in dev-mode console warnings.
 * @returns The parsed value cast to T, or `fallback`.
 */

import type { ZodTypeAny, z } from "zod";

// Minimal augmentation so TypeScript recognises import.meta.env.DEV without
// pulling in the full vite/client types (which conflict with workspace Vite v7).
declare global {
  interface ImportMeta {
    readonly env: { readonly DEV: boolean };
  }
}

// Internal override used only by unit tests to simulate DEV/prod mode.
// In production code this is always `undefined` and the real import.meta.env.DEV is used.
let _devOverride: boolean | undefined;

/**
 * @internal – only for unit tests. Becomes a no-op in production builds so the
 * dev-mode override cannot be flipped at runtime by injected/3rd-party code.
 */
export const _setDevForTesting: (value: boolean | undefined) => void =
  import.meta.env.DEV
    ? (value) => { _devOverride = value; }
    : (_value) => { /* no-op in production */ };

function isDevMode(): boolean {
  if (_devOverride !== undefined) return _devOverride;
  return import.meta.env.DEV;
}

export function safeParseJSON<T>(
  input: string | null | undefined,
  fallback: T,
  context?: string,
): T {
  if (input == null || input === "") {
    return fallback;
  }

  try {
    return JSON.parse(input) as T;
  } catch (err) {
    // Log structural metadata only — never the raw content, which can contain
    // tokens, keys, or PII that would leak into DevTools / RUM capture.
    if (isDevMode()) {
      const label = context ? `[${context}] ` : "";
      const len = typeof input === "string" ? input.length : -1;
      console.warn(`safeParseJSON ${label}failed to parse: input length=${len}`);
    }
    return fallback;
  }
}

// ── Tagged-result schema parser ─────────────────────────────────────
// Used by callers that need to distinguish "empty input" (legitimate
// pending state) from "malformed input" (data corruption / drift).
// Wave 2 of the dashboard-zod-trust-boundary plan: schema validation at
// the trust boundary instead of ad-hoc shape checks scattered across
// components.

export type TypedParseResult<T> =
  | { status: "empty" }
  | { status: "invalid"; reason: string }
  | { status: "ok"; value: T };

/**
 * Parses a JSON string and validates the result against a Zod schema.
 *
 * Returns a discriminated union so callers must explicitly handle each
 * outcome — TypeScript's exhaustive switch catches missed cases at
 * compile time, closing the silent-fallback class of bugs.
 *
 * - `status: "empty"` — `null`, `undefined`, `""`, or all-whitespace input.
 *   Legitimate "decision pending" / "no metadata yet" state.
 * - `status: "invalid"` — `JSON.parse` threw, or the schema rejected the
 *   parsed value. Data corruption or producer drift; UI should render an
 *   explicit malformed-event placeholder rather than skip silently.
 * - `status: "ok"` — Validated and normalized to canonical shape via
 *   schema's `.transform()` (when defined).
 */
export function parseTypedPayload<S extends ZodTypeAny>(
  input: string | null | undefined,
  schema: S,
  context?: string,
): TypedParseResult<z.output<S>> {
  if (input == null) return { status: "empty" };
  if (typeof input === "string" && input.trim() === "") return { status: "empty" };

  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    if (isDevMode()) {
      const label = context ? `[${context}] ` : "";
      const len = input.length;
      console.warn(`parseTypedPayload ${label}JSON parse failed: input length=${len}`);
    }
    return { status: "invalid", reason: "JSON parse failed" };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    if (isDevMode()) {
      const label = context ? `[${context}] ` : "";
      const len = input.length;
      console.warn(`parseTypedPayload ${label}schema rejected: input length=${len}`);
    }
    return { status: "invalid", reason: "schema validation failed" };
  }
  return { status: "ok", value: result.data };
}
