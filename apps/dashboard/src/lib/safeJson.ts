/**
 * Safely parses a JSON string, returning a typed fallback value on failure.
 *
 * @param input    - The raw JSON string (or null/undefined).
 * @param fallback - Value returned when input is empty or unparseable.
 * @param context  - Optional label used in dev-mode console warnings.
 * @returns The parsed value cast to T, or `fallback`.
 */

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
