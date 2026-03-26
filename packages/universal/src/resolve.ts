import type { ToolExecutor, Wrappable } from "./types.js";

/**
 * Resolves a Wrappable into a plain ToolExecutor function.
 *
 * Resolution order: direct function > .execute > .invoke > .call
 * First match wins.
 */
export function resolveWrappable(wrappable: Wrappable): ToolExecutor {
  if (typeof wrappable === "function") {
    return wrappable;
  }

  if (typeof wrappable === "object" && wrappable !== null) {
    if ("execute" in wrappable && typeof wrappable.execute === "function") {
      return wrappable.execute.bind(wrappable);
    }
    if ("invoke" in wrappable && typeof wrappable.invoke === "function") {
      return wrappable.invoke.bind(wrappable);
    }
    if ("call" in wrappable && typeof wrappable.call === "function") {
      return wrappable.call.bind(wrappable);
    }
  }

  throw new TypeError(
    "Expected a Wrappable: a function, or an object with .execute(), .invoke(), or .call() method. " +
    `Received: ${typeof wrappable}`,
  );
}
