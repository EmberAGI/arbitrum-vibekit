/**
 * Workflow Plugin Loader
 * Dynamic import of workflow plugins (ESM)
 * Supports both TypeScript (.ts) and JavaScript (.js) workflows via jiti
 */

import { resolve } from 'path';

import { createJiti } from 'jiti';

import { Logger } from '../../utils/logger.js';
import type { WorkflowPlugin } from '../../workflows/types.js';
import type { EffectiveWorkflow } from '../composers/effective-set-composer.js';

function assertWorkflowModuleHasDefault(
  value: unknown,
  modulePath: string,
): asserts value is { default: WorkflowPlugin } {
  if (!value || typeof value !== 'object' || value === null || !('default' in value)) {
    throw new Error(`Workflow module ${modulePath} does not export a default WorkflowPlugin`);
  }

  const candidate = (value as { default: unknown }).default;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`Workflow module ${modulePath} does not export a default WorkflowPlugin`);
  }
}

export interface LoadedWorkflowPlugin {
  id: string;
  plugin: WorkflowPlugin;
  source: string;
  overrides?: Record<string, unknown>;
}

export class WorkflowPluginLoader {
  private plugins = new Map<string, LoadedWorkflowPlugin>();
  private logger = Logger.getInstance('WorkflowPluginLoader');

  /**
   * Load workflow plugins from effective set
   * @param effectiveWorkflows - Array of effective workflows
   * @param basePath - Base path for resolving workflow modules
   * @returns Map of workflow ID to loaded plugin
   */
  async load(
    effectiveWorkflows: EffectiveWorkflow[],
    basePath: string,
  ): Promise<Map<string, LoadedWorkflowPlugin>> {
    for (const workflow of effectiveWorkflows) {
      if (!workflow.entry.enabled) {
        this.logger.info(`Skipping disabled workflow: ${workflow.id}`);
        continue;
      }

      try {
        await this.loadPlugin(workflow, basePath);
      } catch (error) {
        this.logger.error(`Failed to load workflow plugin ${workflow.id}`, error);
        throw error;
      }
    }

    return this.plugins;
  }

  /**
   * Load a single workflow plugin
   * @param workflow - Effective workflow
   * @param basePath - Base path for resolving module
   */
  private async loadPlugin(workflow: EffectiveWorkflow, basePath: string): Promise<void> {
    const modulePath = resolve(basePath, workflow.entry.from);

    try {
      this.logger.debug(`Loading workflow plugin: ${workflow.id}`, { path: modulePath });

      // Use jiti for dynamic import - handles both .ts and .js files
      const jiti = createJiti(import.meta.url, {
        interopDefault: true,
      });

      const module = await jiti.import(modulePath);

      // Check if module has a default export
      assertWorkflowModuleHasDefault(module, workflow.entry.from);

      const plugin = module.default;

      // Validate plugin structure
      if (!plugin.id || !plugin.name || !plugin.execute) {
        throw new Error(
          `Invalid workflow plugin ${workflow.id}: missing required fields (id, name, execute). Ensure the module exports a default WorkflowPlugin.`,
        );
      }

      // Verify ID matches
      if (plugin.id !== workflow.id) {
        this.logger.warn(
          `Workflow plugin ID mismatch: expected ${workflow.id}, got ${plugin.id}. Using registry ID.`,
        );
      }

      this.plugins.set(workflow.id, {
        id: workflow.id,
        plugin,
        source: modulePath,
        overrides: workflow.overrides,
      });

      this.logger.info(`Loaded workflow plugin: ${workflow.id}`, {
        name: plugin.name,
        version: plugin.version,
        path: modulePath,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load workflow plugin from ${modulePath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Reload a specific plugin (for hot reload)
   * @param workflowId - Workflow ID to reload
   * @param workflow - Effective workflow
   * @param basePath - Base path for resolving module
   */
  async reload(workflowId: string, workflow: EffectiveWorkflow, basePath: string): Promise<void> {
    // Remove from cache if exists
    this.plugins.delete(workflowId);

    // Reload
    await this.loadPlugin(workflow, basePath);
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): Map<string, LoadedWorkflowPlugin> {
    return this.plugins;
  }

  /**
   * Get plugin by ID
   */
  getPlugin(id: string): LoadedWorkflowPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Remove a plugin from the loader cache
   */
  remove(id: string): void {
    this.plugins.delete(id);
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.plugins.clear();
  }
}
