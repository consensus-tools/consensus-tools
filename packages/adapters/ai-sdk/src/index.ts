// @consensus-tools/ai-sdk
// Vercel AI SDK adapter: guard middleware for generateText/streamText.

export {
  createGuardedGenerate,
  type GuardedGenerateOptions,
  type GuardedResult,
} from "./middleware.js";

export {
  createGuardedStream,
  type GuardedStreamOptions,
  type GuardedStreamResult,
  type StreamGuardDecision,
} from "./stream.js";
