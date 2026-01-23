# Troubleshooting: Rulesync Upgrade Build Failure

Branch: feat/copilotkit-upgrade | Updated: 2026-01-23 14:16:16

## Current Focus

Working on: Verify web-ag-ui and web-ag-ui-legacy builds only.
Approach: Ignore web-legacy changes; revert edits and focus on web-ag-ui(-legacy).

## Evidence Collected

- `pnpm -r --stream --filter '!./community/**' --filter '!test-utils' --filter '!./clients/web-legacy' --filter '!web-ag-ui' run build` failed with `langgraph-js-starter@0.1.0 build: turbo run build` exit status 1.
- `pnpm --filter langgraph-js-starter run build` succeeded; Next.js reported multiple lockfiles and `shiki` externalization warnings during Turbopack build.
- `pnpm build` failed with `web@0.1.0 build: next build` exit status 1.
- `pnpm --filter web run build` and `pnpm -r --filter web run build` both succeeded with only Turbopack warnings.
- Added `shiki` dependency in `clients/web-ag-ui/apps/web`; `pnpm lint` succeeded; `pnpm build` still failed with `langgraph-js-starter@0.1.0 build: turbo run build`.
- `pnpm -r --if-present --workspace-concurrency=1 --stream run build` failed first at `clients/web-ag-ui-legacy` with `web-ag-ui@0.1.0 build: turbo run build --output-logs=full --log-order=stream --summarize`.
- `pnpm run build` in `clients/web-ag-ui-legacy` failed because `apps/web` could not find `next` (`node_modules` missing) and turbo warned about missing `pnpm-lock.yaml`.
- `pnpm install` in `clients/web-ag-ui-legacy` completed; `pnpm run build` succeeded afterward with only Next.js lockfile warnings.
- `pnpm -r --if-present --workspace-concurrency=1 --stream run build` now fails first at `clients/web-legacy` with `vibekit-web-client@0.1.0 build: next build`.
- Reverted edits in `clients/web-legacy` per instruction; no further work planned there.
- Direct builds succeeded for `web-ag-ui/apps/web`, `web-ag-ui-legacy/apps/agent-clmm`, and `web-ag-ui-legacy/apps/web` (with Next.js lockfile warnings).
- `pnpm run build` succeeded in both `clients/web-ag-ui` and `clients/web-ag-ui-legacy`.
- `pnpm lint` and `pnpm build` succeeded from `typescript/` after refocusing on web-ag-ui workspaces.

## Assumptions

- Failure may be within `clients/web-ag-ui` build pipeline.
- Could be an existing issue unrelated to the rulesync upgrade.

## Attempts Log

2026-01-23 13:38 Attempt 1: Re-run clients/web-ag-ui build for full error output -> succeeded with Turbopack warnings about shiki externals and multiple lockfiles.
2026-01-23 13:39 Attempt 2: Re-run pnpm build at workspace root to confirm success -> failed with `web@0.1.0 build: next build`.
2026-01-23 13:39 Attempt 3: Run direct and filtered web builds to compare behavior -> web builds succeeded, recursive pnpm build still fails.
2026-01-23 13:47 Attempt 4: Add `shiki` dependency to apps/web and re-run lint/build -> lint ok; build still fails with `langgraph-js-starter@0.1.0 build: turbo run build`.
2026-01-23 13:48 Attempt 5: Run per-package builds with pnpm recursive `--if-present` before retrying web-ag-ui/root -> failed at web-ag-ui-legacy.
2026-01-23 14:01 Attempt 6: Run web-ag-ui-legacy build directly for detailed error output -> failed due to missing node_modules in apps/web.
2026-01-23 14:02 Attempt 7: Install dependencies in web-ag-ui-legacy workspace and retry build -> install ok.
2026-01-23 14:04 Attempt 8: Re-run web-ag-ui-legacy build -> succeeded with Next.js lockfile warnings.
2026-01-23 14:06 Attempt 9: Run per-package builds again -> failed at web-legacy.
2026-01-23 14:06 Attempt 10: Run web-legacy build directly for detailed error output -> failed with TS type annotation error.
2026-01-23 14:07 Attempt 11: Add explicit PageProps and return type in web-legacy page -> failed; Next.js expected params as Promise.
2026-01-23 14:08 Attempt 12: Update PageProps to Promise params while keeping explicit return type -> failed; new Layout type inference error.
2026-01-23 14:09 Attempt 13: Add explicit LayoutProps and return type in layout -> failed; new Page inference error.
2026-01-23 14:10 Attempt 14: Add explicit return type in app/(chat)/page.tsx -> failed; more type errors.
2026-01-23 14:12 Attempt 15: Revert web-legacy edits and refocus on web-ag-ui and web-ag-ui-legacy -> complete
2026-01-23 14:16 Attempt 16: Run direct builds for web-ag-ui + web-ag-ui-legacy apps, then workspace builds, then root build -> succeeded

## Discovered Patterns

- Turbopack warnings about `shiki` externalization appear consistently but do not fail direct builds.

## Blockers/Questions

- Focus only on web-ag-ui and web-ag-ui-legacy; ignore web-legacy for build validation.

## Resolution (when solved)

### Root Cause

TBD

### Solution

TBD

### Learnings

TBD
