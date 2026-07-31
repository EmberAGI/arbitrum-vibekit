#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PACKAGE_DEFINITIONS = [
  {
    id: 'agent-node',
    packageJson: 'lib/agent-node/package.json',
    packageName: '@emberai/agent-node',
    tagPattern: '@emberai/agent-node@*',
    workspace: 'lib/agent-node',
  },
  {
    id: 'registry',
    packageJson: 'onchain-actions-plugins/registry/package.json',
    packageName: '@emberai/onchain-actions-registry',
    tagPattern: '@emberai/onchain-actions-registry@*',
    workspace: 'onchain-actions-plugins/registry',
  },
  {
    id: 'contracts',
    packageJson: 'onchain-actions-plugins/contracts/package.json',
    packageName: '@emberai/onchain-actions-contracts',
    tagPattern: '@emberai/onchain-actions-contracts@*',
    workspace: 'onchain-actions-plugins/contracts',
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
const STABLE_BRANCHES = new Set(['main']);
const DEPENDENCY_SCOPES = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function parseList(value) {
  return value
    .split(LIST_DELIMITER)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });

  if (result.status !== 0) {
    return { error: result.stderr.trim() };
  }

  return { output: result.stdout.trim() };
}

function extractVersionFromTag(tag) {
  const lastAt = tag.lastIndexOf('@');

  if (lastAt === -1) {
    return tag;
  }

  return tag.slice(lastAt + 1);
}

function isStableTag(tag) {
  const version = extractVersionFromTag(tag);
  return !version.includes('-');
}

function findLatestTag(pattern, cwd, options = {}) {
  const { output, error } = runGit(
    ['tag', '--merged', 'HEAD', '--sort=-creatordate', '--list', pattern],
    cwd,
  );

  if (error || !output) {
    return null;
  }

  const tags = output
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (!tags.length) {
    return null;
  }

  if (!options.filter) {
    return tags[0];
  }

  return tags.find(options.filter) ?? null;
}

function detectChanges(sinceTag, targetPath, cwd) {
  if (!sinceTag) {
    return true;
  }

  const { output, error } = runGit(
    ['diff', `${sinceTag}..HEAD`, '--name-only', '--', targetPath],
    cwd,
  );

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

function resolveBranchName(cwd) {
  const simulateBranch = process.env.RELEASE_SIMULATE_BRANCH?.trim();
  if (simulateBranch) {
    return simulateBranch;
  }

  const githubRefName = process.env.GITHUB_REF_NAME?.trim();
  if (githubRefName) {
    return githubRefName;
  }

  const githubRef = process.env.GITHUB_REF?.trim();
  if (githubRef?.startsWith('refs/heads/')) {
    return githubRef.slice('refs/heads/'.length);
  }

  const { output } = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (output && output !== 'HEAD') {
    return output;
  }

  return null;
}

function resolveReleaseChannel(branchName) {
  const override = process.env.RELEASE_CHANNEL?.trim()?.toLowerCase();
  if (override === 'stable' || override === 'next') {
    return override;
  }

  if (branchName && (STABLE_BRANCHES.has(branchName) || branchName.startsWith('release/'))) {
    return 'stable';
  }

  return 'next';
}

async function expandSelectedWithLocalDependents(packages, cwd) {
  const selectedIds = new Set(packages.filter((pkg) => pkg.changed).map((pkg) => pkg.id));
  const packageNamesById = new Map(packages.map((pkg) => [pkg.id, pkg.name]));
  const manifestsById = new Map();

  for (const pkg of packages) {
    const manifest = JSON.parse(
      await fs.readFile(path.resolve(cwd, pkg.packageJson), 'utf8'),
    );
    manifestsById.set(pkg.id, manifest);
  }

  let expanded = true;

  while (expanded) {
    expanded = false;
    const selectedNames = new Set(
      [...selectedIds].map((id) => packageNamesById.get(id)).filter(Boolean),
    );

    for (const pkg of packages) {
      if (selectedIds.has(pkg.id)) {
        continue;
      }

      const manifest = manifestsById.get(pkg.id) ?? {};
      const dependencyNames = DEPENDENCY_SCOPES.flatMap((scope) =>
        Object.keys(manifest[scope] ?? {}),
      );

      if (dependencyNames.some((name) => selectedNames.has(name))) {
        selectedIds.add(pkg.id);
        expanded = true;
      }
    }
  }

  return selectedIds;
}

async function main() {
  const cwd = process.cwd();
  const argv = process.argv.slice(2);
  const packageSpecs = [];
  let outputPath = path.resolve(cwd, 'release-targets.json');

  while (argv.length) {
    const token = argv.shift();

    if (token === '--packages') {
      packageSpecs.push(...parseList(argv.shift() ?? ''));
      continue;
    }

    if (token?.startsWith('--packages=')) {
      packageSpecs.push(...parseList(token.slice('--packages='.length)));
      continue;
    }

    if (token === '--output') {
      outputPath = path.resolve(cwd, argv.shift() ?? '');
      continue;
    }

    if (token?.startsWith('--output=')) {
      outputPath = path.resolve(cwd, token.slice('--output='.length));
      continue;
    }

    throw new Error(`Unknown flag "${token}". Supported flags: --packages, --output.`);
  }

  const overrideSpecs =
    process.env.RELEASE_PACKAGE_OVERRIDE && process.env.RELEASE_PACKAGE_OVERRIDE.trim().length > 0
      ? parseList(process.env.RELEASE_PACKAGE_OVERRIDE)
      : [];
  const forcedIds = new Set(overrideSpecs.map((spec) => resolvePackageList([spec])[0].id));

  const packagesToCheck = resolvePackageList(
    packageSpecs.length > 0 ? packageSpecs : PACKAGE_DEFINITIONS.map((pkg) => pkg.id),
  );
  const branchName = resolveBranchName(cwd);
  const releaseChannel = resolveReleaseChannel(branchName);
  const preferStableTags = releaseChannel === 'stable';

  const packages = [];

  for (const pkg of packagesToCheck) {
    const latestTag = findLatestTag(pkg.tagPattern, cwd, {
      filter: preferStableTags ? isStableTag : undefined,
    });
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

  const selectedIds = await expandSelectedWithLocalDependents(packages, cwd);
  const selected = packages.filter((pkg) => selectedIds.has(pkg.id)).map((pkg) => pkg.id);
  const matrix = packages
    .filter((pkg) => selectedIds.has(pkg.id))
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
