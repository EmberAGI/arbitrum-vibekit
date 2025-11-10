#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PACKAGE_DEFINITIONS = [
  {
    id: "agent-node",
    packageJson: "lib/agent-node/package.json",
    packageName: "@emberai/agent-node",
    tagPattern: "@emberai/agent-node@*",
    workspace: "lib/agent-node",
  },
  {
    id: "registry",
    packageJson: "onchain-actions-plugins/registry/package.json",
    packageName: "@emberai/onchain-actions-registry",
    tagPattern: "@emberai/onchain-actions-registry@*",
    workspace: "onchain-actions-plugins/registry",
  },
];

const PACKAGE_LOOKUP = new Map(
  PACKAGE_DEFINITIONS.flatMap((definition) => [
    [definition.id, definition],
    [definition.packageName, definition],
    [definition.workspace, definition],
  ]),
);

const LIST_DELIMITER = /[, ]/;

function parseList(value) {
  return value
    .split(LIST_DELIMITER)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });

  if (result.status !== 0) {
    return { error: result.stderr.trim() };
  }

  return { output: result.stdout.trim() };
}

function findLatestTag(pattern, cwd) {
  const { output, error } = runGit(["describe", "--tags", "--match", pattern, "--abbrev=0"], cwd);

  if (error) {
    return null;
  }

  return output;
}

function detectChanges(sinceTag, targetPath, cwd) {
  if (!sinceTag) {
    return true;
  }

  const { output, error } = runGit(["diff", `${sinceTag}..HEAD`, "--name-only", "--", targetPath], cwd);

  if (error) {
    throw new Error(error);
  }

  return output.length > 0;
}

function resolvePackageList(specs) {
  if (!specs.length) {
    return PACKAGE_DEFINITIONS;
  }

  return specs.map((spec) => {
    const definition = PACKAGE_LOOKUP.get(spec.trim());

    if (!definition) {
      throw new Error(`Unknown package "${spec}".`);
    }

    return definition;
  });
}

async function main() {
  const cwd = process.cwd();
  const argv = process.argv.slice(2);
  const packageSpecs = [];
  let outputPath = path.resolve(cwd, "release-targets.json");

  while (argv.length) {
    const token = argv.shift();

    if (token === "--packages") {
      packageSpecs.push(...parseList(argv.shift() ?? ""));
      continue;
    }

    if (token?.startsWith("--packages=")) {
      packageSpecs.push(...parseList(token.slice("--packages=".length)));
      continue;
    }

    if (token === "--output") {
      outputPath = path.resolve(cwd, argv.shift() ?? "");
      continue;
    }

    if (token?.startsWith("--output=")) {
      outputPath = path.resolve(cwd, token.slice("--output=".length));
      continue;
    }

    throw new Error(`Unknown flag "${token}". Supported flags: --packages, --output.`);
  }

  const overrideSpecs =
    process.env.RELEASE_PACKAGE_OVERRIDE && process.env.RELEASE_PACKAGE_OVERRIDE.trim().length > 0
      ? parseList(process.env.RELEASE_PACKAGE_OVERRIDE)
      : [];
  const forcedIds = new Set(overrideSpecs.map((spec) => resolvePackageList([spec])[0].id));

  const packagesToCheck = resolvePackageList(packageSpecs.length > 0 ? packageSpecs : PACKAGE_DEFINITIONS.map((pkg) => pkg.id));

  const packages = [];

  for (const pkg of packagesToCheck) {
    const latestTag = findLatestTag(pkg.tagPattern, cwd);
    const forced = forcedIds.has(pkg.id);
    const changed = forced || detectChanges(latestTag, pkg.workspace, cwd);

    packages.push({
      changed,
      forced,
      id: pkg.id,
      name: pkg.packageName,
      packageJson: pkg.packageJson,
      sinceTag: latestTag,
      workspace: pkg.workspace,
    });
  }

  const selected = packages.filter((pkg) => pkg.changed).map((pkg) => pkg.id);
  const matrix = packages
    .filter((pkg) => pkg.changed)
    .map((pkg) => ({
      forced: pkg.forced,
      id: pkg.id,
      packageJson: pkg.packageJson,
      packageName: pkg.name,
      workspace: pkg.workspace,
    }));

  const payload = {
    packages,
    selected,
    matrix,
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload, null, 2));
}

try {
  await main();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(`[detect-release-targets] ${error.message}`);
  process.exit(1);
}
