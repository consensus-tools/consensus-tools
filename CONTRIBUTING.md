# Contributing to consensus-tools

Thanks for your interest in contributing! This guide covers everything you need to get started.

## Development Setup

```bash
# Fork and clone
git clone https://github.com/<your-username>/consensus-tools.git
cd consensus-tools

# Install dependencies (requires pnpm and Node >= 20)
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type-check
pnpm typecheck
```

## Project Structure

```
packages/       # 21 npm packages under @consensus-tools/*
apps/           # Applications (API server, web dashboard)
examples/       # Integration examples
scripts/        # CI and build scripts
```

Each package under `packages/` is independently published to npm. See the [README](README.md) for the full package list and architecture diagram.

## Making Changes

1. Create a branch from `main`
2. Make your changes in the relevant package(s)
3. Run `pnpm build && pnpm typecheck && pnpm test` to verify
4. Submit a pull request

### Code Style

- TypeScript, strict mode, ESM-only
- No default exports — use named exports
- Keep packages focused on a single responsibility

### Dependency Policy

Production `dependencies` must not include LLM provider SDKs (openai, anthropic, @google/generative-ai, langchain, etc.). This is enforced in CI. LLM provider packages belong in `devDependencies` only, for testing purposes.

### Adding a New Package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, and `src/index.ts`
2. Extend `tsconfig.base.json` in the package tsconfig
3. Set `"license": "Apache-2.0"` and add the standard metadata fields
4. Add the package to this README's package table

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include a clear description of what changed and why
- Ensure CI passes before requesting review

## Reporting Issues

Open an issue at [github.com/consensus-tools/consensus-tools/issues](https://github.com/consensus-tools/consensus-tools/issues).

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
