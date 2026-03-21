/**
 * Wrapper Demo — LLM Output Safety Gate
 *
 * Demonstrates using createGuardTemplate + createWrapperTemplate to gate
 * an LLM response function with consensus-based safety review.
 *
 * Run: tsx src/index.ts
 */
import { createGuardTemplate } from "@consensus-tools/guards";
import { createWrapperTemplate } from "@consensus-tools/wrapper";

// ── 1. Define a guard template for content safety ──

const safetyGuard = createGuardTemplate("content_safety", {
  description: "Checks LLM output for PII, profanity, and disallowed content",
  rules: (payload) => {
    const text = String(payload["value"] || payload["text"] || "");

    // PII patterns
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
      return [{ evaluator: "content-safety", vote: "NO", reason: "SSN pattern detected", risk: 0.95 }];
    }

    // Profanity
    if (/(damn|shit|fuck)/i.test(text)) {
      return [{ evaluator: "content-safety", vote: "REWRITE", reason: "Profanity detected", risk: 0.6 }];
    }

    return [{ evaluator: "content-safety", vote: "YES", reason: "Content is clean", risk: 0.1 }];
  },
  hardBlockPatterns: [/password\s*[:=]/i, /api[_-]?key\s*[:=]/i],
});

// ── 2. Define a relevance reviewer (simple score function) ──

function relevanceReviewer(output: string) {
  const score = output.length > 10 ? 0.8 : 0.3;
  return { score, rationale: output.length > 10 ? "Response has substance" : "Response too short" };
}

// ── 3. Create a wrapper template combining both reviewers ──

const safeResponse = createWrapperTemplate<string>("safe_llm_response", {
  reviewers: [
    safetyGuard.asReviewer(),  // Guard template as reviewer
    relevanceReviewer,          // Simple score function
  ],
  strategy: { strategy: "unanimous", threshold: 0.5 },
  maxRetries: 0,
  hooks: {
    afterResolve: (result) => {
      console.log(`  ✓ Decision: ${result.action} (score: ${result.aggregateScore.toFixed(2)})`);
    },
    onBlock: (result) => {
      console.log(`  ✗ BLOCKED: ${result.scores.map(s => s.rationale).join(", ")}`);
    },
    onEscalate: (result) => {
      console.log(`  ⚠ ESCALATED: score ${result.aggregateScore.toFixed(2)} below threshold`);
    },
  },
});

// ── 4. Simulate LLM responses ──

async function simulateLLM(prompt: string): Promise<string> {
  // Simulate different responses based on prompt
  const responses: Record<string, string> = {
    "greeting": "Hello! How can I help you today? I'm here to assist with any questions.",
    "pii": "Sure! Your SSN is 123-45-6789 and your account number is 987654321.",
    "profanity": "What the damn hell are you talking about?",
    "secret": "Here's the api_key: sk-abc123xyz",
    "short": "OK",
  };
  return responses[prompt] || "I don't understand that prompt.";
}

// ── 5. Run the demo ──

const safeLLM = safeResponse.wrap(simulateLLM);

console.log("=== Wrapper Demo: LLM Output Safety Gate ===\n");

const testCases = [
  { prompt: "greeting", expected: "allow" },
  { prompt: "pii", expected: "block" },
  { prompt: "profanity", expected: "escalate" },
  { prompt: "secret", expected: "block" },
  { prompt: "short", expected: "escalate" },
];

for (const { prompt, expected } of testCases) {
  console.log(`Prompt: "${prompt}" (expected: ${expected})`);
  const result = await safeLLM(prompt);
  console.log(`  Output: ${result.output ? `"${result.output.slice(0, 60)}..."` : "(blocked)"}`);
  console.log(`  Scores: ${result.scores.map(s => `${s.score.toFixed(2)}${s.block ? ' [BLOCK]' : ''}`).join(", ")}`);
  console.log();
}
