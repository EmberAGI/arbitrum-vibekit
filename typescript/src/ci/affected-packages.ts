import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { globSync } from "glob";
import yaml from "js-yaml";

export interface WorkspacePackage {
  name: string;
  rootRelativeDir: string;
  workspaceDependencies: string[];
}

export interface ResolveAffectedPackagesOptions {
  changedFiles: string[];
  globalInvalidators: string[];
  ignoredPaths?: string[];
  packages: WorkspacePackage[];
}

export interface AffectedPackagesResult {
  scope: "full" | "partial" | "none";
  selectedPackageNames: string[];
}

export interface DetectAffectedPackagesOptions {
  changedFiles: string[];
  globalInvalidators?: string[];
  ignoredPaths?: string[];
  workspaceRoot: string;
}

export interface DetectAffectedPackagesResult extends AffectedPackagesResult {
  selectedPackageDirs: string[];
}

export interface ChangedFilesFromGitOptions {
  baseRef: string;
  headRef?: string;
  workspaceRoot: string;
}

interface PackageManifest {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface WorkspaceFile {
  packages?: string[];
}

const execFileAsync = promisify(execFile);

export const DEFAULT_GLOBAL_INVALIDATORS = [
  ".github/workflows/ci.yml",
  "eslint.config.js",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "tsconfig.json",
  "vitest.config.ts",
  "patches/",
  "clients/web-ag-ui/patches/",
];

export const DEFAULT_IGNORED_PATHS = [
  "README.md",
  "docs/",
  "img/",
  ".agent/",
];

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

function normalizePathRule(rule: string): string {
  const usesPrefixMatch = rule.endsWith("/") || rule.endsWith("\\");
  const normalized = normalizePath(rule);

  return usesPrefixMatch ? `${normalized}/` : normalized;
}

function relativizeToWorkspaceRoot(changedFile: string, workspaceRootRelativePath: string): string {
  if (workspaceRootRelativePath.length === 0) {
    return changedFile;
  }

  const workspacePrefix = `${workspaceRootRelativePath}/`;

  if (changedFile.startsWith(workspacePrefix)) {
    return changedFile.slice(workspacePrefix.length);
  }

  return changedFile;
}

function isWithinPackage(changedFile: string, rootRelativeDir: string): boolean {
  if (rootRelativeDir === "") {
    return true;
  }

  return changedFile === rootRelativeDir || changedFile.startsWith(`${rootRelativeDir}/`);
}

function matchesPathRule(changedFile: string, rule: string): boolean {
  return rule.endsWith("/")
    ? changedFile.startsWith(rule)
    : changedFile === rule;
}

function collectManifestDependencyNames(manifest: PackageManifest): string[] {
  const dependencyGroups = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
  ];

  return dependencyGroups.flatMap((group) => Object.keys(group ?? {}));
}

export async function listChangedFilesFromGit(
  options: ChangedFilesFromGitOptions,
): Promise<string[]> {
  const headRef = options.headRef ?? "HEAD";
  const { stdout: repoRootStdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
    cwd: options.workspaceRoot,
  });
  const repoRoot = await realpath(repoRootStdout.trim());
  const workspaceRoot = await realpath(options.workspaceRoot);
  const workspaceRootRelativePath = normalizePath(path.relative(repoRoot, workspaceRoot));
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", `${options.baseRef}...${headRef}`],
    {
      cwd: options.workspaceRoot,
    },
  );

  return stdout
    .split(/\r?\n/u)
    .map(normalizePath)
    .map((changedFile) => relativizeToWorkspaceRoot(changedFile, workspaceRootRelativePath))
    .filter((changedFile) => changedFile.length > 0);
}

