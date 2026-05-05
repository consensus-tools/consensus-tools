/**
 * Thrown when consensus blocks an action and failPolicy is 'closed'.
 */
export class ConsensusBlockedError extends Error {
  override name = "ConsensusBlockedError";

  constructor(message: string, public readonly cause?: Error) {
    super(message);
  }
}

/**
 * Thrown when an optional adapter package is not installed.
 */
export class MissingDependencyError extends Error {
  override name = "MissingDependencyError";

  constructor(packageName: string, options?: { cause?: unknown }) {
    super(
      `Package "${packageName}" is required but not installed. ` +
      `Install it with: pnpm add ${packageName}`,
      options,
    );
  }
}

/**
 * Thrown when an optional adapter package is installed but fails to load.
 * Distinct from MissingDependencyError — the package exists but its module
 * threw during import (corrupt build, version mismatch, top-level error,
 * permission issue). Inspect `err.cause` for the underlying error.
 */
export class AdapterLoadError extends Error {
  override name = "AdapterLoadError";

  constructor(packageName: string, options?: { cause?: unknown }) {
    super(
      `Package "${packageName}" failed to load. ` +
      `It is installed but threw during import (corrupt build, version mismatch, ` +
      `or top-level error). Inspect err.cause for the underlying error.`,
      options,
    );
  }
}

/**
 * Thrown when an optional adapter package loads but does not expose the
 * expected export. Usually indicates a version mismatch between this package
 * and the installed adapter.
 */
export class AdapterExportError extends Error {
  override name = "AdapterExportError";

  constructor(packageName: string, exportName: string) {
    super(
      `Package "${packageName}" does not export "${exportName}". ` +
      `Check that the installed version is compatible.`,
    );
  }
}

/**
 * Thrown for invalid configuration values.
 */
export class ConfigError extends Error {
  override name = "ConfigError";

  constructor(message: string) {
    super(message);
  }
}
