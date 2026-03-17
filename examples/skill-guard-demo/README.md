# example-skill-guard-demo

Run multiple AI agents through a consensus loop that iteratively improves SKILL.md files. Each round, one agent proposes changes, the others vote as guards, an LLM judge scores quality, and reputation is settled based on accuracy. Accepted improvements are written back to disk.

## Quick start

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run the default demo (3 rounds, browse + qa skills)
pnpm --filter example-skill-guard-demo demo

# Quick single-round test
pnpm --filter example-skill-guard-demo demo:quick

# Dry run with mock data (no API calls)
pnpm --filter example-skill-guard-demo demo:dry
```

## How it works

Each round follows a 7-step pipeline:

1. **Propose** -- A rotating agent generates a SKILL.md improvement using an LLM.
2. **Guard vote** -- All other agents evaluate the proposal and vote YES, NO, or REWRITE with a risk score.
3. **Consensus decision** -- Votes are aggregated using `@consensus-tools/guards` with quorum (60%) and risk threshold (0.5) policies.
4. **Rewrite loop** -- If the decision is REWRITE, the proposer revises based on guard feedback (up to `--max-rewrites` cycles).
5. **LLM-as-judge scoring** -- An independent judge scores the proposal on clarity, completeness, and actionability (1-5 each).
6. **Reputation settlement** -- Guards gain or lose reputation based on whether their vote aligned with the judge. Proposers earn +5 for accepted work or lose -8 after exhausting rewrites.
7. **Write or reject** -- The proposal is written to disk only if it passes guards, passes the judge (all scores >= 4), and improves over the baseline by >= 0.3 points.

## CLI flags

| Flag              | Default               | Description                                |
|-------------------|-----------------------|--------------------------------------------|
| `--rounds`        | `3`                   | Number of proposal rounds per skill        |
| `--skills`        | `browse,qa`           | Comma-separated skill names to improve     |
| `--max-rewrites`  | `2`                   | Max rewrite attempts per round             |
| `--model`         | `claude-sonnet-4-6`   | Anthropic model ID                         |
| `--dry-run`       | off                   | Use mock data, no API calls                |

## Agents

Five specialized guard agents participate in every round:

| Agent                | Role         | Focus                                          |
|----------------------|--------------|-------------------------------------------------|
| Doc Architect        | structure    | Heading hierarchy, information flow, progressive disclosure |
| API Accuracy Checker | accuracy     | Command correctness, argument docs, defaults    |
| Agent Usability Tester | usability  | Zero-guess invocations, unambiguous instructions |
| Completeness Auditor | completeness | Missing commands, edge cases, error handling    |
| Style Guardian       | style        | Formatting consistency, markdown quality        |

Each agent starts with 100 reputation. Reputation persists across runs in `.data/reputation.json`.

## Reputation settlement rules

Guards use symmetric payoffs with the LLM judge as ground truth:

| Guard vote      | Judge passes | Judge fails |
|-----------------|-------------|-------------|
| Voted YES       | +4          | -4          |
| Voted NO/REWRITE| -4          | +4          |

Proposer payoffs: +5 for accepted proposals, -8 for failing after max rewrites, +2 bonus if a rewrite reaches acceptance.

## Output

- Improved SKILL.md files are written to `/tmp/consensus-gstack-evals/<skill>/SKILL.md`
- Audit log at `/tmp/consensus-gstack-evals/.data/skill-guard-audit.ndjson`
- Reputation state at `/tmp/consensus-gstack-evals/.data/reputation.json`
- Terminal output includes color-coded vote tables, judge scores, reputation deltas, and a final leaderboard

## Dependencies

- `@ai-sdk/anthropic` -- LLM calls via Vercel AI SDK
- `@consensus-tools/guards` -- Guard decision computation and effective weight calculation
- `@consensus-tools/schemas` -- Shared type definitions
- `dotenv` -- Environment variable loading
