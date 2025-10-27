/**
 * Conflict Validator
 * Detects configuration conflicts (duplicate IDs, differing runtime args)
 */

import type { MCPServerConfig } from '../schemas/mcp.schema.js';
import type { WorkflowEntry } from '../schemas/workflow.schema.js';

export interface ConfigConflict {
  type: 'mcp' | 'workflow';
  id: string;
  reason: string;
  details?: Record<string, unknown>;
}

export class ConfigConflictException extends Error {
  constructor(
    public conflicts: ConfigConflict[],
    message: string,
  ) {
    super(message);
    this.name = 'ConfigConflictException';
  }
}

/**
 * Validate MCP server configurations
 * @param servers - Map of server ID to config
 *
 * Note: Duplicate server ID conflicts are impossible because all skills select from
 * a single shared registry (mcp.json). The same server ID always has the same config.
 *
 * Schema validation is performed during loading. This function exists as a placeholder
 * for future conflict detection when per-skill runtime arg override support is added (PRD line 66).
 */
export function validateMCPServers(_servers: Map<string, MCPServerConfig>): void {
  // No validation needed currently - all configs come from a single validated registry
  // Schema validation happens during loading via Zod
  // TODO: Add conflict detection when per-skill override support is implemented
}

/**
 * Validate workflow configurations are well-formed
 * @param workflows - Map of workflow ID to entry
 *
 * Note: Duplicate workflow ID conflicts are impossible because all skills select from
 * a single shared registry (workflow.json). The same workflow ID always has the same config.
 *
 * TODO: When per-skill workflow override support is added (per PRD line 66),
 * conflict detection will be needed to detect differing overrides for the same workflow.
 */
export function validateWorkflows(_workflows: Map<string, WorkflowEntry>): void {
  // No validation needed currently - all configs come from a single validated registry
  // Schema validation happens during loading via Zod
  // TODO: Add conflict detection when per-skill override support is implemented
}

/**
 * Validate that skill MCP server selections exist in registry
 * @param skillSelections - Map of skill ID to array of selected server names
 * @param registryServers - Set of available server names from registry
 * @throws Error if selections reference non-existent servers
 */
export function validateSkillMCPSelections(
  skillSelections: Map<string, string[]>,
  registryServers: Set<string>,
): void {
  const errors: string[] = [];

  for (const [skillId, selections] of skillSelections.entries()) {
    for (const serverName of selections) {
      if (!registryServers.has(serverName)) {
        errors.push(`Skill "${skillId}" references non-existent MCP server: "${serverName}"`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid MCP server selections:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\n` +
        `Available servers: ${Array.from(registryServers).join(', ')}`,
    );
  }
}

/**
 * Validate that skill workflow selections exist in registry
 * @param skillSelections - Map of skill ID to array of selected workflow IDs
 * @param registryWorkflows - Set of available workflow IDs from registry
 * @throws Error if selections reference non-existent workflows
 */
export function validateSkillWorkflowSelections(
  skillSelections: Map<string, string[]>,
  registryWorkflows: Set<string>,
): void {
  const errors: string[] = [];

  for (const [skillId, selections] of skillSelections.entries()) {
    for (const workflowId of selections) {
      if (!registryWorkflows.has(workflowId)) {
        errors.push(`Skill "${skillId}" references non-existent workflow: "${workflowId}"`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid workflow selections:\n${errors.map((e) => `  - ${e}`).join('\n')}\n\n` +
        `Available workflows: ${Array.from(registryWorkflows).join(', ')}`,
    );
  }
}
