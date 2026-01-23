# PRD: CopilotKit v1.51 Web AG-UI Upgrade

## Overview

Upgrade the Web AG-UI client to CopilotKit v1.51.x by generating a fresh
`langgraph-js` starter app and integrating the existing CLMM agent workflow and
web UI into the new foundation. The legacy implementation should remain in the
repo for reference only, excluded from workspace builds.

## Goals

- Rename legacy `web-ag-ui` to `web-ag-ui-legacy`.
- Generate a new `web-ag-ui` app with the latest CopilotKit starter template.
- Integrate the legacy `agent-clmm` and `web` apps into the new structure.
- Align all CopilotKit runtime and UI wiring with v1.51.x conventions.
- Ensure lint/build pass after migration.

## Non-Goals

- Redesigning the UI beyond required template alignment.
- Preserving legacy compatibility layers or aliases.
- Changing agent business logic unless required for v1.51.x compatibility.

## Scope / Deliverables

- New `typescript/clients/web-ag-ui` generated from the CopilotKit CLI.
- Migrated agent package containing CLMM graph, tests, and configs.
- Migrated web app that retains existing UI, routes, and hooks.
- Updated workspace configuration to exclude `web-ag-ui-legacy`.

## Migration Notes

- Use `pnpm`-based tooling (no `npm`/`npx`).
- Keep legacy project intact, but excluded from workspace filters.
- Update all references to `starterAgent` if the new template expects a
  different agent naming scheme.

## Acceptance Criteria

- `web-ag-ui-legacy` exists and is excluded from workspace builds/lints.
- New `web-ag-ui` is generated from the CopilotKit `langgraph-js` template.
- Legacy agent and web app functionality are available in the new structure.
- `pnpm lint` and `pnpm build` succeed for the migrated workspace.

## Risks / Dependencies

- CopilotKit template differences may require refactors in runtime wiring.
- Dependency versions may need alignment with workspace constraints.
