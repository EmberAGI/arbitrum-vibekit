/**
 * CLI Command: agent workflow discover
 * Discover workflows in the filesystem and optionally sync workflow.json
 */

import { writeFileSync } from 'fs';
import { resolve, relative } from 'path';

import {
  discoverWorkflows,
  discoveredToWorkflowEntries,
} from '../../config/loaders/workflow-discovery.js';
import { loadWorkflowRegistry } from '../../config/loaders/workflow-loader.js';
import { resolveConfigDirectory } from '../../config/runtime/config-dir.js';
import type { WorkflowEntry } from '../../config/schemas/workflow.schema.js';
import { cliOutput } from '../output.js';

export interface WorkflowDiscoverOptions {
  configDir?: string;
  sync?: boolean;
  dryRun?: boolean;
  prune?: boolean;
  disabled?: boolean;
}

export function workflowDiscoverCommand(
  options: WorkflowDiscoverOptions = {},
): void {
  const { configDir } = resolveConfigDirectory(options.configDir);
  const workflowsDir = resolve(configDir, 'workflows');
  const workflowRegistryPath = resolve(configDir, 'workflow.json');

  const discovered = discoverWorkflows(workflowsDir);
  const discoveredEntries = discoveredToWorkflowEntries(discovered);

  cliOutput.info(
    `Discovered ${discoveredEntries.length} workflow(s) under \`${relative(process.cwd(), workflowsDir)}\``,
  );

  if (!options.sync) {
    // Just print what was found
    for (const entry of discoveredEntries) {
      cliOutput.print(`- id=\`${entry.id}\` from=\`${entry.from}\``);
    }
    return;
  }

  // Load current registry and compute proposed changes
  const { registry } = loadWorkflowRegistry(workflowRegistryPath);
  const existingById = new Map<string, WorkflowEntry>(registry.workflows.map((w) => [w.id, w]));
  const discoveredById = new Map<string, WorkflowEntry>(discoveredEntries.map((w) => [w.id, w]));

  const additions: WorkflowEntry[] = [];
  // By default, retain all existing entries; we only remove with --prune
  const retained: WorkflowEntry[] = Array.from(existingById.values());
  const removals: WorkflowEntry[] = [];

  // Propose additions (new ids from discovery)
  for (const [id, entry] of discoveredById.entries()) {
    if (!existingById.has(id)) {
      additions.push({
        id,
        from: entry.from,
        enabled: options.disabled ? false : true,
      });
    } else {
      retained.push(existingById.get(id)!);
    }
  }

  // Propose removals if prune is enabled (entries present in registry but not on disk)
  if (options.prune) {
    for (const [id, entry] of existingById.entries()) {
      if (!discoveredById.has(id)) {
        removals.push(entry);
      }
    }
  }

  if (options.dryRun) {
    if (additions.length === 0 && removals.length === 0) {
      cliOutput.info('No changes required.');
      return;
    }
    if (additions.length > 0) {
      cliOutput.print('Additions:', 'cyan');
      for (const a of additions) {
        cliOutput.print(`  + id=\`${a.id}\` from=\`${a.from}\` enabled=${a.enabled !== false}`);
      }
    }
    if (removals.length > 0) {
      cliOutput.print('Removals:', 'magenta');
      for (const r of removals) {
        cliOutput.print(`  - id=\`${r.id}\` from=\`${r.from}\``);
      }
    }
    return;
  }

  // Apply changes
  const next: WorkflowEntry[] = [];
  // Keep all retained; if prune, drop those marked for removal
  const removalSet = new Set(removals.map((r) => r.id));
  for (const entry of retained) {
    if (!options.prune || !removalSet.has(entry.id)) {
      next.push(entry);
    }
  }
  // Add new ones
  for (const entry of additions) {
    next.push(entry);
  }
  // Optionally drop removed ones (implicit by not adding them)

  // Stable sort by id
  next.sort((a, b) => a.id.localeCompare(b.id));

  // Write back to registry
  const serialized = JSON.stringify({ workflows: next }, null, 2);
  writeFileSync(workflowRegistryPath, serialized, 'utf-8');

  cliOutput.success(
    `Synchronized workflow registry at \`${relative(process.cwd(), workflowRegistryPath)}\``,
  );
  cliOutput.info(`Added: ${additions.length}, Removed: ${removals.length}, Total: ${next.length}`);
}
