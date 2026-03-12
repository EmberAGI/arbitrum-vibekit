import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("detect-affected-packages CLI", () => {
  it("prints affected package names and dirs as JSON", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-cli-"));

    try {
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
      );
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          version: "1.0.0",
        }),
      );
      await mkdir(path.join(workspaceRoot, "packages/core"), { recursive: true });
      await mkdir(path.join(workspaceRoot, "apps/web"), { recursive: true });

      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "apps/web/package.json"),
        JSON.stringify({
          name: "web",
          version: "1.0.0",
          dependencies: {
            core: "workspace:^",
          },
        }),
      );

      const { stdout } = await execFileAsync(
        "pnpm",
        [
          "exec",
          "tsx",
          "src/ci/detect-affected-packages.ts",
          "--workspace-root",
          workspaceRoot,
          "--changed-file",
          "packages/core/src/index.ts",
        ],
        {
          cwd: path.resolve(import.meta.dirname, "../.."),
        },
      );

      expect(JSON.parse(stdout)).toEqual({
        scope: "partial",
        selectedPackageDirs: ["apps/web", "packages/core"],
        selectedPackageNames: ["core", "web"],
      });
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("computes changed files from git refs", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-cli-git-"));

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n",
      );
      await mkdir(path.join(workspaceRoot, "packages/core/src"), { recursive: true });
      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          version: "1.0.0",
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "packages/core/src/index.ts"),
        "export const version = 'v1';\n",
      );

      await execFileAsync("git", ["init", "--initial-branch=main"], {
        cwd: workspaceRoot,
      });
      await execFileAsync("git", ["config", "user.name", "Codex"], {
        cwd: workspaceRoot,
      });
      await execFileAsync("git", ["config", "user.email", "codex@example.com"], {
        cwd: workspaceRoot,
      });
      await execFileAsync("git", ["add", "."], {
        cwd: workspaceRoot,
      });
      await execFileAsync("git", ["commit", "-m", "initial"], {
        cwd: workspaceRoot,
      });

      await writeFile(
        path.join(workspaceRoot, "packages/core/src/index.ts"),
        "export const version = 'v2';\n",
      );
      await execFileAsync("git", ["add", "."], {
        cwd: workspaceRoot,
      });
      await execFileAsync("git", ["commit", "-m", "change core"], {
        cwd: workspaceRoot,
      });

      const { stdout } = await execFileAsync(
        "pnpm",
        [
          "exec",
          "tsx",
          "src/ci/detect-affected-packages.ts",
          "--workspace-root",
          workspaceRoot,
          "--base-ref",
          "HEAD~1",
          "--head-ref",
          "HEAD",
        ],
        {
          cwd: path.resolve(import.meta.dirname, "../.."),
        },
      );

      expect(JSON.parse(stdout)).toEqual({
        scope: "partial",
        selectedPackageDirs: ["packages/core"],
        selectedPackageNames: ["core"],
      });
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});
