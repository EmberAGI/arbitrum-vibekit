#!/usr/bin/env node

import fs from "node:fs";
import { spawn, execSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SUMMARY_FLAG = "--summary-file";
const DEFAULT_SUMMARY_PATH = ".artifacts/msr-dry-run-summary.json";

// Check if user has real tokens set
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const hasGitHubToken = Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);

if (!process.env.RELEASE_DRY_RUN) {
  process.env.RELEASE_DRY_RUN = "true";
}

if (!hasGitHubToken) {
  // eslint-disable-next-line no-console
  console.warn(
    "[dry-run] WARNING: No GitHub token found. Set GH_TOKEN or GITHUB_TOKEN for full dry-run functionality.",
  );
  console.warn("[dry-run] The dry-run may fail on GitHub API validation steps.");
  process.env.GH_TOKEN = "dry-run-dummy-token";
}

// Determine which branch to simulate (default to current branch)
const simulateBranch = process.env.RELEASE_SIMULATE_BRANCH;
let originalHead = null;
let gitDir = null;

if (simulateBranch) {
  // Get the Git directory
  try {
    gitDir = execSync("git rev-parse --git-dir", { encoding: "utf8" }).trim();
    const headFile = path.join(gitDir, "HEAD");

    // Backup the current HEAD
    originalHead = fs.readFileSync(headFile, "utf8");

    // Temporarily change HEAD to point to the simulated branch
    fs.writeFileSync(headFile, `ref: refs/heads/${simulateBranch}\n`);

    // eslint-disable-next-line no-console
    console.log(`[dry-run] Simulating release as if running on branch: ${simulateBranch}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[dry-run] Failed to modify Git HEAD: ${error.message}`);
    process.exit(1);
  }
}

const releaseScript = path.resolve(scriptDir, "run-multi-release.mjs");

const rawArgs = process.argv.slice(2);
const userArgs = rawArgs.length > 0 && rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const hasSummaryFlag = userArgs.some((arg) => arg === SUMMARY_FLAG || arg.startsWith(`${SUMMARY_FLAG}=`));

const releaseArgs = ["--dry-run"];

// Add --no-ci flag when simulating a branch to disable Git branch detection
if (simulateBranch) {
  releaseArgs.push("--no-ci");
}

if (!hasSummaryFlag) {
  releaseArgs.push(SUMMARY_FLAG, DEFAULT_SUMMARY_PATH);
}

releaseArgs.push(...userArgs);

// Function to restore Git HEAD
function restoreGitHead() {
  if (originalHead && gitDir) {
    try {
      const headFile = path.join(gitDir, "HEAD");
      fs.writeFileSync(headFile, originalHead);
      // eslint-disable-next-line no-console
      console.log("[dry-run] Restored original Git HEAD");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[dry-run] Failed to restore Git HEAD: ${error.message}`);
    }
  }
}

// Ensure we always restore HEAD, even on errors or signals
process.on("exit", restoreGitHead);
process.on("SIGINT", () => {
  restoreGitHead();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restoreGitHead();
  process.exit(143);
});

const child = spawn(process.execPath, [releaseScript, ...releaseArgs], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  restoreGitHead();

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
