import { z } from 'zod';

/**
 * MCP Registry Schema
 * Claude-compatible schema supporting stdio and HTTP transports
 */

export const MCPStdioTransportSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional(),
});

const MCPStdioEntrySchema = z.object({
  type: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional(),
});

const MCPHttpEntrySchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const MCPServerEntrySchema = z.discriminatedUnion('type', [
  MCPStdioEntrySchema,
  MCPHttpEntrySchema,
]);

// Claude Desktop format (stdio without explicit type field)
export const MCPStdioWithoutTypeSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
  env: z.record(z.string(), z.string()).optional(),
});

export const MCPServerConfigSchema = z.union([MCPServerEntrySchema, MCPStdioWithoutTypeSchema]);

export const MCPRegistrySchema = z.object({
  mcpServers: z.record(z.string(), MCPServerConfigSchema),
});

export type MCPStdioTransport = z.infer<typeof MCPStdioTransportSchema>;
export type MCPServerEntry = z.infer<typeof MCPServerEntrySchema>;
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type MCPRegistry = z.infer<typeof MCPRegistrySchema>;

/**
 * Normalize MCP server config to discriminated union format
 */
export function normalizeMCPServerConfig(config: MCPServerConfig): {
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
} {
  // Check if it's discriminated type
  if ('type' in config) {
    if (config.type === 'http') {
      return {
        type: 'http',
        url: config.url,
        headers: config.headers,
      };
    }
    return {
      type: 'stdio',
      command: config.command,
      args: config.args || [],
      env: config.env,
    };
  }

  // Default to stdio (Claude Desktop format without type field)
  if ('command' in config) {
    return {
      type: 'stdio',
      command: config.command,
      args: config.args || [],
      env: config.env,
    };
  }

  throw new Error('Invalid MCP server config');
}
