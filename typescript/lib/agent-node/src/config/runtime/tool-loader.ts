/**
 * Tool Loader for Runtime Config
 * Connects MCP clients to instantiated servers and loads tools
 */

import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from 'ai';
import { z } from 'zod';

import { createCoreToolFromMCP } from '../../ai/adapters.js';
import { workflowToCoreTools } from '../../ai/adapters.js';
import { Logger } from '../../utils/logger.js';
import { WorkflowRuntime } from '../../workflows/runtime.js';
import { canonicalizeName } from '../validators/tool-validator.js';

import type { MCPServerInstance } from './mcp-instantiator.js';
import type { LoadedWorkflowPlugin } from './workflow-loader.js';

export interface ToolLoaderResult {
  tools: Map<string, Tool>;
  mcpClients: Map<string, MCPClient>;
  workflowRuntime?: WorkflowRuntime;
}

function assertUnreachable(value: never): never {
  throw new Error(`Unknown MCP server type: ${String(value)}`);
}

/**
 * Load tools from MCP server instances and workflow plugins
 * @param mcpInstances - Map of instantiated MCP servers
 * @param workflowPlugins - Map of loaded workflow plugins
 * @returns Map of all tools with namespaced names
 */
export async function loadTools(
  mcpInstances: Map<string, MCPServerInstance>,
  workflowPlugins: Map<string, LoadedWorkflowPlugin>,
): Promise<ToolLoaderResult> {
  const logger = Logger.getInstance('ToolLoader');
  const tools = new Map<string, Tool>();
  const mcpClients = new Map<string, MCPClient>();

  // Load MCP tools from each server instance
  for (const [serverId, instance] of mcpInstances.entries()) {
    if (instance.status !== 'running') {
      logger.warn(`Skipping MCP server ${serverId} - not running (status: ${instance.status})`);
      continue;
    }

    try {
      const client = await connectMCPClient(instance);
      if (!client) {
        logger.warn(`Could not connect MCP client to server ${serverId}`);
        continue;
      }

      mcpClients.set(serverId, client);

      // List and load tools from this server
      const { tools: mcpTools } = await client.listTools();
      logger.debug(`MCP server ${serverId} provided ${mcpTools.length} tools`);

      for (const mcpTool of mcpTools) {
        // Check if this tool is allowed by per-server allowedTools filter (before canonicalization)
        if (instance.allowedTools && !instance.allowedTools.includes(mcpTool.name)) {
          logger.debug(
            `Skipping tool ${mcpTool.name} - not in allowedTools for server ${serverId}`,
          );
          continue;
        }

        // Canonicalize tool name to snake_case (handles camelCase → snake_case, kebab-case → snake_case)
        const canonicalToolName = canonicalizeName(mcpTool.name);

        // Apply tool namespacing: server_namespace__tool_name
        const namespacedName = `${instance.namespace}__${canonicalToolName}`;

        // Create AI SDK tool from MCP tool
        const aiTool = createCoreToolFromMCP(
          namespacedName,
          mcpTool.description || mcpTool.name,
          mcpTool.inputSchema,
          async (args: unknown) => {
            logger.debug('Executing MCP tool', { tool: namespacedName, serverId });
            const result = await client.callTool({
              name: mcpTool.name,
              arguments: (args ?? {}) as Record<string, unknown>,
            });
            return result;
          },
        );

        tools.set(namespacedName, aiTool);
        logger.debug(`Loaded MCP tool: ${namespacedName}`);
      }
    } catch (error) {
      logger.error(`Failed to load tools from MCP server ${serverId}`, error);
      // Continue with other servers
    }
  }

  // Load workflow tools
  let workflowRuntime: WorkflowRuntime | undefined;
  if (workflowPlugins.size > 0) {
    workflowRuntime = new WorkflowRuntime();

    for (const [workflowId, loadedPlugin] of workflowPlugins.entries()) {
      try {
        // Register plugin with the workflow runtime
        workflowRuntime.register(loadedPlugin.plugin);
        logger.debug(`Registered workflow plugin: ${workflowId}`);

        // Get plugin metadata to create AI SDK tool
        const plugin = loadedPlugin.plugin;
        const canonicalId = canonicalizeName(plugin.id);
        const toolName = `dispatch_workflow_${canonicalId}`;

        // Create AI SDK tool from workflow plugin (schema-only, no execute)
        // NOTE: Workflow dispatch is handled by StreamProcessor which has access to contextId
        const description = plugin.description || `Dispatch ${plugin.name} workflow`;
        const inputSchema = plugin.inputSchema ?? z.object({}).passthrough();

        const aiTool = workflowToCoreTools(canonicalId, description, inputSchema);

        tools.set(toolName, aiTool);
        logger.debug(`Loaded workflow tool: ${toolName}`);
      } catch (error) {
        logger.error(`Failed to load tools from workflow ${workflowId}`, error);
      }
    }
  }

  logger.info(`Loaded ${tools.size} tools total`, {
    mcpServers: mcpInstances.size,
    workflows: workflowPlugins.size,
  });

  return { tools, mcpClients, workflowRuntime };
}

/**
 * Connect MCP client to an instantiated server
 */
async function connectMCPClient(instance: MCPServerInstance): Promise<MCPClient | null> {
  const logger = Logger.getInstance('ToolLoader');

  try {
    const client = new MCPClient({
      name: 'agent-node',
      version: '1.0.0',
    });

    if (instance.type === 'http') {
      if (!instance.url) {
        throw new Error(`HTTP MCP server ${instance.id} missing URL`);
      }
      const transport = new StreamableHTTPClientTransport(new URL(instance.url));
      await client.connect(transport);
      logger.info(`Connected MCP client to HTTP server ${instance.id} at ${instance.url}`);
    } else if (instance.type === 'stdio') {
      if (!instance.process) {
        throw new Error(`Stdio MCP server ${instance.id} missing process`);
      }
      const transport = new StdioClientTransport({
        command: instance.process.spawnfile,
        args: instance.process.spawnargs.slice(1), // Remove command from args
        stderr: 'pipe',
      });
      await client.connect(transport);
      logger.info(`Connected MCP client to stdio server ${instance.id}`);
    } else {
      return assertUnreachable(instance.type);
    }

    return client;
  } catch (error) {
    logger.error(`Failed to connect MCP client to server ${instance.id}`, error);
    return null;
  }
}

/**
 * Close all MCP clients
 */
export async function closeAllMCPClients(clients: Map<string, MCPClient>): Promise<void> {
  const logger = Logger.getInstance('ToolLoader');

  for (const [serverId, client] of clients.entries()) {
    try {
      await client.close();
      logger.debug(`Closed MCP client for server ${serverId}`);
    } catch (error) {
      logger.warn(`Failed to close MCP client for server ${serverId}`, { error });
    }
  }
}
