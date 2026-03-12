# @consensus-tools/evals

AI-powered evaluation using Claude SDK with persona-based generation.

## Install

```bash
pnpm add @consensus-tools/evals
```

## Usage

```typescript
import { evaluateWithAiSdk, generatePersonas } from "@consensus-tools/evals";

// Generate diverse evaluator personas
const personas = await generatePersonas({ count: 3 });

// Run AI evaluation
const result = await evaluateWithAiSdk({
  model: "claude-sonnet-4-20250514",
  prompt: "Evaluate this submission...",
});
```

## What's included

- **AI evaluation** — `evaluateWithAiSdk`, `AiEvaluatorConfig`
- **Persona generation** — `generatePersonas`, `respawnPersona`, `AgentPersona`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
