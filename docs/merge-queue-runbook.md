# Merge Queue Runbook

## Purpose

This runbook prevents PR-head vs merge-ref drift by enforcing CI in merge context and serializing merges through GitHub merge queue.

## Required repository settings

- `CI` workflow includes `merge_group` trigger.
- Branch rulesets for `next` and default branch require:
  - Strict required status checks (`build`).
  - Merge queue enabled.

## Daily workflow

1. Open PR as usual and wait for required checks.
2. Resolve review feedback and re-run checks.
3. Use merge queue instead of direct merge.
4. Let queue revalidate in merge context before final merge.

## When to run a local merge-ref check (optional)

Run local parity checks when a PR is high-risk or multiple related PRs are landing together.

Recommended quick check:

```bash
act merge_group -W .github/workflows/ci.yml -n
```

If you suspect integration conflicts, run a local merge-ref simulation and verify lint/build:

```bash
git fetch origin pull/<PR_NUMBER>/head:pr-head pull/<PR_NUMBER>/merge:pr-merge
git diff pr-head..pr-merge -- <path/to/suspect/file>
pnpm -C typescript lint
pnpm -C typescript build
```

## Operational notes

- Keep admin bypasses rare; bypassing queue weakens merge guarantees.
- If queue latency grows, tune merge queue batch settings before disabling protection.
