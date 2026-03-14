import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

function createRecorderScript(label: string): string {
  return `node -e "require('node:fs').appendFileSync(process.env.RUN_LOG, '${label}\\n')"`;
}

describe("run-affected-command CLI", () => {
  it("runs the requested command for affected packages and their dependents", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-runner-"));
    const runLogPath = path.join(workspaceRoot, "run.log");

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          private: true,
          scripts: {
            "build:root": createRecorderScript("root:build"),
            "lint:root": createRecorderScript("root:lint"),
            "test:ci:root": createRecorderScript("root:test:ci"),
          },
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
      );
      await mkdir(path.join(workspaceRoot, "packages/core/src"), { recursive: true });
      await mkdir(path.join(workspaceRoot, "apps/web"), { recursive: true });
      await writeFile(path.join(workspaceRoot, "packages/core/src/index.ts"), "export const core = true;\n");
      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          private: true,
          scripts: {
            build: createRecorderScript("core:build"),
            lint: createRecorderScript("core:lint"),
            "test:ci": createRecorderScript("core:test:ci"),
          },
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "apps/web/package.json"),
        JSON.stringify({
          name: "web",
          private: true,
          dependencies: {
            core: "workspace:^",
          },
          scripts: {
            build: createRecorderScript("web:build"),
            lint: createRecorderScript("web:lint"),
            "test:ci": createRecorderScript("web:test:ci"),
          },
        }),
      );

      await execFileAsync(
        "pnpm",
        [
          "exec",
          "tsx",
          "src/ci/run-affected-command.ts",
          "--workspace-root",
          workspaceRoot,
          "--command",
          "lint",
          "--changed-file",
          "packages/core/src/index.ts",
        ],
        {
          cwd: path.resolve(import.meta.dirname, "../.."),
          env: {
            ...process.env,
            RUN_LOG: runLogPath,
          },
        },
      );

      expect(await readFile(runLogPath, "utf8")).toBe("core:lint\nweb:lint\n");
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("runs the root-only command when a root-owned file changes", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "affected-runner-root-"));
    const runLogPath = path.join(workspaceRoot, "run.log");

    try {
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          private: true,
          scripts: {
            "build:root": createRecorderScript("root:build"),
            "lint:root": createRecorderScript("root:lint"),
            "test:ci:root": createRecorderScript("root:test:ci"),
          },
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n",
      );
      await mkdir(path.join(workspaceRoot, "packages/core"), { recursive: true });
      await mkdir(path.join(workspaceRoot, "src/ci"), { recursive: true });
      await writeFile(
        path.join(workspaceRoot, "packages/core/package.json"),
        JSON.stringify({
          name: "core",
          private: true,
          scripts: {
            build: createRecorderScript("core:build"),
            lint: createRecorderScript("core:lint"),
            "test:ci": createRecorderScript("core:test:ci"),
          },
        }),
      );
      await writeFile(path.join(workspaceRoot, "src/ci/index.ts"), "export const root = true;\n");

      await execFileAsync(
        "pnpm",
        [
          "exec",
          "tsx",
          "src/ci/run-affected-command.ts",
          "--workspace-root",
          workspaceRoot,
          "--command",
          "build",
          "--changed-file",
          "src/ci/index.ts",
        ],
        {
          cwd: path.resolve(import.meta.dirname, "../.."),
          env: {
            ...process.env,
            RUN_LOG: runLogPath,
          },
        },
      );

      expect(await readFile(runLogPath, "utf8")).toBe("root:build\n");
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("runs package commands correctly when git paths come from a nested workspace root", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "affected-runner-nested-"));
    const workspaceRoot = path.join(repoRoot, "typescript");
    const runLogPath = path.join(workspaceRoot, "run.log");

    try {
      await mkdir(path.join(workspaceRoot, "packages/core/src"), { recursive: true });
      await writeFile(
        path.join(workspaceRoot, "package.json"),
        JSON.stringify({
          name: "monorepo-root",
          private: true,
          scripts: {
            "build:root": createRecorderScript("root:build"),
            "lint:root": createRecorderScript("root:lint"),
            "test:ci:root": createRecorderScript("root:test:ci"),
          },
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
          private: true,
          scripts: {
            build: createRecorderScript("core:build"),
            lint: createRecorderScript("core:lint"),
            "test:ci": createRecorderScript("core:test:ci"),
          },
        }),
      );
      await writeFile(
        path.join(workspaceRoot, "packages/core/src/index.ts"),
        "export const core = true;\n",
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
        "export const core = false;\n",
      );
      await execFileAsync("git", ["add", "."], {
        cwd: repoRoot,
      });
      await execFileAsync("git", ["commit", "-m", "change core"], {
        cwd: repoRoot,
      });

      await execFileAsync(
        "pnpm",
        [
          "exec",
          "tsx",
          "src/ci/run-affected-command.ts",
          "--workspace-root",
          workspaceRoot,
          "--command",
          "lint",
          "--base-ref",
          "HEAD~1",
          "--head-ref",
          "HEAD",
        ],
        {
          cwd: path.resolve(import.meta.dirname, "../.."),
          env: {
            ...process.env,
            RUN_LOG: runLogPath,
          },
        },
      );

      expect(await readFile(runLogPath, "utf8")).toBe("core:lint\n");
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });
});
