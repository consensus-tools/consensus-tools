# consensus-engineer skill

Interactive Claude Code skill — AI solution architect for consensus-tools integration. Analyzes projects, recommends guard/wrapper/MCP integration, scaffolds setup, proves auditability.

## Files

- `SKILL.md` — instruction content (the skill itself)
- `llms.txt` — structured system reference (~80KB, generated from repo context)
- `metadata.json` — skill manifest (v1.0.0)

## Important

**This directory is not a pnpm workspace member.** It has no package.json, no build step, and does not appear in `pnpm build` or `pnpm test` output. It is versioned in git and must not be removed during version bumps, cleanup, or broad `git add` operations.

## Gotchas

- `llms.txt` is very large (~80KB). It is generated, not hand-written.
- The skill is interactive and multi-step — requires the Claude Code harness.
- Optional env vars for LLM evaluation: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LANGCHAIN_API_KEY`.
- Network side effects disabled by default (local-first evaluation).
