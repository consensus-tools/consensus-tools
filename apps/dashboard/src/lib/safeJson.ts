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

/** @internal – only for unit tests */
export function _setDevForTesting(value: boolean | undefined): void {
  _devOverride = value;
}

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
    // Suppress the warning entirely in production; show a helpful snippet in dev.
    if (isDevMode()) {
      const snippet = input.slice(0, 80);
      const label = context ? `[${context}] ` : "";
      console.warn(`safeParseJSON ${label}failed to parse: ${snippet}`);
    }
    return fallback;
  }
}
