import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function initGitRepository(repoRoot: string) {
  await execFileAsync("git", ["init", "--initial-branch=main"], {
    cwd: repoRoot,
  });
  await execFileAsync("git", ["config", "user.name", "Codex"], {
    cwd: repoRoot,
  });
  await execFileAsync("git", ["config", "user.email", "codex@example.com"], {
    cwd: repoRoot,
  });
}

async function commitAll(repoRoot: string, message: string) {
  await execFileAsync("git", ["add", "."], {
    cwd: repoRoot,
  });
  await execFileAsync("git", ["commit", "-m", message], {
    cwd: repoRoot,
  });
}

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

  it("normalizes git diff paths for a nested workspace root", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "affected-cli-nested-"));
    const workspaceRoot = path.join(repoRoot, "typescript");

    try {
      await mkdir(path.join(workspaceRoot, "packages/core/src"), { recursive: true });
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
        cwd: repoRoot,
      });
      await execFileAsync("git", ["config", "user.name", "Codex"], {
        cwd: repoRoot,
      });
      await execFileAsync("git", ["config", "user.email", "codex@example.com"], {
        cwd: repoRoot,
      });
      await execFileAsync("git", ["add", "."], {
        cwd: repoRoot,
      });
      await execFileAsync("git", ["commit", "-m", "initial"], {
        cwd: repoRoot,
      });

      await writeFile(
        path.join(workspaceRoot, "packages/core/src/index.ts"),
        "export const version = 'v2';\n",
      );
      await execFileAsync("git", ["add", "."], {
        cwd: repoRoot,
      });
      await execFileAsync("git", ["commit", "-m", "change core"], {
        cwd: repoRoot,
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
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it("treats low-risk root package.json script changes as partial root-only changes", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-cli-root-scripts-"));

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "monorepo-root",
            version: "1.0.0",
            scripts: {
              lint: "pnpm lint",
            },
          },
          null,
          2,
        ),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n",
      );
      await mkdir(path.join(workspaceRoot, "packages/core"), { recursive: true });
      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          version: "1.0.0",
        }),
      );

      await initGitRepository(workspaceRoot);
      await commitAll(workspaceRoot, "initial");

      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "monorepo-root",
            version: "1.0.0",
            scripts: {
              lint: "pnpm lint",
              "test:ci:root": "pnpm test:vitest tests/ci/new-root-test.int.test.ts",
            },
          },
          null,
          2,
        ),
      );
      await commitAll(workspaceRoot, "script-only root package change");

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
        selectedPackageDirs: [""],
        selectedPackageNames: ["monorepo-root"],
      });
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("still treats risky root package.json dependency changes as full-workspace changes", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-cli-root-deps-"));

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "monorepo-root",
            version: "1.0.0",
          },
          null,
          2,
        ),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n",
      );
      await mkdir(path.join(workspaceRoot, "packages/core"), { recursive: true });
      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          version: "1.0.0",
        }),
      );

      await initGitRepository(workspaceRoot);
      await commitAll(workspaceRoot, "initial");

      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify(
          {
            name: "monorepo-root",
            version: "1.0.0",
            devDependencies: {
              vitest: "^3.2.4",
            },
          },
          null,
          2,
        ),
      );
      await commitAll(workspaceRoot, "root dependency change");

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
        scope: "full",
        selectedPackageDirs: ["", "packages/core"],
        selectedPackageNames: ["core", "monorepo-root"],
      });
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});
