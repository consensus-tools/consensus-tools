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

  constructor(packageName: string) {
    super(
      `Package "${packageName}" is required but not installed. ` +
      `Install it with: pnpm add ${packageName}`,
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
