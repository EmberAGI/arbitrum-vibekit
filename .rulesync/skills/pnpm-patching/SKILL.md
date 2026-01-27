---
name: pnpm-patching
description: Create and maintain pnpm patch files for third-party dependencies, including minified dist bundles. Use when fixing dependency bugs in node_modules, applying hotfixes before upstream releases, or debugging minified code paths with stack traces and patching CJS/ESM outputs while keeping diffs minimal and stable.
---

# Pnpm Patching

## Workflow

- Identify the exact package and version from stack traces or lockfile.
- Run `pnpm patch <pkg>@<version>` to open `node_modules/.pnpm_patches/<pkg>@<version>/`.
- Edit only the needed files inside the patch directory.
- Update both CJS and ESM outputs when the package ships both (commonly `dist/index.js` and `dist/index.mjs`).
- Keep edits surgical; avoid whitespace or formatting changes.
- Run `pnpm patch-commit node_modules/.pnpm_patches/<pkg>@<version>` to generate the patch and update the lockfile.

## Navigating Minified Dependencies

- Capture a stack trace to locate the exact file and offset that fails.
- Use the path from the stack to find the matching file in the patch directory.
- Search for a unique snippet or function name near the failing code and replace only the smallest necessary substring.
- If a minified identifier is undefined (example: `Z`), locate the missing binding or rename it to the correct local function name.
- Mirror the change in both CJS and ESM outputs so server and browser builds stay aligned.

## Patch Stability Tips

- Prefer string-replace edits over reformatting to keep diffs tiny.
- If the patch directory already exists, either `pnpm patch-commit` or delete it before re-running `pnpm patch`.
- When upstream changes frequently, pin the dependency version until the fix is released.

## Verification

- Restart dev/test processes that consume the dependency.
- Confirm the error is gone and the patched behavior runs end-to-end.
- Re-check that the patch applies cleanly after `pnpm install`.
