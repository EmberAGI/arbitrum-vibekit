# PRD: CopilotKit v1.50 Web AG-UI Upgrade

## Overview

Upgrade the Web AG-UI client to CopilotKit v1.50.x by generating a fresh
`langgraph-js` starter app, validating it in isolation, and then integrating the
existing CLMM agent workflow and web UI into the new foundation. The legacy
implementation should remain in the repo for reference only, excluded from
workspace builds.

## Goals

- Rename legacy `web-ag-ui` to `web-ag-ui-legacy`.
- Generate a new `web-ag-ui` app with the latest CopilotKit starter template.
- Integrate the legacy `agent-clmm` and `web` apps into the new structure.
- Align all CopilotKit runtime and UI wiring with v1.50.x conventions.
- Validate the starter works after the dependency upgrade before migrating.
- Ensure lint/build pass after migration.

## Non-Goals

- Redesigning the UI beyond required template alignment.
- Preserving legacy compatibility layers or aliases.
- Changing agent business logic unless required for v1.50.x compatibility.

## Scope / Deliverables

- New `typescript/clients/web-ag-ui` generated from the CopilotKit CLI.
- Migrated agent package containing CLMM graph, tests, and configs.
- Migrated web app that retains existing UI, routes, and hooks.
- Updated workspace configuration to exclude `web-ag-ui-legacy`.
- v1.50.x dependency alignment for CopilotKit packages across agent + web.
- Starter validation pass (lint/build) before migration.

## Migration Notes

- Use `pnpm`-based tooling (no `npm`/`npx`).
- Read `.claude/agents/test-driven-coder.md` before any implementation changes.
- Keep legacy project intact, but excluded from workspace filters.
- Generate the starter with `pnpm dlx copilotkit@latest create -f langgraph-js`.
- Pin CopilotKit packages to v1.50.x:
  - `@copilotkit/react-core`, `@copilotkit/react-ui`, `@copilotkit/runtime` in web.
  - `@copilotkit/sdk-js` in agent.
- Update linting for Next 16/ESLint 9 (`eslint` + flat config export).
- Validate `pnpm lint` and `pnpm build` after upgrading dependencies.
- Pause before migrating legacy code once starter validation is complete.

## Acceptance Criteria

- `web-ag-ui-legacy` exists and is excluded from workspace builds/lints.
- New `web-ag-ui` is generated from the CopilotKit `langgraph-js` template.
- CopilotKit dependencies are pinned to v1.50.x across web + agent.
- Starter lint/build pass before migration begins.
- Legacy agent and web app functionality are available in the new structure.
- `pnpm lint` and `pnpm build` succeed for the migrated workspace.

## Risks / Dependencies

- CopilotKit template differences may require refactors in runtime wiring.
- Dependency versions may need alignment with workspace constraints.
- Next.js build warns about multiple lockfiles and missing `shiki` externals.
