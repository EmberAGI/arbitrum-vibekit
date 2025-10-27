/**
 * Central registry for all tools available to the AI
 */

import type { Tool } from 'ai';

import { Logger } from '../../utils/logger.js';
import type { MCPClientManager } from '../clients/MCPClientManager.js';

import type { WorkflowToolManager } from './WorkflowToolManager.js';

/**
 * Manages the central registry of all available tools
 */
export class ToolRegistry {
  private logger: Logger;
  private availableTools: Map<string, Tool> = new Map();

  constructor(
    private mcpManager?: MCPClientManager,
    private workflowManager?: WorkflowToolManager,
  ) {
    this.logger = Logger.getInstance('ToolRegistry');
  }

  /**
   * Update the registry with tools from all managers
   */
  updateRegistry(): void {
    this.availableTools.clear();

    // Add MCP tools
    if (this.mcpManager) {
      const mcpTools = this.mcpManager.getTools();
      mcpTools.forEach((tool, name) => {
        this.availableTools.set(name, tool);
      });
    }

    // Add workflow tools
    if (this.workflowManager) {
      const workflowTools = this.workflowManager.getTools();
      workflowTools.forEach((tool, name) => {
        this.availableTools.set(name, tool);
      });
    }

    this.logger.debug('Tool registry updated', {
      count: this.availableTools.size,
      tools: Array.from(this.availableTools.keys()),
    });
  }

  /**
   * Get all available tools
   */
  getAllTools(): Map<string, Tool> {
    return this.availableTools;
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.availableTools.keys());
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): Tool | undefined {
    return this.availableTools.get(name);
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.availableTools.has(name);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, args: unknown): Promise<unknown> {
    const tool = this.availableTools.get(toolName);

    const toolWithExecute = tool as { execute?: (args: unknown) => Promise<unknown> } | undefined;
    if (toolWithExecute?.execute) {
      return await toolWithExecute.execute(args);
    }

    // Try MCP tools
    if (this.mcpManager?.isMCPTool(toolName)) {
      return await this.mcpManager.executeTool(toolName, args);
    }

    // Try workflow tools
    if (this.workflowManager?.isWorkflowTool(toolName)) {
      return await this.workflowManager.executeWorkflow(toolName, args);
    }

    throw new Error(`Unknown tool: ${toolName}`);
  }

  /**
   * Create a tools bundle for AI SDK calls
   */
  createToolsBundle(): {
    tools: Record<string, Tool>;
    onToolCall: (name: string, args: unknown) => Promise<unknown>;
  } {
    const tools: Record<string, Tool> = Object.fromEntries(this.availableTools);

    const onToolCall = async (name: string, args: unknown): Promise<unknown> => {
      this.logger.debug('onToolCall', { name, hasArgs: !!args });
      return await this.executeTool(name, args);
    };

    return { tools, onToolCall };
  }
}
