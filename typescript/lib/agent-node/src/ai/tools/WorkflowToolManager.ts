/**
 * Manages workflow-related tools for the AI
 */

import type { Tool } from 'ai';
import { z } from 'zod';

import { Logger } from '../../utils/logger.js';
import { workflowToCoreTools } from '../adapters.js';

export interface WorkflowRuntime {
  listPlugins?: () => string[];
  getToolMetadata?: (name: string) => { description: string; inputSchema?: unknown };
  dispatch?: (
    id: string,
    args: unknown,
  ) => {
    waitForCompletion?: () => Promise<void>;
    error?: unknown;
    result?: unknown;
    id: string;
    state: string;
  };
}

/**
 * Manages workflow tools and their execution
 */
export class WorkflowToolManager {
  private logger: Logger;
  private workflowTools: Map<string, Tool> = new Map();
  private workflowRuntime: WorkflowRuntime | undefined;

  constructor() {
    this.logger = Logger.getInstance('WorkflowToolManager');
  }

  /**
   * Set the workflow runtime and load tools
   */
  setRuntime(runtime: unknown): void {
    this.logger.debug('Setting workflow runtime');
    this.workflowRuntime = runtime as WorkflowRuntime | undefined;
    this.loadWorkflowTools();
  }

  /**
   * Load tools from the workflow runtime
   */
  private loadWorkflowTools(): void {
    if (!this.workflowRuntime?.listPlugins) {
      return;
    }

    const plugins = this.workflowRuntime.listPlugins();
    this.logger.debug('Loading workflow plugins', { plugins });

    for (const pluginId of plugins) {
      const toolName = `dispatch_workflow_${pluginId}`;

      // Get tool metadata from runtime
      const meta = this.workflowRuntime.getToolMetadata?.(toolName);
      const description = meta?.description || `Dispatch ${pluginId} workflow`;

      // Use the Zod schema from metadata or default to permissive object
      const zodSchema =
        (meta?.inputSchema as z.ZodObject<Record<string, z.ZodTypeAny>> | undefined) ||
        z.object({}).catchall(z.unknown());

      // Create schema-only tool (no execute function)
      // Workflow dispatch is handled by StreamProcessor
      const coreTool = workflowToCoreTools(pluginId, description, zodSchema);
      this.workflowTools.set(toolName, coreTool);
      this.logger.info('Registered workflow tool', { tool: toolName, description });
    }
  }

  /**
   * Get all workflow tools
   */
  getTools(): Map<string, Tool> {
    return this.workflowTools;
  }

  /**
   * Execute a workflow tool
   */
  async executeWorkflow(toolName: string, args: unknown): Promise<unknown> {
    if (!this.workflowRuntime?.dispatch) {
      throw new Error('Workflow runtime not available');
    }

    const pluginId = toolName.replace('dispatch_workflow_', '');
    const start = Date.now();
    const execution = this.workflowRuntime.dispatch(pluginId, args ?? {});
    await execution.waitForCompletion?.();

    if (execution.error) {
      throw new Error(
        execution.error instanceof Error
          ? execution.error.message
          : typeof execution.error === 'string'
            ? execution.error
            : JSON.stringify(execution.error),
      );
    }

    const result = execution.result ?? { id: execution.id, state: execution.state };
    this.logger.debug('Workflow completed', { tool: toolName, ms: Date.now() - start });
    return result;
  }

  /**
   * Check if a tool is a workflow tool
   */
  isWorkflowTool(toolName: string): boolean {
    return toolName.startsWith('dispatch_workflow_');
  }
}
