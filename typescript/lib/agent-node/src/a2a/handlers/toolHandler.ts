/**
 * Tool handling for A2A Agent Executor
 */

import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { Tool } from 'ai';

import type { AIService } from '../../ai/service.js';
import { Logger } from '../../utils/logger.js';

import type { WorkflowHandler } from './workflowHandler.js';

/**
 * Handles tool-related operations for the agent executor
 */
export class ToolHandler {
  private logger: Logger;

  constructor(
    private ai: AIService,
    private workflowHandler?: WorkflowHandler,
  ) {
    this.logger = Logger.getInstance('ToolHandler');
  }

  /**
   * Gets available tools as a map for the AI SDK
   */
  getAvailableToolsAsMap(): Record<string, Tool> {
    const tools: Record<string, Tool> = {};

    // Get tools from AI service (already in tool format)
    if (this.ai?.availableTools instanceof Map) {
      this.ai.availableTools.forEach((tool: unknown, name: string) => {
        tools[name] = tool as Tool;
      });
    }
    this.logger.debug('getAvailableToolsAsMap', { tools: Object.keys(tools) });

    return tools;
  }

  /**
   * Creates a tools bundle for the AI SDK
   */
  createToolsBundle(
    contextId: string,
    eventBus: ExecutionEventBus,
  ): {
    tools: Record<string, Tool>;
  } {
    const baseTools = this.ai?.getToolsAsRecord?.() ?? this.getAvailableToolsAsMap();

    const toolsWithExecutors: Record<string, Tool> = {};

    for (const [toolName, toolDefinition] of Object.entries(baseTools)) {
      const tool = toolDefinition;
      if (this.workflowHandler && !tool.execute && toolName.startsWith('dispatch_workflow_')) {
        toolsWithExecutors[toolName] = {
          ...tool,
          execute: async (args: unknown) => {
            this.logger.debug('Executing workflow dispatch inline', { toolName, contextId });
            return this.workflowHandler!.dispatchWorkflow(toolName, args, eventBus);
          },
        };
      } else {
        toolsWithExecutors[toolName] = tool;
      }
    }

    return {
      tools: toolsWithExecutors,
    };
  }
}
