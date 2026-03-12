#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  detectAffectedPackages,
  listChangedFilesFromGit,
} from "./affected-packages.js";

interface CliOptions {
  baseRef?: string;
  changedFiles: string[];
  headRef?: string;
  workspaceRoot: string;
}

function parseArgs(argv: string[], cwd: string): CliOptions {
  let baseRef: string | undefined;
  const changedFiles: string[] = [];
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

  if (changedFiles.length > 0 && baseRef) {
    throw new Error('Use either "--changed-file" or "--base-ref", not both');
  }

  if (headRef && !baseRef) {
    throw new Error('Flag "--head-ref" requires "--base-ref"');
  }

  return {
    baseRef,
    changedFiles,
    headRef,
    workspaceRoot,
  };
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

  process.stdout.write(
    `${JSON.stringify({
      scope: result.scope,
      selectedPackageDirs: result.selectedPackageDirs,
      selectedPackageNames: result.selectedPackageNames,
    })}\n`,
  );
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