export async function discoverWorkspacePackages(workspaceRoot: string): Promise<WorkspacePackage[]> {
  const workspaceFilePath = path.join(workspaceRoot, "pnpm-workspace.yaml");
  const workspaceFileContents = await readFile(workspaceFilePath, "utf8");
  const workspaceFile = yaml.load(workspaceFileContents) as WorkspaceFile;
  const packagePatterns = workspaceFile.packages ?? [];
  const rootPackageJsonPaths = globSync("package.json", {
    absolute: true,
    cwd: workspaceRoot,
    nodir: true,
    posix: false,
  });

  const packageJsonPaths = packagePatterns.flatMap((pattern) =>
    globSync(path.posix.join(pattern, "package.json"), {
      absolute: true,
      cwd: workspaceRoot,
      nodir: true,
      posix: false,
    }),
  );
  const uniquePackageJsonPaths = [...new Set([...rootPackageJsonPaths, ...packageJsonPaths])];

  const manifests = await Promise.all(
    uniquePackageJsonPaths.map(async (packageJsonPath) => {
      const manifestContents = await readFile(packageJsonPath, "utf8");
      const manifest = JSON.parse(manifestContents) as PackageManifest;
      const name = manifest.name;

      if (!name) {
        return null;
      }

      return {
        manifest,
        name,
        rootRelativeDir: normalizePath(path.relative(workspaceRoot, path.dirname(packageJsonPath))),
      };
    }),
  );

  const workspacePackages = manifests.filter((pkg): pkg is NonNullable<typeof pkg> => pkg !== null);
  const workspacePackageNames = new Set(workspacePackages.map((pkg) => pkg.name));

  return workspacePackages
    .map((pkg) => ({
      name: pkg.name,
      rootRelativeDir: pkg.rootRelativeDir,
      workspaceDependencies: collectManifestDependencyNames(pkg.manifest)
        .filter((dependencyName) => workspacePackageNames.has(dependencyName))
        .sort(),
    }))
    .sort((left, right) => left.rootRelativeDir.localeCompare(right.rootRelativeDir));
}

export function resolveAffectedPackages(
  options: ResolveAffectedPackagesOptions,
): AffectedPackagesResult {
  const normalizedPackages = options.packages.map((pkg) => ({
    ...pkg,
    rootRelativeDir: normalizePath(pkg.rootRelativeDir),
  }));
  const ignoredPaths = new Set((options.ignoredPaths ?? []).map(normalizePathRule));
  const globalInvalidators = [...new Set(options.globalInvalidators.map(normalizePathRule))];
  const changedFiles = options.changedFiles
    .map(normalizePath)
    .filter((changedFile) => ![...ignoredPaths].some((rule) => matchesPathRule(changedFile, rule)));

  if (changedFiles.some((changedFile) => globalInvalidators.some((rule) => matchesPathRule(changedFile, rule)))) {
    return {
      scope: "full",
      selectedPackageNames: normalizedPackages.map((pkg) => pkg.name).sort(),
    };
  }

  const directlyChangedPackages = new Set<string>();

  for (const changedFile of changedFiles) {
    const owningPackage = normalizedPackages
      .filter((pkg) => isWithinPackage(changedFile, pkg.rootRelativeDir))
      .sort((left, right) => right.rootRelativeDir.length - left.rootRelativeDir.length)[0];

    if (owningPackage) {
      directlyChangedPackages.add(owningPackage.name);
    }
  }

  if (directlyChangedPackages.size === 0) {
    return {
      scope: "none",
      selectedPackageNames: [],
    };
  }

  const dependentsByPackage = new Map<string, string[]>();

  for (const pkg of normalizedPackages) {
    for (const dependency of pkg.workspaceDependencies) {
      const dependents = dependentsByPackage.get(dependency) ?? [];
      dependents.push(pkg.name);
      dependentsByPackage.set(dependency, dependents);
    }
  }

  const selectedPackageNames = new Set(directlyChangedPackages);
  const queue = [...directlyChangedPackages];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const dependents = dependentsByPackage.get(current) ?? [];

    for (const dependent of dependents) {
      if (!selectedPackageNames.has(dependent)) {
        selectedPackageNames.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return {
    scope: "partial",
    selectedPackageNames: [...selectedPackageNames].sort(),
  };
}

export async function detectAffectedPackages(
  options: DetectAffectedPackagesOptions,
): Promise<DetectAffectedPackagesResult> {
  const packages = await discoverWorkspacePackages(options.workspaceRoot);
  const result = resolveAffectedPackages({
    changedFiles: options.changedFiles,
    globalInvalidators: options.globalInvalidators ?? DEFAULT_GLOBAL_INVALIDATORS,
    ignoredPaths: options.ignoredPaths ?? DEFAULT_IGNORED_PATHS,
    packages,
  });
  const selectedPackages =
    result.scope === "full"
      ? packages
      : packages.filter((pkg) => result.selectedPackageNames.includes(pkg.name));

  return {
    ...result,
    selectedPackageDirs: selectedPackages.map((pkg) => pkg.rootRelativeDir).sort(),
  };
}
