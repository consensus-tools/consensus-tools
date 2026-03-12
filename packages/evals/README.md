# @consensus-tools/evals

LLM-based guard evaluation with agent personas for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/evals)](https://www.npmjs.com/package/@consensus-tools/evals)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/evals
```

## What it does

Runs multi-persona AI evaluation against agent actions. Each persona receives the action payload and returns a vote (`YES`, `NO`, or `REWRITE`), a risk score (0.0-1.0), and a rationale. When no LLM API key is configured, the evaluator falls back to deterministic votes with baseline risk scores — no external dependency required.

## Default personas

| Persona | Focus |
|---------|-------|
| **Security Analyst** | Credential exposure, injection attacks, unauthorized access |
| **Compliance Officer** | Regulatory compliance, policy adherence, audit trails |
| **Operations Engineer** | Reliability, blast radius, rollback capability |

## Usage

```typescript
import { evaluateWithAiSdk } from "@consensus-tools/evals";

const votes = await evaluateWithAiSdk({
  action: { type: "code_merge", payload: { files: ["src/auth.ts"], diff: "..." } },
  personaCount: 3,
  model: "gpt-4o-mini", // optional, uses AI SDK
});
// votes → [{ vote: "REWRITE", risk: 0.7, reason: "Touches auth layer" }, ...]
```

### Generate custom personas

```typescript
import { generatePersonas, respawnPersona } from "@consensus-tools/evals";

const personas = generatePersonas({ count: 5, domain: "financial-compliance" });
const replacement = respawnPersona({ replacing: personas[0] });
```

## API

| Export | Description |
|--------|-------------|
| `evaluateWithAiSdk(config)` | Run multi-persona LLM evaluation with deterministic fallback |
| `generatePersonas(options)` | Generate a set of agent personas |
| `respawnPersona(options)` | Replace a persona with a new one |
| `AiEvaluatorConfig` | Configuration type for evaluator |
| `AgentPersona` | Persona type definition |

## How it fits

Tier 1 package. Depends on `@consensus-tools/schemas`. Used by `workflows` (agent nodes) and `mcp` (guard evaluation). LLM SDKs are optional peer dependencies — the package works without them.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
