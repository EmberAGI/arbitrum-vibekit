#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

import {
  detectAffectedPackages,
  listChangedFilesFromGit,
} from "./affected-packages.js";

type WorkspaceCommand = "build" | "lint" | "test:ci";

interface CliOptions {
  baseRef?: string;
  changedFiles: string[];
  command: WorkspaceCommand;
  headRef?: string;
  workspaceRoot: string;
}

const ROOT_COMMANDS: Record<WorkspaceCommand, string> = {
  build: "build:root",
  lint: "lint:root",
  "test:ci": "test:ci:root",
};

function parseWorkspaceCommand(value: string | undefined): WorkspaceCommand {
  if (value === "build" || value === "lint" || value === "test:ci") {
    return value;
  }

  throw new Error('Flag "--command" must be one of: build, lint, test:ci');
}

function parseArgs(argv: string[], cwd: string): CliOptions {
  let baseRef: string | undefined;
  const changedFiles: string[] = [];
  let command: WorkspaceCommand | undefined;
  let headRef: string | undefined;
  let workspaceRoot = cwd;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--workspace-root") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error('Flag "--workspace-root" requires a value');
      }

      workspaceRoot = path.resolve(cwd, value);
      index += 1;
      continue;
    }

    if (token === "--command") {
      command = parseWorkspaceCommand(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--changed-file") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error('Flag "--changed-file" requires a value');
      }

      changedFiles.push(value);
      index += 1;
      continue;
    }

    if (token === "--base-ref") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error('Flag "--base-ref" requires a value');
      }

      baseRef = value;
      index += 1;
      continue;
    }

    if (token === "--head-ref") {
      const value = argv[index + 1];

      if (!value) {
        throw new Error('Flag "--head-ref" requires a value');
      }

      headRef = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown flag "${token}"`);
  }

  if (!command) {
    throw new Error('Flag "--command" is required');
  }

  if (changedFiles.length > 0 && baseRef) {
    throw new Error('Use either "--changed-file" or "--base-ref", not both');
  }

  if (headRef && !baseRef) {
    throw new Error('Flag "--head-ref" requires "--base-ref"');
  }

  return {
    baseRef,
    changedFiles,
    command,
    headRef,
    workspaceRoot,
  };
}

async function runPnpm(args: string[], workspaceRoot: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pnpm ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.cwd());
  const changedFiles = options.baseRef
    ? await listChangedFilesFromGit({
        baseRef: options.baseRef,
        headRef: options.headRef,
        workspaceRoot: options.workspaceRoot,
      })
    : options.changedFiles;
  const result = await detectAffectedPackages({
    changedFiles,
    workspaceRoot: options.workspaceRoot,
  });

  if (result.scope === "none") {
    process.stderr.write(`No affected packages for ${options.command}\n`);
    return;
  }

  if (result.scope === "full") {
    await runPnpm(["run", options.command], options.workspaceRoot);
    return;
  }

  const selectedPackageNames = result.selectedPackageNames.filter((name) => name !== "monorepo-root");

  if (result.selectedPackageNames.includes("monorepo-root")) {
    await runPnpm(["run", ROOT_COMMANDS[options.command]], options.workspaceRoot);
  }

  if (selectedPackageNames.length === 0) {
    return;
  }

  const filterArgs = selectedPackageNames.flatMap((packageName) => ["--filter", packageName]);
  await runPnpm(
    [...filterArgs, "--workspace-concurrency=1", "--sort", "run", options.command],
    options.workspaceRoot,
  );
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
