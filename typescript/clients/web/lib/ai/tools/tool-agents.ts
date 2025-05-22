import { tool, type CoreTool } from "ai";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { cookies } from "next/headers";
import { DEFAULT_SERVER_URLS } from "../../../agents-config";
import type { ChatAgentId } from "../../../agents-config";

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

const convertToZodSchema = (schema: any): z.ZodSchema => {
  if (!schema) return z.object({});

  // If it's already a Zod schema, return it
  if (schema._def !== undefined) return schema;

  // For an object schema, convert properties
  if (schema.type === "object" && schema.properties) {
    const zodProperties: { [key: string]: z.ZodTypeAny } = {};
    Object.entries(schema.properties).forEach(
      ([key, propSchema]: [string, any]) => {
        switch (propSchema.type) {
          case "string":
            zodProperties[key] = z.string();
            break;
          case "number":
            zodProperties[key] = z.number();
            break;
          case "boolean":
            zodProperties[key] = z.boolean();
            break;
          default:
            // Default to any for complex types
            zodProperties[key] = z.any();
        }
      }
    );
    return z.object(zodProperties);
  }

  // Default fallback
  return z.object({});
};

async function getTool(serverUrl: string) {
  let mcpClient = null;

  // Create MCP Client
  mcpClient = new Client(
    { name: "TestClient", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  // Create SSE transport
  let transport = null;
  if (serverUrl) {
    transport = new SSEClientTransport(new URL(serverUrl));
  }

  // Connect to the server
  if (transport) {
    await mcpClient.connect(transport);
    console.log("MCP client initialized successfully!");
  }

  // Try to discover tools
  console.log("Attempting to discover tools via MCP client...");
  // biome-ignore lint/suspicious/noImplicitAnyLet: <explanation>
  let toolsResponse;
  try {
    toolsResponse = await mcpClient.listTools();
    console.log(toolsResponse);
  } catch (error) {
    console.error("Error discovering tools:", error);
    toolsResponse = { tools: [] }; // Fallback to empty tools array
  }

  // Use reduce to create an object mapping tool names to AI tools
  const toolObject = toolsResponse.tools.reduce((acc, mcptool) => {
    // Convert MCP tool schema to Zod schema
    const aiTool = tool({
      description: mcptool.description,
      parameters: convertToZodSchema(mcptool.inputSchema),
      execute: async (args) => {
        console.log("Executing tool:", mcptool.name);
        console.log("Arguments:", args);
        console.log("MCP Client:", mcpClient);
        const result = await mcpClient.callTool({
          name: mcptool.name,
          arguments: args,
        });
        //const result = 'chat lending USDC successfully';
        console.log("RUNNING TOOL:", mcptool.name);
        console.log(result);
        const toolResult = { status: "completed", result: result };
        return toolResult;
      },
    });
    // Add the tool to the accumulator object, using its name as the key
    acc[mcptool.name] = aiTool;
    return acc;
  }, {} as { [key: string]: CoreTool }); // Initialize with the correct type

  // Return the object of tools
  console.log("toolObject =", toolObject);
  return toolObject;
}

export const getTools = async (): Promise<{ [key: string]: CoreTool }> => {
  console.log("Initializing MCP client...");

  const cookieStore = await cookies();
  const rawAgentId = cookieStore.get("agent")?.value;
  const agentId = rawAgentId as ChatAgentId | undefined;
  const overrideUrl = process.env.MCP_SERVER_URL; // optional env override

  // helper that chooses override first, then config file
  const resolveUrl = (id: ChatAgentId) =>
    overrideUrl ?? DEFAULT_SERVER_URLS.get(id) ?? "";

  // "all" agents: fan-out to every URL
  if (!agentId || agentId === "all") {
    const urls = Array.from(DEFAULT_SERVER_URLS.keys()).map((id) =>
      resolveUrl(id)
    );
    const toolsByAgent = await Promise.all(urls.map(getTool));
    // flatten and prefix so you don't get name collisions
    return toolsByAgent.reduce(
      (
        all: Record<string, CoreTool>,
        tools: { [key: string]: CoreTool },
        idx: number
      ) => {
        const id = Array.from(DEFAULT_SERVER_URLS.keys())[idx];
        Object.entries(tools).forEach(([toolName, tool]) => {
          all[`${id}-${toolName}`] = tool; // Changed to dash for clarity
        });
        return all;
      },
      {} as Record<string, CoreTool>
    );
  }

  // single agent
  const serverUrl = resolveUrl(agentId);
  if (!serverUrl) {
    // It's better to return an empty object or handle this case as per your application's needs
    // Throwing an error might be too disruptive for some use cases.
    // For now, let's log an error and return an empty toolset.
    console.error(`No server URL configured for agent "${agentId}"`);
    return {};
  }
  return getTool(serverUrl);
};
