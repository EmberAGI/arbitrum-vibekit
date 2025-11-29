import { tool, jsonSchema } from 'ai';
import type { JSONSchema7 } from 'json-schema';
import type { CoreTool } from '@/lib/ai/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { cookies } from 'next/headers';
import { DEFAULT_SERVER_URLS } from '../../../agents-config';
import type { ChatAgentId } from '../../../agents-config';

/*export const getEmberLending = tool({
  description: 'Get the current weather at a location',
  parameters: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  execute: async ({ latitude, longitude }) => {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
    );

    const weatherData = await response.json();
    return weatherData;
  },
}); */

const URL_CHAT_IDS = new Map<string, ChatAgentId>();
DEFAULT_SERVER_URLS.forEach((value, key) => URL_CHAT_IDS.set(value, key));

/**
 * Normalize MCP input schema into a minimal Draft-07 compatible schema.
 * - Ensures type: 'object'
 * - Copies property keys but not inner constraints (to stay schema-agnostic)
 * - Copies required array when present and valid
 * - Adds $schema for draft-07 to make intent explicit
 */
function normalizeMcpInputSchemaToJsonSchema7(schema: any): JSONSchema7 {
  console.log('🔍 [TOOLS] Normalizing MCP schema:', JSON.stringify(schema, null, 2));

  const propertiesInput = schema?.['properties'] as Record<string, unknown> | undefined;
  const props: Record<string, JSONSchema7> = {};

  if (propertiesInput && typeof propertiesInput === 'object') {
    for (const key of Object.keys(propertiesInput)) {
      const v = propertiesInput[key];
      // Preserve boolean schemas (valid in Draft-07) and object schemas; otherwise fallback to empty schema
      props[key] = {};
      if (typeof v === 'boolean' || (v && typeof v === 'object')) {
        props[key] = v as unknown as JSONSchema7;
      }
    }
  }

  const required = Array.isArray(schema?.['required'])
    ? ([...schema['required']] as string[])
    : undefined;

  const result: JSONSchema7 = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: props,
    ...(required && { required }),
  };

  console.log('🔍 [TOOLS] Normalized schema:', JSON.stringify(result, null, 2));
  return result;
}

async function getTool(serverUrl: string) {
  let mcpClient = null;

  // Create MCP Client
  mcpClient = new Client(
    { name: 'TestClient', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  let transport = null;
  if (serverUrl) {
    if (serverUrl.endsWith('/sse')) {
      // Use SSE transport for /sse endpoints (agents using @emberai/arbitrum-vibekit-core)
      transport = new SSEClientTransport(new URL(serverUrl));
    } else {
      // Use StreamableHTTP transport for /mcp endpoints (standard MCP servers)
      transport = new StreamableHTTPClientTransport(
        new URL(serverUrl),
        {} // headers - empty for now
      );
    }
  }

  // Connect to the server
  if (transport) {
    await mcpClient.connect(transport);
    console.log('MCP client initialized successfully!');
  }

  // Try to discover tools
  console.log('Attempting to discover tools via MCP client...');
  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
  let toolsResponse;
  try {
    toolsResponse = await mcpClient.listTools();
    console.log('🔍 [TOOLS] toolsResponse:', toolsResponse);
    // Debug: Log the actual input schema structure
    if (toolsResponse.tools && toolsResponse.tools.length > 0) {
      console.log('🔍 [TOOLS] First tool inputSchema:', JSON.stringify(toolsResponse.tools[0].inputSchema, null, 2));
    }
  } catch (error) {
    console.error('Error discovering tools:', error);
    toolsResponse = { tools: [] }; // Fallback to empty tools array
  }

  // Use reduce to create an object mapping tool names to AI tools
  const toolObject = toolsResponse.tools.reduce(
    (acc, mcptool) => {
      console.log('🔍 [TOOLS] Processing tool:', mcptool.name);
      console.log('🔍 [TOOLS] Tool inputSchema:', JSON.stringify(mcptool.inputSchema, null, 2));

      // Normalize MCP schema to JSON Schema 7 format
      const normalized = normalizeMcpInputSchemaToJsonSchema7(mcptool.inputSchema);
      console.log('🔍 [TOOLS] Normalized schema for', mcptool.name, ':', JSON.stringify(normalized, null, 2));

      const aiTool = tool({
        description: mcptool.description,
        inputSchema: jsonSchema(normalized),
        execute: async (args: { [x: string]: unknown }) => {
          console.log('Executing tool:', mcptool.name);
          console.log('Arguments:', args);
          console.log('MCP Client:', mcpClient);
          const result = await mcpClient.callTool({
            name: mcptool.name,
            arguments: args,
          });
          console.log('RUNNING TOOL:', mcptool.name);
          console.log(result);
          return result;
        },
      } as any);
      // Add the tool to the accumulator object, using its name as the key
      acc[mcptool.name] = aiTool;
      return acc;
    },
    {} as { [key: string]: CoreTool },
  ); // Initialize with the correct type

  // Return the object of tools
  console.log('toolObject =>>', toolObject);
  return toolObject;
}

export const getTools = async (): Promise<{ [key: string]: CoreTool }> => {
  console.log('Initializing MCP client...');

  const cookieStore = await cookies();
  const rawAgentId = cookieStore.get('agent')?.value;
  const agentId = rawAgentId as ChatAgentId | undefined;
  const overrideUrl = process.env.MCP_SERVER_URL; // optional env override

  // helper that chooses override first, then config file
  const resolveUrl = (id: ChatAgentId) =>
    overrideUrl ?? DEFAULT_SERVER_URLS.get(id) ?? '';

  console.log('🔍 [TOOLS] rawAgentId:', rawAgentId);
  console.log('🔍 [TOOLS] agentId:', agentId);
  console.log('🔍 [TOOLS] DEFAULT_SERVER_URLS:', DEFAULT_SERVER_URLS);
  console.log('🔍 [TOOLS] resolveUrl:', resolveUrl(agentId as ChatAgentId));

  // "all" agents: fan-out to every URL
  if (!agentId || agentId === 'all') {
    const urls = Array.from(DEFAULT_SERVER_URLS.keys()).map((id) =>
      resolveUrl(id),
    );
    const toolsByAgent = await Promise.all(urls.map(getTool));
    // flatten and prefix so you don't get name collisions
    return toolsByAgent.reduce(
      (
        all: Record<string, CoreTool>,
        tools: { [key: string]: CoreTool },
        idx: number,
      ) => {
        const id = Array.from(DEFAULT_SERVER_URLS.keys())[idx];
        Object.entries(tools).forEach(([toolName, tool]) => {
          all[`${id}-${toolName}`] = tool; // Changed to dash for clarity
        });
        return all;
      },
      {} as Record<string, CoreTool>,
    );
  }

  // single agent
  const serverUrl = resolveUrl(agentId);
  console.log('🔍 [TOOLS] serverUrl:', serverUrl);
  if (!serverUrl) {
    // It's better to return an empty object or handle this case as per your application's needs
    // Throwing an error might be too disruptive for some use cases.
    // For now, let's log an error and return an empty toolset.
    console.error(`No server URL configured for agent "${agentId}"`);
    return {};
  }
  return getTool(serverUrl);
};












