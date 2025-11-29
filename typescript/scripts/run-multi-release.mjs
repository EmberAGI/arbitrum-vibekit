#!/usr/bin/env node

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import createDebug from "debug";
import multiSemanticRelease from "@anolilab/multi-semantic-release";
import logger from "@anolilab/multi-semantic-release/lib/logger.js";

const PACKAGE_DEFINITIONS = [
  {
    id: "agent-node",
    packageJson: "lib/agent-node/package.json",
    packageName: "@emberai/agent-node",
    workspace: "lib/agent-node",
  },
  {
    id: "registry",
    packageJson: "onchain-actions-plugins/registry/package.json",
    packageName: "@emberai/onchain-actions-registry",
    workspace: "onchain-actions-plugins/registry",
  },
];

const PACKAGE_LOOKUP = new Map(
  PACKAGE_DEFINITIONS.flatMap((definition) => {
    const entries = [
      [definition.id, definition],
      [definition.packageName, definition],
      [definition.workspace, definition],
      [definition.packageJson, definition],
    ];

    if (definition.packageJson.endsWith("/package.json")) {
      entries.push([definition.packageJson.replace(/\/package\.json$/, ""), definition]);
    }

    return entries;
  }),
);

const DEFAULT_PACKAGE_IDS = PACKAGE_DEFINITIONS.map((pkg) => pkg.id);
const LIST_DELIMITER = /[, ]/;
const DEFAULT_DEBUG_SCOPES = ["msr:*", "semantic-release:*"];
const DEBUG_SCOPE_ENV = "MSR_DEBUG_SCOPES";
let loggerLevelPatched = false;

const BOOLEAN_FLAGS = new Map([
  ["--dry-run", "dryRun"],
  ["--debug", "debug"],
  ["--silent", "silent"],
  ["--sequential-init", "sequentialInit"],
  ["--sequential-prepare", "sequentialPrepare"],
  ["--first-parent", "firstParent"],
  ["--ci", "ci"],
]);

const STRING_FLAGS = new Map([
  ["--log-level", "logLevel"],
  ["--tag-format", "tagFormat"],
]);

const LIST_FLAGS = new Map([
  ["--branches", "branches"],
  ["--ignore-packages", "ignorePackages"],
]);

const NESTED_STRING_FLAGS = new Map([
  ["--deps.bump", ["deps", "bump"]],
  ["--deps.release", ["deps", "release"]],
  ["--deps.prefix", ["deps", "prefix"]],
]);

const FLAG_ALIASES = new Map([
  ["-d", "--dry-run"],
  ["-b", "--branches"],
  ["-p", "--packages"],
  ["-h", "--help"],
]);

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(`Usage: pnpm release [options]

Options:
  --packages <list>        Comma or space separated list of packages (name or path).
  --summary-file <path>    Output path for release summary JSON (default: ./release-summary.json).
  --dry-run                Run without publishing artifacts.
  --ignore-private         Include private packages (use --no-ignore-private to disable).
  --<semantic-release flag>  Any flag supported by multi-semantic-release (e.g. --branches, --deps.bump).

Examples:
  pnpm release -- --dry-run
  pnpm release -- --packages agent-node
  pnpm release -- --packages agent-node registry --summary-file .artifacts/msr-summary.json
`);
}

