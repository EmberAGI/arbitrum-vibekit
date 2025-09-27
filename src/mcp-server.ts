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
      let fieldSchema = value._def;
      let isOptional = false;
      let actualSchema = fieldSchema;
      
      // Handle optional and default fields
      if (fieldSchema.typeName === 'ZodOptional') {
        isOptional = true;
        actualSchema = fieldSchema.inner?._def || fieldSchema.inner;
      } else if (fieldSchema.typeName === 'ZodDefault') {
        isOptional = true;
        actualSchema = fieldSchema.inner?._def || fieldSchema.inner;
      }
      
      // Handle ZodEffects (refinements)
      if (actualSchema?.typeName === 'ZodEffects') {
        actualSchema = actualSchema.schema?._def || actualSchema.schema;
      }
      
      // Determine field type and properties
      if (actualSchema?.typeName === 'ZodString') {
        properties[key] = {
          type: 'string',
          description: actualSchema.description || fieldSchema.description || '',
        };
      } else if (actualSchema?.typeName === 'ZodNumber') {
        properties[key] = {
          type: 'number',
          description: actualSchema.description || fieldSchema.description || '',
        };
        if (actualSchema.min !== undefined) {
          properties[key].minimum = actualSchema.min;
        }
        if (actualSchema.max !== undefined) {
          properties[key].maximum = actualSchema.max;
        }
      } else if (actualSchema?.typeName === 'ZodUnion') {
        properties[key] = {
          type: 'string',
          description: actualSchema.description || fieldSchema.description || '',
          enum: actualSchema.options?.map((opt: any) => opt._def?.value || opt) || [],
        };
      } else {
        // Fallback for other types
        properties[key] = {
          type: 'string',
          description: fieldSchema.description || actualSchema?.description || '',
        };
      }
      
      // Add to required array if not optional
      if (!isOptional) {
        required.push(key);
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