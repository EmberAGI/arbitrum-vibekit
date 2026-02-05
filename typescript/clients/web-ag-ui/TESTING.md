# Web AG-UI Agent Testing Notes

This note documents how to correctly run tests for any given agent in `clients/web-ag-ui`, based on what was tried initially, what was wrong, and where we landed.

## What I Tried Initially (Wrong)

1. I ran repo-level commands from `typescript/`:
   - `pnpm lint`
   - `pnpm build`

2. I also ran a general `pnpm install` in the monorepo root.

These actions triggered unrelated packages (for example `clients/web-a2a`) and caused failures unrelated to the target agent. This made the results noisy and misleading for the actual work.

Additionally, I attempted to add dependencies directly inside `apps/web`:
- `pnpm add -D prettier`

That failed with:
- `ERR_PNPM_PATCH_NOT_APPLIED` because `clients/web-ag-ui` uses `patchedDependencies` at the workspace root, and installing inside a leaf app can conflict with those patches.

## What Was Actually Correct

All test and build workflows should be scoped to **`clients/web-ag-ui` only**, and ideally filtered to the specific app (agent) being worked on.

### Correct Pattern (for any agent app)

Use `pnpm -C` to scope to `clients/web-ag-ui` and then filter to the agent package name.

Example for `agent-gmx-allora`:

```
pnpm -C typescript/clients/web-ag-ui --filter agent-gmx-allora run lint
pnpm -C typescript/clients/web-ag-ui --filter agent-gmx-allora run build
pnpm -C typescript/clients/web-ag-ui --filter agent-gmx-allora run test
```

This runs unit + integration + e2e (if defined) without touching unrelated workspaces.

### Example for `apps/web`

```
pnpm -C typescript/clients/web-ag-ui --filter web run lint
pnpm -C typescript/clients/web-ag-ui --filter web run build
pnpm -C typescript/clients/web-ag-ui --filter web run test
```

Note: `apps/web` currently has no test suites, so the test scripts are no-ops (by design).

## Practical Outcome / Final Approach

- Always scope commands to `clients/web-ag-ui`.
- Always use `--filter <package>` to target the exact app you are testing.
- Avoid running monorepo-root scripts for this workstream.
- Avoid `pnpm add` inside leaf apps unless patches are fully resolved at the workspace root.

## Recommended Quick Checklist

For any agent in `clients/web-ag-ui/apps/<agent>`:

1. Lint:
   - `pnpm -C typescript/clients/web-ag-ui --filter <agent-name> run lint`

2. Build:
   - `pnpm -C typescript/clients/web-ag-ui --filter <agent-name> run build`

3. Tests:
   - `pnpm -C typescript/clients/web-ag-ui --filter <agent-name> run test`

4. Format (if needed):
   - `pnpm -C typescript/clients/web-ag-ui --filter <agent-name> run format`

5. Format check:
   - `pnpm -C typescript/clients/web-ag-ui --filter <agent-name> run format:check`

This keeps the scope tight and avoids unrelated failures.