function parseList(value) {
  return value
    .split(LIST_DELIMITER)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function setNestedOption(target, pathSegments, value) {
  let cursor = target;

  for (let index = 0; index < pathSegments.length; index += 1) {
    const key = pathSegments[index];

    if (index === pathSegments.length - 1) {
      cursor[key] = value;
    } else {
      cursor[key] = cursor[key] ?? {};
      cursor = cursor[key];
    }
  }
}

function addDebugNamespaces(scopes) {
  const existing = createDebug.load();
  const initialNamespaces = existing ? existing.split(/[\s,]+/) : [];
  const namespaceSet = new Set(initialNamespaces.filter(Boolean));

  scopes.filter(Boolean).forEach((scope) => namespaceSet.add(scope));

  if (namespaceSet.size === 0) {
    return;
  }

  createDebug.enable([...namespaceSet].join(","));
}

function patchLoggerLevel(scopes) {
  if (loggerLevelPatched) {
    return;
  }

  const descriptor = Object.getOwnPropertyDescriptor(logger.config, "level");

  if (!descriptor?.set) {
    return;
  }

  Object.defineProperty(logger.config, "level", {
    configurable: descriptor.configurable ?? true,
    enumerable: descriptor.enumerable ?? true,
    get: descriptor.get ? descriptor.get.bind(logger.config) : undefined,
    set(value) {
      descriptor.set.call(logger.config, value);
      addDebugNamespaces(scopes);
    },
  });

  loggerLevelPatched = true;
  addDebugNamespaces(scopes);
}

function maybeEnableVerboseMsrLogging(options) {
  const rawScopes = process.env[DEBUG_SCOPE_ENV];
  const shouldEnable = Boolean(options.debug || rawScopes);

  if (!shouldEnable) {
    return;
  }

  const scopes =
    rawScopes && rawScopes.trim().length > 0 ? parseList(rawScopes) : DEFAULT_DEBUG_SCOPES;

  patchLoggerLevel(scopes.length > 0 ? scopes : DEFAULT_DEBUG_SCOPES);
}

function normalizeValueToken(token, queue) {
  if (token.includes("=")) {
    return token.substring(token.indexOf("=") + 1);
  }

  if (!queue.length) {
    throw new Error(`Flag "${token}" requires a value`);
  }

  return queue.shift();
}

function resolvePackageSpecs(specs, cwd) {
  const resolved = [];
  const seen = new Set();

  const effectiveSpecs = specs.length > 0 ? specs : DEFAULT_PACKAGE_IDS;

  for (const spec of effectiveSpecs) {
    const trimmed = spec.trim();

    if (!trimmed) {
      continue;
    }

    const known = PACKAGE_LOOKUP.get(trimmed);

    if (known) {
      if (!seen.has(known.packageJson)) {
        seen.add(known.packageJson);
        resolved.push({
          definition: known,
          packageJsonPath: path.resolve(cwd, known.packageJson),
        });
      }

      continue;
    }

    const candidate = trimmed.endsWith("package.json") ? trimmed : path.join(trimmed, "package.json");
    const absolutePath = path.resolve(cwd, candidate);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Unknown package spec "${spec}". Expected a known package id or a valid path to package.json.`);
    }

    const packageName = path.basename(path.dirname(absolutePath));
    const syntheticDefinition = {
      id: packageName,
      packageJson: candidate,
      packageName,
      workspace: path.dirname(candidate),
    };

    if (!seen.has(candidate)) {
      seen.add(candidate);
      resolved.push({
        definition: syntheticDefinition,
        packageJsonPath: absolutePath,
      });
    }
  }

  if (resolved.length === 0) {
    throw new Error("At least one package must be selected for release.");
  }

  return resolved;
}

function parseCliArguments(argv, cwd) {
  const queue = [...argv];
  const packageSpecs = [];
  const options = {};

  let summaryFile = process.env.RELEASE_SUMMARY_FILE
    ? path.resolve(cwd, process.env.RELEASE_SUMMARY_FILE)
    : path.resolve(cwd, "release-summary.json");

  while (queue.length) {
    let token = queue.shift();

    if (FLAG_ALIASES.has(token)) {
      token = FLAG_ALIASES.get(token);
    }

    if (token === "--") {
      continue;
    }

    if (token === "--help") {
      printHelp();
      process.exit(0);
    }

    if (token === "--packages") {
      const value = normalizeValueToken(token, queue);
      packageSpecs.push(...parseList(value));
      continue;
    }

    if (token.startsWith("--packages=")) {
      packageSpecs.push(...parseList(token.slice("--packages=".length)));
      continue;
    }

    if (token === "--summary-file") {
      const value = normalizeValueToken(token, queue);
      summaryFile = value === "false" ? null : path.resolve(cwd, value);
      continue;
    }

    if (token.startsWith("--summary-file=")) {
      const value = token.slice("--summary-file=".length);
      summaryFile = value === "false" ? null : path.resolve(cwd, value);
      continue;
    }

    if (token === "--ignore-private") {
      options.ignorePrivate = true;
      continue;
    }

    if (token === "--no-ignore-private") {
      options.ignorePrivate = false;
      continue;
    }

    if (BOOLEAN_FLAGS.has(token)) {
      options[BOOLEAN_FLAGS.get(token)] = true;
      continue;
    }

    if (token.startsWith("--no-")) {
      const positiveFlag = `--${token.slice(5)}`;
      if (BOOLEAN_FLAGS.has(positiveFlag)) {
        options[BOOLEAN_FLAGS.get(positiveFlag)] = false;
        continue;
      }
    }

    if (STRING_FLAGS.has(token)) {
      options[STRING_FLAGS.get(token)] = normalizeValueToken(token, queue);
      continue;
    }

    let handledStringFlag = false;

    for (const [flag, key] of STRING_FLAGS.entries()) {
      if (token.startsWith(`${flag}=`)) {
        options[key] = token.slice(flag.length + 1);
        handledStringFlag = true;
        break;
      }
    }

    if (handledStringFlag) {
      continue;
    }

    if (LIST_FLAGS.has(token)) {
      const value = parseList(normalizeValueToken(token, queue));
      const key = LIST_FLAGS.get(token);
      options[key] = [...(options[key] ?? []), ...value];
      continue;
    }

    let handledListFlag = false;

    for (const [flag, key] of LIST_FLAGS.entries()) {
      if (token.startsWith(`${flag}=`)) {
        const value = parseList(token.slice(flag.length + 1));
        options[key] = [...(options[key] ?? []), ...value];
        handledListFlag = true;
        break;
      }
    }

    if (handledListFlag) {
      continue;
    }

    if (NESTED_STRING_FLAGS.has(token)) {
      const value = normalizeValueToken(token, queue);
      setNestedOption(options, NESTED_STRING_FLAGS.get(token), value);
      continue;
    }

    let handledNestedFlag = false;

    for (const [flag, pathSegments] of NESTED_STRING_FLAGS.entries()) {
      if (token.startsWith(`${flag}=`)) {
        setNestedOption(options, pathSegments, token.slice(flag.length + 1));
        handledNestedFlag = true;
        break;
      }
    }

    if (handledNestedFlag) {
      continue;
    }

    throw new Error(`Unknown flag "${token}". Pass --help to see the supported options.`);
  }

  return { options, packageSpecs, summaryFile };
}

function formatReleaseSummary(packages) {
  return packages.map((pkg) => {
    const releaseResult = pkg.result || null;
    const nextRelease = releaseResult?.nextRelease ?? null;
    const githubInfo = releaseResult?.releases?.find((entry) => entry.name === "github");

    return {
      gitTag: nextRelease?.gitTag ?? null,
      name: pkg.name,
      package: pkg.manifest.name,
      released: Boolean(releaseResult),
      url: githubInfo?.url ?? null,
      version: nextRelease?.version ?? null,
    };
  });
}

async function writeSummaryFile(summaryFile, summary) {
  if (!summaryFile) {
    return;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    packages: summary,
  };

  await fsPromises.mkdir(path.dirname(summaryFile), { recursive: true });
  await fsPromises.writeFile(summaryFile, JSON.stringify(payload, null, 2));
}

async function main() {
  const cwd = process.cwd();
  const { options, packageSpecs, summaryFile } = parseCliArguments(process.argv.slice(2), cwd);

  maybeEnableVerboseMsrLogging(options);

  const resolvedPackages = resolvePackageSpecs(packageSpecs, cwd);
  const packageJsonPaths = resolvedPackages.map((pkg) => pkg.packageJsonPath);

  const releaseResults = await multiSemanticRelease(packageJsonPaths, {}, {}, options);
  const summary = formatReleaseSummary(releaseResults);

  await writeSummaryFile(summaryFile, summary);

  const releasedPackages = summary.filter((entry) => entry.released);

  if (releasedPackages.length > 0) {
    const labels = releasedPackages.map((entry) => `${entry.package}@${entry.version}`);
    // eslint-disable-next-line no-console
    console.log(`[multi-release] Published ${releasedPackages.length} package(s): ${labels.join(", ")}`);
  } else {
    // eslint-disable-next-line no-console
    console.log("[multi-release] No packages required a release.");
  }
}

try {
  await main();
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(`[multi-release] ${error.message}`);
  process.exit(1);
}
