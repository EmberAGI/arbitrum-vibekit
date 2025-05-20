import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { cookies } from 'next/headers';
import { chatAgents } from './agents/agents';

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

export const getTools = async (): Promise<{ [key: string]: CoreTool }> => {
  console.log("Initializing MCP client...");

   // Helper function to convert MCP tool schema to Zod schema
   const convertToZodSchema = (schema: any): z.ZodSchema => {
    if (!schema) return z.object({});
    
    // If it's already a Zod schema, return it
    if (schema._def !== undefined) return schema;
    
    // For an object schema, convert properties
    if (schema.type === 'object' && schema.properties) {
      const zodProperties: { [key: string]: z.ZodTypeAny } = {};
      Object.entries(schema.properties).forEach(([key, propSchema]: [string, any]) => {
        switch (propSchema.type) {
          case 'string':
            zodProperties[key] = z.string();
            break;
          case 'number':
            zodProperties[key] = z.number();
            break;
          case 'boolean':
            zodProperties[key] = z.boolean();
            break;
          default:
            // Default to any for complex types
            zodProperties[key] = z.any();
        }
      });
      return z.object(zodProperties);
    }
    
    // Default fallback
    return z.object({});
  };
  
  //POC: Change avaliable tools based on  cookie agent
  const cookieStore = await cookies();
  const agentIdFromCookie = cookieStore.get('agent');
  console.log(agentIdFromCookie);
  let serverUrl = ''

  if (agentIdFromCookie && agentIdFromCookie.value === 'ember-aave') {
    serverUrl = process.env.MCP_SERVER_URL || 'http://173.230.139.151:3010/sse'; 
  }

  if (agentIdFromCookie && agentIdFromCookie.value === 'ember-camelot') {
    serverUrl = process.env.MCP_SERVER_URL || 'http://173.230.139.151:3011/sse';; 
  }

  if (agentIdFromCookie && agentIdFromCookie.value === 'ember-lp') {
    serverUrl = process.env.MCP_SERVER_URL || 'http://173.230.139.151:3012/sse';; 
  }


  if (agentIdFromCookie && agentIdFromCookie.value === 'all') {
    
    const serverUrls = ['http://173.230.139.151:3010/sse', 'http://173.230.139.151:3011/sse'];

    //create an array of mcp clients for each server
    const mcpClients = serverUrls.map((url) => {
      return new Client(
        { name: 'TestClient', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );
    });
    console.log('clients', mcpClients);
    //create an array of transports for each client
    let transports = null
    if (serverUrls) {
      transports = serverUrls.map((url) => {
        return new SSEClientTransport(new URL(url));
      });
    }

    console.log('transports', transports);
    // Connect to the servers
    if (transports) {
      const connections = transports.map((url, index) => {
        return mcpClients[index].connect(transports[index]);
      });
      console.log('connections', connections);
      //const resp = await Promise.all(connections);
      let resp = null
      try {
        //resp = await Promise.all(connections);
        for (const connection of connections) {
          await connection;
        }
      } catch (error) {
        console.error("Error connecting to servers:", error);
        resp = [{ status: 'failed' }, { status: 'failed' }]; // Fallback to empty tools array
      }
      console.log('resp', resp);
    }
    
    console.log("MCP clients initialized successfully!");
    // Try to discover tools
    console.log("Attempting to discover tools via MCP clients...");
    let toolsResponse;
    try {
      toolsResponse = await Promise.all(mcpClients.map(client => client.listTools()));
      console.log('TR',toolsResponse);
    } catch (error) {
      console.error("Error discovering tools:", error);
      toolsResponse = [{ tools: [] }, { tools: [] }]; // Fallback to empty tools array
    }
    //merge the tools from both clients in a single response object
    const mergedToolsResponse = {
      tools: [
        ...toolsResponse[0].tools,
        ...toolsResponse[1].tools,
      ],
    };

    console.log(mergedToolsResponse);
    // Use reduce to create an object mapping tool names to AI tools

    const toolObject = mergedToolsResponse.tools.reduce((acc, mcptool, index) => {
      // Convert MCP tool schema to Zod schema
      const aiTool = tool({
        description: mcptool.description,
        parameters: convertToZodSchema(mcptool.inputSchema),
        execute: async (args) => {
          console.log('Executing tool:', `${agentIdFromCookie.value}[${index}] - ${mcptool.name}`);
          console.log('Arguments:', args);
          console.log('MCP Client:', mcpClients);
          const result = await mcpClients[index].callTool({
            name: `${agentIdFromCookie.value}[${index}] - ${mcptool.name}`,
            arguments: args,
           });
          console.log('RUNNING TOOL:', `${agentIdFromCookie.value}[${index}] - ${mcptool.name}`);
          console.log(result);
          const toolResult = {status: 'completed', result: result}
          return toolResult;
        },
      });
      // Add the tool to the accumulator object, using its name as the key
      acc[`${chatAgents}${mcptool.name}`] = aiTool;
      return acc;
    }, {} as { [key: string]: CoreTool }); // Initialize with the correct type

    // Return the object of tools
    console.log(toolObject);
    return toolObject;

  } else { 

    let mcpClient = null;
  
    // Create MCP Client
    mcpClient = new Client(
      { name: 'TestClient', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
    
    // Create SSE transport
    let transport = null
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
        console.log('Executing tool:', mcptool.name);
        console.log('Arguments:', args);
        console.log('MCP Client:', mcpClient);
        const result = await mcpClient.callTool({
          name: mcptool.name,
          arguments: args,
         });
        //const result = 'chat lending USDC successfully';
        console.log('RUNNING TOOL:', mcptool.name);
        console.log(result);
        const toolResult = {status: 'completed', result: result}
        return toolResult;
      },
    });
    // Add the tool to the accumulator object, using its name as the key
    acc[mcptool.name] = aiTool;
    return acc;
  }, {} as { [key: string]: CoreTool }); // Initialize with the correct type

    // Return the object of tools
    console.log(toolObject);
  return toolObject;

  }
}
