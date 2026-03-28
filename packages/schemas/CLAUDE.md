# @consensus-tools/schemas

Shared Zod schemas and TypeScript types — the contract layer for the entire monorepo. Zero internal dependencies.

All other packages import types from here. Every schema doubles as both a Zod runtime validator and an inferred TypeScript type.

## Key Exports

- **Guard types:** `guardTypeSchema` (9 guard domains), `guardVoteSchema`, `weightedGuardVoteSchema`, `guardPolicySchema`
- **Job lifecycle:** `jobSchema`, `submissionSchema`, `voteSchema`, `resolutionSchema`
- **Policies:** `consensusPolicyTypeSchema`, `consensusPolicyConfigSchema`
- **Workflows:** `workflowSchema`, `workflowRunSchema`, `cronScheduleSchema`
- **HITL:** `hitlModeSchema`, `hitlApprovalSchema`, `humanDecisionSchema`
- **Constants:** `BUILT_IN_GUARD_DOMAINS`, `GUARD_DOMAIN_DESCRIPTIONS`, `DEFAULT_GUARD_POLICY`

## Rules

- **Never add internal dependencies** to this package. It is the foundation of the tier system.
- Schema changes impact all downstream packages immediately — make changes carefully.
- Guard decisions: ALLOW, BLOCK, REWRITE, REQUIRE_HUMAN.
- Guard types (9 in `guardTypeSchema`): send_email, code_merge, publish, support_reply, agent_action, deployment, permission_escalation, seo_fix, diff_check. Note: `BUILT_IN_GUARD_DOMAINS` only contains 7 (excludes seo_fix and diff_check).
