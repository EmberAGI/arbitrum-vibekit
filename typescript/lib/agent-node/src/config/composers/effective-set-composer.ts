/**
 * Effective Set Composer
 * Computes effective MCP servers and workflows from selections
 */

import type { LoadedMCPRegistry } from '../loaders/mcp-loader.js';
import type { LoadedSkill } from '../loaders/skill-loader.js';
import type { LoadedWorkflowRegistry } from '../loaders/workflow-loader.js';
import type { MCPServerConfig } from '../schemas/mcp.schema.js';
import type { WorkflowEntry } from '../schemas/workflow.schema.js';
import { validateMCPServers, validateWorkflows } from '../validators/conflict-validator.js';
import { validateToolNames, canonicalizeName } from '../validators/tool-validator.js';

export interface EffectiveMCPServer {
  id: string;
  namespace: string;
  config: MCPServerConfig;
  allowedTools?: string[];
  usedBySkills: string[];
}

export interface EffectiveWorkflow {
  id: string;
  entry: WorkflowEntry;
  usedBySkills: string[];
  overrides?: Record<string, unknown>;
}

export interface EffectiveSets {
  mcpServers: EffectiveMCPServer[];
  workflows: EffectiveWorkflow[];
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    const source = value as unknown[];
    const clonedArray = source.map((item) => deepClone(item));
    return clonedArray as unknown as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const clonedEntries = entries.map(([key, entryValue]) => [key, deepClone(entryValue)]);
    return Object.fromEntries(clonedEntries) as T;
  }

  return value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (a === null || b === null) {
    return false;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aEntries = Object.entries(a as Record<string, unknown>);
    const bEntries = Object.entries(b as Record<string, unknown>);

    if (aEntries.length !== bEntries.length) {
      return false;
    }

    for (const [key, value] of aEntries) {
      if (!deepEqual(value, (b as Record<string, unknown>)[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function canonicalizeServerNamespace(serverId: string): string {
  const trimmed = serverId.trim();
  if (!trimmed) {
    throw new Error(`MCP server identifier cannot be empty`);
  }
  let normalized = trimmed.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  normalized = normalized.replace(/_{2,}/g, '_').replace(/^_+/, '').replace(/_+$/, '');
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw new Error(
      `MCP server "${serverId}" resolves to invalid namespace "${normalized}". ` +
        `Namespaces must start with a letter and contain only lowercase letters, digits, or underscores.`,
    );
  }
  return normalized;
}

function canonicalizeToolSegment(toolName: string, serverId: string, skillId: string): string {
  const trimmed = toolName.trim();
  if (!trimmed) {
    throw new Error(
      `Skill "${skillId}" references an empty tool name for MCP server "${serverId}".`,
    );
  }
  // Preserve case - only validate that tool name contains valid characters
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new Error(
      `Skill "${skillId}" references tool "${toolName}" on MCP server "${serverId}", ` +
        `which contains invalid characters. Tool names must start with a letter ` +
        `and contain only letters, digits, or underscores.`,
    );
  }
  return trimmed;
}

function normalizeAllowedToolsForServer(
  serverId: string,
  namespace: string,
  allowedTools: string[] | undefined,
  skillId: string,
): string[] | undefined {
  if (!allowedTools || allowedTools.length === 0) {
    return undefined;
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawTool of allowedTools) {
    const trimmed = rawTool.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split('__');
    let toolSegment = trimmed;

    if (parts.length === 2) {
      const prefix = parts[0];
      const suffix = parts[1];
      if (!prefix || !suffix) {
        throw new Error(
          `Skill "${skillId}" references invalid tool name "${trimmed}" on MCP server "${serverId}".`,
        );
      }
      const canonicalPrefix = canonicalizeServerNamespace(prefix);
      if (canonicalPrefix !== namespace) {
        throw new Error(
          `Skill "${skillId}" references tool "${trimmed}" on MCP server "${serverId}", ` +
            `but namespace "${prefix}" does not match canonical namespace "${namespace}".`,
        );
      }
      toolSegment = suffix;
    } else if (parts.length > 2) {
      throw new Error(
        `Tool name "${trimmed}" contains multiple namespace separators (__). ` +
          `Only one double underscore separator is allowed between server namespace and tool name.`,
      );
    }

    const canonicalTool = canonicalizeToolSegment(toolSegment, serverId, skillId);

    // Store un-namespaced tool name for filtering in tool-loader
    if (!seen.has(canonicalTool)) {
      seen.add(canonicalTool);
      normalized.push(canonicalTool);
    }
  }

  return normalized;
}

function getServerNamespace(
  serverId: string,
  namespaceRegistry: Map<string, string>,
  cache: Map<string, string>,
): string {
  const cached = cache.get(serverId);
  if (cached) {
    return cached;
  }

  const namespace = canonicalizeServerNamespace(serverId);
  const existing = namespaceRegistry.get(namespace);

  if (existing && existing !== serverId) {
    throw new Error(
      `MCP servers "${existing}" and "${serverId}" resolve to the same namespace "${namespace}". ` +
        `Rename one of the servers to ensure unique namespaces after canonicalization.`,
    );
  }

  namespaceRegistry.set(namespace, serverId);
  cache.set(serverId, namespace);
  return namespace;
}

/**
 * Compose effective MCP server set from registry and skill selections
 * @param registry - Loaded MCP registry
 * @param skills - Array of loaded skills
 * @returns Array of effective MCP servers
 */
export function composeEffectiveMCPServers(
  registry: LoadedMCPRegistry,
  skills: LoadedSkill[],
): EffectiveMCPServer[] {
  const effectiveServers = new Map<string, EffectiveMCPServer>();
  const namespaceRegistry = new Map<string, string>();
  const namespaceCache = new Map<string, string>();

  for (const skill of skills) {
    const skillId = skill.frontmatter.skill.id;
    const mcpConfig = skill.frontmatter.mcp;

    if (!mcpConfig?.servers || mcpConfig.servers.length === 0) {
      continue;
    }

    for (const selection of mcpConfig.servers) {
      const serverId = selection.name;
      const serverConfig = registry.resolvedRegistry.mcpServers[serverId];

      if (!serverConfig) {
        throw new Error(
          `Skill "${skillId}" references non-existent MCP server "${serverId}". ` +
            `Available servers: ${Object.keys(registry.resolvedRegistry.mcpServers).join(', ')}`,
        );
      }

      const namespace = getServerNamespace(serverId, namespaceRegistry, namespaceCache);
      const normalizedTools = normalizeAllowedToolsForServer(
        serverId,
        namespace,
        selection.allowedTools,
        skillId,
      );

      const existing = effectiveServers.get(serverId);

      if (existing) {
        if (!existing.usedBySkills.includes(skillId)) {
          existing.usedBySkills.push(skillId);
        }

        if (normalizedTools) {
          if (existing.allowedTools) {
            // Union: combine tools from both skills (MCP server needs to provide all tools needed by any skill)
            const combinedSet = new Set([...existing.allowedTools, ...normalizedTools]);
            existing.allowedTools = Array.from(combinedSet);
          } else {
            existing.allowedTools = normalizedTools;
          }
        }
      } else {
        effectiveServers.set(serverId, {
          id: serverId,
          namespace,
          config: serverConfig,
          allowedTools: normalizedTools ?? undefined,
          usedBySkills: [skillId],
        });
      }
    }
  }

  const serverMap = new Map<string, MCPServerConfig>();
  const toolNameMap = new Map<string, { server?: string; skill?: string; source: string }>();

  for (const [serverId, effective] of effectiveServers.entries()) {
    serverMap.set(serverId, effective.config);

    if (effective.allowedTools) {
      for (const toolName of effective.allowedTools) {
        // Canonicalize and namespace the tool for validation (allowedTools are stored un-namespaced)
        const canonicalToolName = canonicalizeName(toolName);
        const namespacedTool = `${effective.namespace}__${canonicalToolName}`;

        if (toolNameMap.has(namespacedTool)) {
          const conflict = toolNameMap.get(namespacedTool);
          const firstServer = conflict?.server ?? 'unknown';
          throw new Error(
            `Duplicate tool name "${namespacedTool}" detected for MCP servers "${firstServer}" and "${serverId}". ` +
              `Tool names must be unique after namespacing.`,
          );
        }

        toolNameMap.set(namespacedTool, {
          server: serverId,
          source: 'skill-selection',
          skill: effective.usedBySkills.length === 1 ? effective.usedBySkills[0] : undefined,
        });
      }
    }
  }

  validateMCPServers(serverMap);

  if (toolNameMap.size > 0) {
    validateToolNames(toolNameMap);
  }

  return Array.from(effectiveServers.values());
}

/**
 * Compose effective workflow set from registry and skill selections
 * @param registry - Loaded workflow registry
 * @param skills - Array of loaded skills
 * @returns Array of effective workflows
 */
export function composeEffectiveWorkflows(
  registry: LoadedWorkflowRegistry,
  skills: LoadedSkill[],
): EffectiveWorkflow[] {
  const effectiveWorkflows = new Map<string, EffectiveWorkflow>();
  const overrideSources = new Map<string, Map<string, { value: unknown; skills: Set<string> }>>();

  const registryIndex = new Map<string, WorkflowEntry>();
  for (const entry of registry.registry.workflows) {
    registryIndex.set(entry.id, entry);
  }

  for (const skill of skills) {
    const skillId = skill.frontmatter.skill.id;
    const workflowConfig = skill.frontmatter.workflows;

    if (!workflowConfig?.include || workflowConfig.include.length === 0) {
      continue;
    }

    for (const workflowId of workflowConfig.include) {
      const registryEntry = registryIndex.get(workflowId);

      if (!registryEntry) {
        throw new Error(
          `Skill "${skillId}" references non-existent workflow "${workflowId}". ` +
            `Available workflows: ${Array.from(registryIndex.keys()).join(', ')}`,
        );
      }

      const overridesForWorkflow =
        overrideSources.get(workflowId) ??
        new Map<string, { value: unknown; skills: Set<string> }>();

      const existing = effectiveWorkflows.get(workflowId);
      const overrideConfig = workflowConfig.overrides?.[workflowId];

      if (existing) {
        if (!existing.usedBySkills.includes(skillId)) {
          existing.usedBySkills.push(skillId);
        }

        if (overrideConfig?.config) {
          const incomingOverrides = overrideConfig.config;
          existing.overrides = {
            ...(existing.overrides ? deepClone(existing.overrides) : {}),
            ...deepClone(incomingOverrides),
          };

          for (const [key, value] of Object.entries(incomingOverrides)) {
            const tracker = overridesForWorkflow.get(key);
            if (!tracker) {
              overridesForWorkflow.set(key, {
                value: deepClone(value),
                skills: new Set([skillId]),
              });
              continue;
            }

            if (!deepEqual(tracker.value, value)) {
              throw new Error(
                `Workflow "${workflowId}" override conflict on key "${key}" between skill "${skillId}" ` +
                  `and skill(s) ${Array.from(tracker.skills).join(', ')}.`,
              );
            }
            tracker.skills.add(skillId);
          }
        }

        if (overrideConfig?.enabled !== undefined) {
          const enabledTrackerKey = '__enabled';
          const tracker = overridesForWorkflow.get(enabledTrackerKey);
          if (!tracker) {
            overridesForWorkflow.set(enabledTrackerKey, {
              value: overrideConfig.enabled,
              skills: new Set([skillId]),
            });
          } else if (!deepEqual(tracker.value, overrideConfig.enabled)) {
            throw new Error(
              `Workflow "${workflowId}" enabled override conflict between skill "${skillId}" ` +
                `and skill(s) ${Array.from(tracker.skills).join(', ')}.`,
            );
          } else {
            tracker.skills.add(skillId);
          }
          existing.entry = {
            ...existing.entry,
            enabled: overrideConfig.enabled,
          };
        }
      } else {
        const clonedEntry = deepClone(registryEntry);
        if (overrideConfig?.enabled !== undefined) {
          clonedEntry.enabled = overrideConfig.enabled;
          overridesForWorkflow.set('__enabled', {
            value: overrideConfig.enabled,
            skills: new Set([skillId]),
          });
        }

        const overrides =
          overrideConfig?.config !== undefined ? deepClone(overrideConfig.config) : undefined;

        if (overrides) {
          for (const [key, value] of Object.entries(overrides)) {
            overridesForWorkflow.set(key, {
              value: deepClone(value),
              skills: new Set([skillId]),
            });
          }
        }

        effectiveWorkflows.set(workflowId, {
          id: workflowId,
          entry: clonedEntry,
          usedBySkills: [skillId],
          overrides,
        });
      }

      overrideSources.set(workflowId, overridesForWorkflow);
    }
  }

  const workflowMap = new Map<string, WorkflowEntry>();
  for (const [workflowId, { entry }] of effectiveWorkflows.entries()) {
    workflowMap.set(workflowId, entry);
  }
  validateWorkflows(workflowMap);

  return Array.from(effectiveWorkflows.values());
}

/**
 * Compose effective sets (MCP servers + workflows)
 * @param mcpRegistry - Loaded MCP registry
 * @param workflowRegistry - Loaded workflow registry
 * @param skills - Array of loaded skills
 * @returns Effective sets
 */
export function composeEffectiveSets(
  mcpRegistry: LoadedMCPRegistry,
  workflowRegistry: LoadedWorkflowRegistry,
  skills: LoadedSkill[],
): EffectiveSets {
  return {
    mcpServers: composeEffectiveMCPServers(mcpRegistry, skills),
    workflows: composeEffectiveWorkflows(workflowRegistry, skills),
  };
}
