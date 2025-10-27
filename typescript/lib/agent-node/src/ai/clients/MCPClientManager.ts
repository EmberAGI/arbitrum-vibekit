/**
 * Manages MCP (Model Context Protocol) client connections and tools
 */

import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from 'ai';

import { Logger } from '../../utils/logger.js';
import { createCoreToolFromMCP } from '../adapters.js';

/**
 * Manages MCP client lifecycle and tool loading
 */
export class MCPClientManager {
  private logger: Logger;
  private mcpClient: MCPClient | undefined;
  private mcpTools: Map<string, Tool> = new Map();

  private constructor() {
    this.logger = Logger.getInstance('MCPClientManager');
  }

  /**
   * Create a new MCPClientManager instance with async initialization
   * @param mcpServerUrl - Optional MCP server URL
   * @returns Promise resolving to fully initialized MCPClientManager
   */
  static async create(mcpServerUrl?: string): Promise<MCPClientManager> {
    const manager = new MCPClientManager();

    if (!mcpServerUrl) {
      return manager;
    }

    const transport = new StreamableHTTPClientTransport(new URL(mcpServerUrl));
    manager.mcpClient = new MCPClient({ name: 'no-context-agent', version: '0.1.0' });

    try {
      await manager.mcpClient.connect(transport);
      await manager.loadMCPTools();
    } catch (error) {
      // Intentionally no fallback per requirements
      manager.logger.debug('MCP initialization failed', { error });
    }

    return manager;
  }

  /**
   * Load tools from MCP server
   */
  private async loadMCPTools(): Promise<void> {
    if (!this.mcpClient) {
      return;
    }

    this.logger.debug('MCP: listing tools');
    const { tools } = await this.mcpClient.listTools();
    this.logger.debug('MCP: tools discovered', { tools: tools.map((t) => t.name) });

    for (const t of tools) {
      const aiTool = createCoreToolFromMCP(
        t.name,
        t.description || t.name,
        t.inputSchema,
        async (args: unknown) => {
          this.logger.debug('MCP: executing tool', {
            tool: t.name,
            hasArgs: !!args,
          });
          const start = Date.now();
          try {
            const result = await this.mcpClient!.callTool({
              name: t.name,
              arguments: (args ?? {}) as Record<string, unknown>,
            });
            this.logger.debug('MCP: tool result', {
              tool: t.name,
              ms: Date.now() - start,
              hasStructured: !!(result as { structuredContent?: unknown }).structuredContent,
            });
            return result;
          } catch (err) {
            this.logger.error('MCP: tool error', err, { tool: t.name });
            throw err;
          }
        },
      );
      this.mcpTools.set(t.name, aiTool);
    }
  }

  /**
   * Get all MCP tools
   */
  getTools(): Map<string, Tool> {
    return this.mcpTools;
  }

  /**
   * Execute an MCP tool
   */
  async executeTool(toolName: string, args: unknown): Promise<unknown> {
    if (!this.mcpClient) {
      throw new Error('MCP client not initialized');
    }

    const start = Date.now();
    const result = await this.mcpClient.callTool({
      name: toolName,
      arguments: (args ?? {}) as Record<string, unknown>,
    });
    this.logger.debug('MCP tool executed', {
      tool: toolName,
      ms: Date.now() - start,
    });

    return (
      (result as { structuredContent?: unknown }).structuredContent ??
      (result as { content?: unknown }).content ??
      (result as { data?: unknown })['data'] ??
      result
    );
  }

  /**
   * Check if a tool is an MCP tool
   */
  isMCPTool(toolName: string): boolean {
    return toolName.startsWith('gmx_');
  }

  /**
   * Get the MCP client instance
   */
  getClient(): MCPClient | undefined {
    return this.mcpClient;
  }
}
