#!/usr/bin/env node

/**
 * MCP Server Wrapper for Arbitrum Bridge Tools
 * 
 * This creates an MCP server that exposes the refactored tools
 * for use with the MCP inspector and other MCP clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools } from './simple-tools.js';

// Create MCP server
const server = new Server(
  {
    name: 'arbitrum-bridge-tools',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to convert Zod schema to JSON Schema
function zodToJsonSchema(zodSchema: any): any {
  if (zodSchema._def?.typeName === 'ZodObject') {
    const shape = zodSchema._def.shape();
    const properties: any = {};
    const required: string[] = [];
    
    Object.entries(shape).forEach(([key, value]: [string, any]) => {
      const fieldSchema = value._def;
      
      // Check if field is optional by looking at the type name
      const isOptional = fieldSchema.typeName === 'ZodOptional' || 
                        fieldSchema.typeName === 'ZodDefault';
      
      // Get the actual schema if it's wrapped
      const actualSchema = isOptional ? fieldSchema.inner?._def || fieldSchema.inner : fieldSchema;
      
      if (actualSchema?.typeName === 'ZodString') {
        properties[key] = {
          type: 'string',
          description: actualSchema.description || fieldSchema.description || '',
        };
        if (!isOptional) {
          required.push(key);
        }
      } else if (actualSchema?.typeName === 'ZodUnion') {
        properties[key] = {
          type: 'string',
          description: actualSchema.description || fieldSchema.description || '',
          enum: actualSchema.options.map((opt: any) => opt._def.value),
        };
        if (!isOptional) {
          required.push(key);
        }
      } else {
        // Fallback for other types
        properties[key] = {
          type: 'string',
          description: fieldSchema.description || '',
        };
        if (!isOptional) {
          required.push(key);
        }
      }
    });
    
    return {
      type: 'object',
      properties,
      required,
    };
  }
  
  // Fallback for unknown schema types
  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.parameters),
    })),
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (!(name in tools)) {
    throw new Error(`Tool '${name}' not found`);
  }
  
  const tool = tools[name as keyof typeof tools];
  
  try {
    // Execute the tool with the provided arguments
    const result = await tool.execute(args as any);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            tool: name,
            args,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Arbitrum Bridge Tools MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});