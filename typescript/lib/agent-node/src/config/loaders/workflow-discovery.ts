/**
 * Workflow Discovery
 * Discovers workflows from filesystem directories
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import type { WorkflowEntry } from '../schemas/workflow.schema.js';

export interface DiscoveredWorkflow {
  id: string;
  from: string;
  enabled: boolean;
  hasPackageJson: boolean;
  absolutePath: string;
}

/**
 * Check if a directory is a workflow directory
 * @param dirPath - Absolute path to directory
 * @returns true if directory has a valid workflow entry point
 */
function isWorkflowDirectory(dirPath: string): boolean {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
    return false;
  }

  // Check for valid entry points
  const entryPoints = [
    'index.ts',
    'index.js',
    'workflow.ts',
    'workflow.js',
    join('src', 'index.ts'),
    join('src', 'index.js'),
  ];

  // Check for package.json with main field
  const packageJsonPath = join(dirPath, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
        main?: string;
      };
      if (packageJson.main) {
        const mainPath = join(dirPath, packageJson.main);
        if (existsSync(mainPath)) {
          return true;
        }
      }
    } catch {
      // Invalid package.json, continue checking other entry points
    }
  }

  // Check standard entry points
  return entryPoints.some((entry) => existsSync(join(dirPath, entry)));
}

/**
 * Find the entry point file for a workflow directory
 * Resolution order: package.json main → index.ts → workflow.ts → src/index.ts
 * @param workflowDir - Absolute path to workflow directory
 * @returns Relative path to entry file from workflow directory, or null if not found
 */
export function findWorkflowEntryPoint(workflowDir: string): string | null {
  // Check package.json main field first
  const packageJsonPath = join(workflowDir, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
        main?: string;
      };
      if (packageJson.main) {
        const mainPath = join(workflowDir, packageJson.main);
        if (existsSync(mainPath)) {
          return packageJson.main;
        }
      }
    } catch {
      // Invalid package.json, continue with standard entry points
    }
  }

  // Check standard entry points
  const standardEntryPoints = [
    'index.ts',
    'index.js',
    'workflow.ts',
    'workflow.js',
    join('src', 'index.ts'),
    join('src', 'index.js'),
  ];

  for (const entry of standardEntryPoints) {
    if (existsSync(join(workflowDir, entry))) {
      return entry;
    }
  }

  return null;
}

/**
 * Check if a workflow directory has a package.json
 * @param workflowDir - Absolute path to workflow directory
 * @returns true if directory contains package.json
 */
export function hasPackageJson(workflowDir: string): boolean {
  return existsSync(join(workflowDir, 'package.json'));
}

/**
 * Discover workflows from a workflows directory
 * @param workflowsDir - Absolute path to workflows directory
 * @returns Array of discovered workflows
 */
export function discoverWorkflows(workflowsDir: string): DiscoveredWorkflow[] {
  if (!existsSync(workflowsDir) || !statSync(workflowsDir).isDirectory()) {
    return [];
  }

  const discovered: DiscoveredWorkflow[] = [];
  const entries = readdirSync(workflowsDir);

  for (const entry of entries) {
    const entryPath = join(workflowsDir, entry);
    const stat = statSync(entryPath);

    // Only process directories
    if (!stat.isDirectory()) {
      continue;
    }

    // Check if this is a valid workflow directory
    if (!isWorkflowDirectory(entryPath)) {
      continue;
    }

    const entryPoint = findWorkflowEntryPoint(entryPath);
    if (!entryPoint) {
      continue;
    }

    // Use directory name as workflow ID
    const workflowId = entry;

    discovered.push({
      id: workflowId,
      from: join('workflows', entry, entryPoint),
      enabled: true,
      hasPackageJson: hasPackageJson(entryPath),
      absolutePath: entryPath,
    });
  }

  return discovered;
}

/**
 * Get installable workflows (those with package.json)
 * @param workflowsDir - Absolute path to workflows directory
 * @returns Array of discovered workflows that can be installed
 */
export function getInstallableWorkflows(workflowsDir: string): DiscoveredWorkflow[] {
  return discoverWorkflows(workflowsDir).filter((workflow) => workflow.hasPackageJson);
}

/**
 * Convert discovered workflows to workflow entries
 * @param discovered - Array of discovered workflows
 * @returns Array of workflow entries
 */
export function discoveredToWorkflowEntries(discovered: DiscoveredWorkflow[]): WorkflowEntry[] {
  return discovered.map((workflow) => ({
    id: workflow.id,
    from: workflow.from,
    enabled: workflow.enabled,
  }));
}

/**
 * Merge discovered workflows with registry workflows
 * Registry workflows take precedence over discovered ones
 * @param registryWorkflows - Workflows from workflow.json
 * @param discovered - Discovered workflows from filesystem
 * @returns Merged array of workflow entries
 */
export function mergeWorkflows(
  registryWorkflows: WorkflowEntry[],
  discovered: DiscoveredWorkflow[],
): WorkflowEntry[] {
  const merged = new Map<string, WorkflowEntry>();

  // Add discovered workflows first
  for (const workflow of discovered) {
    merged.set(workflow.id, {
      id: workflow.id,
      from: workflow.from,
      enabled: workflow.enabled,
    });
  }

  // Registry workflows override discovered ones
  for (const workflow of registryWorkflows) {
    merged.set(workflow.id, workflow);
  }

  return Array.from(merged.values());
}
