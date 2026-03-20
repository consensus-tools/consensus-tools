/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Tier 0: Foundation ──────────────────────────────────────────────
    // schemas and secrets have zero internal dependencies.
    {
      name: "foundation-no-internal-deps",
      comment:
        "Tier 0 packages (schemas, secrets) must not depend on any other internal package.",
      severity: "error",
      from: { path: "^packages/(schemas)/|^packages/adapters/(secrets)/" },
      to: {
        path: "^packages/",
        pathNot: "^packages/(schemas)/|^packages/adapters/(secrets)/",
      },
    },

    // ── Tier 1: Primitives ──────────────────────────────────────────────
    // May only depend on Tier 0 (schemas, secrets).
    {
      name: "primitives-no-upward-deps",
      comment:
        "Tier 1 packages may only depend on Tier 0 (schemas, secrets).",
      severity: "error",
      from: {
        path: "^packages/(guards|telemetry|sdk-client|evals|storage)/|^packages/adapters/(integrations|notifications)/",
      },
      to: {
        path: "^packages/(core|policies|workflows|wrapper|cli|sdk-node)/|^packages/adapters/(mcp|openclaw)/",
      },
    },

    // ── Tier 2: Engines ─────────────────────────────────────────────────
    // core and policies may depend on Tier 0–1 only.
    {
      name: "engines-no-upward-deps",
      comment:
        "Tier 2 packages (core, policies) must not depend on Tier 3+ packages.",
      severity: "error",
      from: { path: "^packages/(core|policies)/" },
      to: {
        path: "^packages/(workflows|wrapper|cli|sdk-node)/|^packages/adapters/(mcp|openclaw)/",
      },
    },

    // ── Tier 3: Composition ─────────────────────────────────────────────
    // workflows and wrapper may depend on Tier 0–2 only.
    {
      name: "composition-no-upward-deps",
      comment:
        "Tier 3 packages (workflows, wrapper) must not depend on Tier 4 packages or apps.",
      severity: "error",
      from: { path: "^packages/(workflows|wrapper)/" },
      to: {
        path: "^packages/(sdk-node|cli)/|^packages/adapters/(mcp|openclaw)/|^apps/",
      },
    },

    // ── Cross-cutting rules ─────────────────────────────────────────────
    {
      name: "no-circular",
      comment: "No circular dependencies allowed at any granularity.",
      severity: "error",
      from: {},
      to: {
        circular: true,
        dependencyTypesNot: ["type-only"],
      },
    },

    {
      name: "no-deep-imports",
      comment:
        "Only import from a package's barrel export, never from internal paths.",
      severity: "error",
      from: { path: "^(packages|apps)/" },
      to: {
        path: "node_modules/@consensus-tools/[^/]+/.+",
        pathNot: "node_modules/@consensus-tools/[^/]+/dist/index\\.(js|d\\.ts)$",
      },
    },
  ],

  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: ["dist", "node_modules", "\\.test\\.", "__tests__"],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/(@consensus-tools/[^/]+)",
      },
    },
  },
};
