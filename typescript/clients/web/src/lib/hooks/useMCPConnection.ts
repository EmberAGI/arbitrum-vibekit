'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ClientRequest,
  ListToolsResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListPromptsResultSchema,
  GetPromptResultSchema,
  CallToolResultSchema,
  CompleteResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { MCPServer, ConnectionState } from '@/lib/types/mcp';

interface UseMCPConnectionReturn {
  connectionState: ConnectionState;
  connect: (server: MCPServer) => Promise<void>;
  disconnect: () => Promise<void>;
  getPrompt: (name: string, args?: Record<string, string>) => Promise<any>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<any>;
  makeRequest: <T extends z.ZodType>(request: ClientRequest, schema: T) => Promise<z.output<T>>;
  handleCompletion: (
    ref: { type: 'ref/prompt'; name: string },
    argName: string,
    value: string,
    context?: Record<string, string>,
    _signal?: AbortSignal,
  ) => Promise<string[]>;
  completionsSupported: boolean;
}

export function useMCPConnection(): UseMCPConnectionReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    tools: [],
    resources: [],
    resourceTemplates: [],
    prompts: [],
    notifications: [],
  });

  const [mcpClient, setMcpClient] = useState<Client | null>(null);
  const [completionsSupported, setCompletionsSupported] = useState(true);
  const isConnectingRef = useRef(false);
  const mcpClientRef = useRef<Client | null>(null);

  useEffect(() => {
    mcpClientRef.current = mcpClient;
  }, [mcpClient]);

  const disconnect = useCallback(async () => {
    console.log('[MCP] Disconnecting...');

    if (mcpClient) {
      try {
        await mcpClient.close();
      } catch (error) {
        console.warn('[MCP] Error closing client:', error);
      }
    }

    setMcpClient(null);
    setConnectionState({
      status: 'disconnected',
      tools: [],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      notifications: [],
    });

    isConnectingRef.current = false;
    setCompletionsSupported(true);
  }, [mcpClient]);

  const connect = useCallback(
    async (server: MCPServer) => {
      console.log('[MCP] Connecting to server:', server);

      if (isConnectingRef.current) {
        console.log('[MCP] Connection already in progress, skipping...');
        return;
      }

      isConnectingRef.current = true;

      if (mcpClient || connectionState.server?.url) {
        await disconnect();
      }

      setConnectionState((prev) => ({
        ...prev,
        status: 'connecting',
        server,
        error: undefined,
      }));

      try {
        const client = new Client(
          {
            name: 'ember-a2a-client',
            version: '1.0.0',
          },
          {
            capabilities: {},
          },
        );

        const proxyUrl = `/api/mcp?url=${encodeURIComponent(
          server.url || '',
        )}&transportType=${server.transport}`;

        const sessionId = crypto.randomUUID();
        localStorage.setItem(`mcp-session-${server.url}`, sessionId);
        console.log(`[MCP] Generated new session ID: ${sessionId}`);

        const transport: any =
          server.transport === 'streamable-http' && server.url
            ? new StreamableHTTPClientTransport(new URL(proxyUrl, window.location.origin), {
                requestInit: {
                  headers: {
                    'User-Agent': 'Ember-A2A-Client/1.0',
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream, application/json',
                    'mcp-session-id': sessionId,
                  },
                },
              })
            : null;

        if (!transport) {
          throw new Error(`Transport type ${server.transport} not yet implemented`);
        }

        console.log('[MCP] Connecting via proxy:', proxyUrl);
        await client.connect(transport);
        console.log('[MCP] Client connected successfully!');

        const capabilities = client.getServerCapabilities();
        console.log('[MCP] Server capabilities:', capabilities);
        console.log('[MCP] Completions supported:', !!capabilities?.completions);

        // Set completions support based on server capabilities
        if (capabilities?.completions) {
          setCompletionsSupported(true);
        } else {
          setCompletionsSupported(false);
          console.warn('[MCP] Server does not support completions');
        }

        setMcpClient(client);
        setConnectionState((prev) => ({
          ...prev,
          status: 'connected',
          capabilities,
          error: undefined,
        }));

        // Fetch initial lists
        try {
          const results = await Promise.allSettled([
            capabilities?.tools
              ? client.request({ method: 'tools/list' }, ListToolsResultSchema)
              : Promise.resolve({ tools: [] }),
            capabilities?.resources
              ? client.request({ method: 'resources/list' }, ListResourcesResultSchema)
              : Promise.resolve({ resources: [] }),
            capabilities?.resources
              ? client.request(
                  { method: 'resources/templates/list' },
                  ListResourceTemplatesResultSchema,
                )
              : Promise.resolve({ resourceTemplates: [] }),
            capabilities?.prompts
              ? client.request({ method: 'prompts/list' }, ListPromptsResultSchema)
              : Promise.resolve({ prompts: [] }),
          ]);

          const [toolsResult, resourcesResult, resourceTemplatesResult, promptsResult] = results;

          setConnectionState((prev) => ({
            ...prev,
            tools: toolsResult.status === 'fulfilled' ? toolsResult.value.tools : [],
            resources:
              resourcesResult.status === 'fulfilled' ? resourcesResult.value.resources : [],
            resourceTemplates:
              resourceTemplatesResult.status === 'fulfilled'
                ? resourceTemplatesResult.value.resourceTemplates
                : [],
            prompts: promptsResult.status === 'fulfilled' ? promptsResult.value.prompts : [],
          }));
        } catch (error) {
          console.warn('[MCP] Error fetching initial lists:', error);
        }

        isConnectingRef.current = false;
      } catch (error: any) {
        console.error('[MCP] Connection failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Connection failed';

        setConnectionState({
          status: 'error',
          tools: [],
          resources: [],
          resourceTemplates: [],
          prompts: [],
          notifications: [],
          error: errorMessage,
        });

        isConnectingRef.current = false;
      }
    },
    [disconnect, mcpClient, connectionState.server?.url],
  );

  const makeRequest = useCallback(
    async <T extends z.ZodType>(request: ClientRequest, schema: T): Promise<z.output<T>> => {
      if (!mcpClient) {
        throw new Error('Not connected to MCP server');
      }

      try {
        const response = await mcpClient.request(request, schema);
        return response;
      } catch (error) {
        console.error('[MCP] Request error:', error);
        throw error;
      }
    },
    [mcpClient],
  );

  const callTool = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      console.log('[MCP] Calling tool:', name, 'with args:', args);

      try {
        const result = await makeRequest(
          { method: 'tools/call', params: { name, arguments: args } },
          CallToolResultSchema,
        );
        console.log('[MCP] Tool call completed:', result);
        return result;
      } catch (error) {
        console.error('[MCP] Tool call failed:', error);
        throw error;
      }
    },
    [makeRequest],
  );

  const getPrompt = useCallback(
    async (name: string, args: Record<string, string> = {}) => {
      if (!mcpClient) {
        throw new Error('Not connected to MCP server');
      }
      const result = await makeRequest(
        { method: 'prompts/get', params: { name, arguments: args } },
        GetPromptResultSchema,
      );
      return result;
    },
    [mcpClient, makeRequest],
  );

  const handleCompletion = useCallback(
    async (
      ref: { type: 'ref/prompt'; name: string },
      argName: string,
      value: string,
      context: Record<string, string> = {},
      _signal?: AbortSignal,
    ): Promise<string[]> => {
      console.log('[MCP] handleCompletion called:', {
        ref,
        argName,
        value,
        context,
        mcpClientExists: !!mcpClient,
        completionsSupported,
      });

      if (!mcpClient) {
        console.error('[MCP] Not connected to MCP server');
        throw new Error('Not connected to MCP server');
      }

      if (!completionsSupported) {
        console.error('[MCP] Completions not supported by this server');
        throw new Error('Completions not supported by this server');
      }

      try {
        console.log('[MCP] Making completion request...');
        const result = await makeRequest(
          {
            method: 'completion/complete',
            params: {
              ref,
              argument: {
                name: argName,
                value,
              },
              context,
            },
          },
          CompleteResultSchema,
        );
        console.log('[MCP] Completion result:', result);

        // Handle different response structures
        // Some servers return { completions: [...] }
        // Others return { completion: { values: [...] } }
        if (result.completion && 'values' in result.completion) {
          console.log('[MCP] Using completion.values:', result.completion.values);
          return result.completion.values as string[];
        } else if (result.completions) {
          console.log('[MCP] Using completions:', result.completions);
          return result.completions as string[];
        }

        console.warn('[MCP] Unexpected completion result structure:', result);
        return [];
      } catch (error) {
        console.error('[MCP] Completion error:', error);
        throw error;
      }
    },
    [mcpClient, makeRequest, completionsSupported],
  );

  return {
    connectionState,
    connect,
    disconnect,
    getPrompt,
    callTool,
    makeRequest,
    handleCompletion,
    completionsSupported,
  };
}
