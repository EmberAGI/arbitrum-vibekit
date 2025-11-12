import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

import { MCPRegistrySchema, type MCPRegistry } from '../schemas/mcp.schema.js';

import { resolveEnvRefs, extractEnvRefs, validateEnvVars } from './env-resolver.js';

export interface LoadedMCPRegistry {
  registry: MCPRegistry;
  path: string;
  resolvedRegistry: MCPRegistry;
}

/**
 * Load MCP registry from JSON file
 * @param mcpPath - Path to mcp.json
 * @returns Loaded and validated MCP registry
 */
export function loadMCPRegistry(mcpPath: string): LoadedMCPRegistry {
  const fullPath = resolve(mcpPath);

  if (!existsSync(fullPath)) {
    throw new Error(`MCP registry not found: ${fullPath}`);
  }

  try {
    const fileContent = readFileSync(fullPath, 'utf-8');
    const data: unknown = JSON.parse(fileContent);

    // Validate schema
    const registry = MCPRegistrySchema.parse(data);

    // Extract and validate environment variable references
    const envRefs = extractEnvRefs(registry);
    validateEnvVars(envRefs);

    // Resolve environment variables
    const resolvedRegistry = resolveEnvRefs(registry);

    return {
      registry,
      path: fullPath,
      resolvedRegistry,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load MCP registry from ${fullPath}: ${error.message}`);
    }
    throw error;
  }
}
