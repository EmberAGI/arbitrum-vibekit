/**
 * CLI Command: agent doctor
 * Validates configuration and detects conflicts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import matter from 'gray-matter';

import { loadAgentBase } from '../../config/loaders/agent-loader.js';
import { loadManifest } from '../../config/loaders/manifest-loader.js';
import { loadMCPRegistry } from '../../config/loaders/mcp-loader.js';
import { loadSkills } from '../../config/loaders/skill-loader.js';
import { loadWorkflowRegistry } from '../../config/loaders/workflow-loader.js';
import { loadAgentConfig } from '../../config/orchestrator.js';
import {
  extractGuardrails,
  extractToolPolicies,
  type CardWithExtensions,
} from '../../config/utils/card-inspector.js';
import {
  validateMCPServers,
  validateWorkflows,
} from '../../config/validators/conflict-validator.js';
import { cliOutput } from '../output.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatPath(segments: Array<string | number>): string {
  if (segments.length === 0) {
    return '(root)';
  }

  return segments
    .map((segment, index) => {
      if (typeof segment === 'number') {
        return `[${segment}]`;
      }
      return index === 0 ? segment : `.${segment}`;
    })
    .join('');
}

function collectUnknownKeys(
  rawValue: unknown,
  parsedValue: unknown,
  path: Array<string | number> = [],
): string[] {
  if (Array.isArray(rawValue)) {
    const parsedArray = Array.isArray(parsedValue) ? parsedValue : [];
    const results: string[] = [];
    rawValue.forEach((item, index) => {
      const nextPath = [...path, index];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const nextParsed = index < parsedArray.length ? parsedArray[index] : undefined;
      results.push(...collectUnknownKeys(item, nextParsed, nextPath));
    });
    return results;
  }

  if (!isRecord(rawValue)) {
    return [];
  }

  const parsedRecord = isRecord(parsedValue) ? parsedValue : {};
  const results: string[] = [];

  for (const [key, value] of Object.entries(rawValue)) {
    if (!Object.prototype.hasOwnProperty.call(parsedRecord, key)) {
      results.push(formatPath([...path, key]));
      continue;
    }
    const nextParsed = parsedRecord[key];
    results.push(...collectUnknownKeys(value, nextParsed, [...path, key]));
  }

  return results;
}

function readJsonFile(filePath: string): unknown {
  // JSON.parse returns `any`; surface as `unknown` so callers validate shape
  return JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
}

function appendUnknownKeyWarnings(warnings: string[], source: string, unknownKeys: string[]): void {
  for (const key of unknownKeys) {
    warnings.push(`Unknown ${source} key: ${key}`);
  }
}

export interface DoctorOptions {
  configDir?: string;
  verbose?: boolean;
}

export async function doctorCommand(options: DoctorOptions = {}): Promise<void> {
  const configDir = resolve(process.cwd(), options.configDir ?? 'config');
  const manifestPath = resolve(configDir, 'agent.manifest.json');

  cliOutput.print('Running configuration diagnostics...');
  cliOutput.blank();

  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // 1. Validate manifest
    cliOutput.success('Checking manifest...');
    const { manifest } = loadManifest(manifestPath);
    const manifestDir = resolve(configDir);
    const manifestRaw = readJsonFile(manifestPath);
    appendUnknownKeyWarnings(warnings, 'manifest', collectUnknownKeys(manifestRaw, manifest));

    // 2. Validate agent base
    cliOutput.success('Checking agent base...');
    const agentPath = resolve(configDir, 'agent.md');
    const agentBase = loadAgentBase(agentPath);
    const agentMatter = matter(readFileSync(agentPath, 'utf-8'));
    appendUnknownKeyWarnings(
      warnings,
      'agent frontmatter',
      collectUnknownKeys(agentMatter.data, agentBase.frontmatter),
    );

    if (!agentBase.frontmatter.card.name) {
      errors.push('Agent card missing required field: `name`');
    }
    if (!agentBase.frontmatter.card.description) {
      errors.push('Agent card missing required field: `description`');
    }
    if (!agentBase.body || agentBase.body.length === 0) {
      warnings.push('Agent base has empty system prompt');
    }

    // 3. Validate skills
    cliOutput.success('Checking skills...');
    const skills = loadSkills(manifest.skills, manifestDir);

    if (skills.length === 0) {
      warnings.push('No skills defined in manifest');
    }

    for (const skill of skills) {
      const skillMatter = matter(readFileSync(skill.path, 'utf-8'));
      appendUnknownKeyWarnings(
        warnings,
        `skill ${skill.frontmatter.skill.id} frontmatter`,
        collectUnknownKeys(skillMatter.data, skill.frontmatter),
      );

      if (!skill.frontmatter.skill.id) {
        errors.push(`Skill ${skill.path} missing required field: \`id\``);
      }
      if (!skill.frontmatter.skill.name) {
        errors.push(`Skill ${skill.path} missing required field: \`name\``);
      }
      if (!skill.body || skill.body.length === 0) {
        warnings.push(`Skill ${skill.frontmatter.skill.id} has empty prompt`);
      }
    }

    // 4. Validate MCP registry
    cliOutput.success('Checking MCP registry...');
    const defaultRegistries = { mcp: './mcp.json', workflows: './workflow.json' };
    const registries = manifest.registries ?? defaultRegistries;
    const mcpRegistryPath = resolve(manifestDir, registries.mcp);
    const mcpRegistry = loadMCPRegistry(mcpRegistryPath);
    const mcpRaw = readJsonFile(mcpRegistryPath);
    appendUnknownKeyWarnings(
      warnings,
      'mcp registry',
      collectUnknownKeys(mcpRaw, mcpRegistry.registry),
    );

    const mcpServerMap = new Map(Object.entries(mcpRegistry.registry.mcpServers));

    try {
      validateMCPServers(mcpServerMap);
      cliOutput.print(`  Found ${mcpServerMap.size} MCP server(s)`);
    } catch (error) {
      if (error instanceof Error) {
        errors.push(`MCP validation failed: ${error.message}`);
      }
    }

    // 5. Validate workflow registry
    cliOutput.success('Checking workflow registry...');
    const workflowRegistryPath = resolve(manifestDir, registries.workflows);
    const workflowRegistry = loadWorkflowRegistry(workflowRegistryPath);
    const workflowRaw = readJsonFile(workflowRegistryPath);
    appendUnknownKeyWarnings(
      warnings,
      'workflow registry',
      collectUnknownKeys(workflowRaw, workflowRegistry.registry),
    );

    const workflowMap = new Map(workflowRegistry.registry.workflows.map((w) => [w.id, w]));

    try {
      validateWorkflows(workflowMap);
      cliOutput.print(`  Found ${workflowMap.size} workflow(s)`);
    } catch (error) {
      if (error instanceof Error) {
        errors.push(`Workflow validation failed: ${error.message}`);
      }
    }

    // 6. Check for unreferenced items
    cliOutput.success('Checking for unreferenced items...');

    // Check for MCP servers not referenced by any skill
    const referencedMcpServers = new Set<string>();
    for (const skill of skills) {
      if (skill.frontmatter.mcp?.servers) {
        for (const server of skill.frontmatter.mcp.servers) {
          referencedMcpServers.add(server.name);
        }
      }
    }

    for (const serverId of mcpServerMap.keys()) {
      if (!referencedMcpServers.has(serverId)) {
        warnings.push(`MCP server "${serverId}" is defined but not referenced by any skill`);
      }
    }

    // Check for workflows not referenced by any skill
    const referencedWorkflows = new Set<string>();
    for (const skill of skills) {
      if (skill.frontmatter.workflows?.include) {
        for (const workflowId of skill.frontmatter.workflows.include) {
          referencedWorkflows.add(workflowId);
        }
      }
    }

    for (const workflowId of workflowMap.keys()) {
      if (!referencedWorkflows.has(workflowId)) {
        warnings.push(`Workflow "${workflowId}" is defined but not referenced by any skill`);
      }
    }

    let composedConfig: Awaited<ReturnType<typeof loadAgentConfig>> | undefined;
    try {
      composedConfig = await loadAgentConfig(manifestPath);
    } catch (error) {
      if (error instanceof Error) {
        errors.push(`Failed to compose configuration: ${error.message}`);
      } else {
        throw error;
      }
    }

    if (composedConfig) {
      const cardWithExtensions = composedConfig.card as CardWithExtensions;
      const finalToolPolicies = extractToolPolicies(cardWithExtensions) ?? [];
      const finalGuardrails = extractGuardrails(cardWithExtensions);

      const toolPolicyStrategy = manifest.merge?.card?.toolPolicies ?? 'intersect';
      const guardrailStrategy = manifest.merge?.card?.guardrails ?? 'tightest';

      const baseToolPolicies = agentBase.frontmatter.card.toolPolicies ?? [];
      const skillPolicySources = skills
        .map((skill) => ({
          skillId: skill.frontmatter.skill.id,
          policies: skill.frontmatter.skill.toolPolicies ?? [],
        }))
        .filter((entry) => entry.policies.length > 0);

      const baseGuardrails = agentBase.frontmatter.card.guardrails;
      const skillGuardrailSources = skills
        .map((skill) => ({
          skillId: skill.frontmatter.skill.id,
          guardrails: skill.frontmatter.skill.guardrails,
        }))
        .filter((entry) => entry.guardrails && Object.keys(entry.guardrails).length > 0);

      const hasGuardrailSources =
        (baseGuardrails && Object.keys(baseGuardrails).length > 0) ||
        skillGuardrailSources.length > 0;

      cliOutput.blank();
      cliOutput.print('**Policy & Guardrail analysis:**');
      cliOutput.print(`  Tool policy merge strategy: \`${toolPolicyStrategy}\``);
      if (finalToolPolicies.length > 0) {
        cliOutput.print(
          `  Final tool policies (${finalToolPolicies.length}): ${finalToolPolicies.join(', ')}`,
        );
      } else {
        cliOutput.print('  Final tool policies: none');
        if (baseToolPolicies.length > 0 || skillPolicySources.length > 0) {
          warnings.push(
            `Tool policy merge (${toolPolicyStrategy}) resulted in an empty set. ` +
              `Confirm agent and skill toolPolicies share at least one common entry.`,
          );
        }
      }

      if (options.verbose) {
        if (baseToolPolicies.length > 0) {
          cliOutput.print(
            `  Agent base tool policies (${baseToolPolicies.length}): ${baseToolPolicies.join(', ')}`,
          );
        }
        for (const entry of skillPolicySources) {
          cliOutput.print(
            `  Skill ${entry.skillId} tool policies (${entry.policies.length}): ${entry.policies.join(', ')}`,
          );
        }
      }

      cliOutput.print(`  Guardrail merge strategy: \`${guardrailStrategy}\``);
      if (finalGuardrails && Object.keys(finalGuardrails).length > 0) {
        const guardrailKeys = Object.keys(finalGuardrails);
        cliOutput.print(
          `  Guardrails configured (${guardrailKeys.length}): ${guardrailKeys.join(', ')}`,
        );
      } else {
        cliOutput.print('  Guardrails configured: none');
        if (hasGuardrailSources) {
          warnings.push(
            `Guardrail merge (${guardrailStrategy}) produced no guardrails. ` +
              `Check guardrail definitions for conflicts or compatibility.`,
          );
        }
      }

      if (options.verbose) {
        if (baseGuardrails && Object.keys(baseGuardrails).length > 0) {
          cliOutput.print(`  Agent base guardrail keys: ${Object.keys(baseGuardrails).join(', ')}`);
        }
        for (const entry of skillGuardrailSources) {
          if (entry.guardrails) {
            cliOutput.print(
              `  Skill ${entry.skillId} guardrail keys: ${Object.keys(entry.guardrails).join(', ')}`,
            );
          }
        }
      }

      const effectiveMcpServers = new Map(
        composedConfig.mcpServers.map((server) => [server.id, server]),
      );
      cliOutput.blank();
      cliOutput.print('**MCP coverage:**');
      for (const [serverId] of mcpServerMap.entries()) {
        const effective = effectiveMcpServers.get(serverId);
        if (effective) {
          const consumers =
            effective.usedBySkills.length > 0 ? effective.usedBySkills.join(', ') : 'referenced';
          const toolSummary =
            effective.allowedTools && effective.allowedTools.length > 0
              ? `tools: ${effective.allowedTools.join(', ')}`
              : 'tools: all';
          cliOutput.print(
            `  - ${serverId} [${effective.namespace}] → ${consumers} (${toolSummary})`,
          );
        } else {
          cliOutput.print(`  - ${serverId} (unused)`);
        }
      }

      const effectiveWorkflows = new Map(
        composedConfig.workflows.map((workflow) => [workflow.id, workflow]),
      );
      cliOutput.blank();
      cliOutput.print('**Workflow coverage:**');
      for (const [workflowId, workflowEntry] of workflowMap.entries()) {
        const effective = effectiveWorkflows.get(workflowId);
        if (effective) {
          const consumers =
            effective.usedBySkills.length > 0 ? effective.usedBySkills.join(', ') : 'referenced';
          cliOutput.print(
            `  - ${workflowId} (${workflowEntry.enabled === false ? 'disabled' : 'enabled'}) → ${consumers}`,
          );
        } else {
          cliOutput.print(
            `  - ${workflowId} (${workflowEntry.enabled === false ? 'disabled' : 'enabled'}) → unused`,
          );
        }
      }
    }

    // 7. Report results
    cliOutput.blank();
    cliOutput.print('**=== Diagnostics Complete ===**');
    cliOutput.blank();

    if (errors.length > 0) {
      cliOutput.error(`Found ${errors.length} error(s):`);
      for (const error of errors) {
        cliOutput.error(`  ${error}`);
      }
    }

    if (warnings.length > 0) {
      cliOutput.blank();
      cliOutput.warn(`Found ${warnings.length} warning(s):`);
      for (const warning of warnings) {
        cliOutput.warn(`  ${warning}`);
      }
    }

    if (errors.length === 0 && warnings.length === 0) {
      cliOutput.success('No issues found. Configuration is valid!');
    }

    if (errors.length > 0) {
      throw new Error('Configuration validation failed');
    }
  } catch (error) {
    // Improve Zod error surfacing with precise field paths
    if (error && typeof error === 'object' && 'issues' in (error as Record<string, unknown>)) {
      const zodErr = error as {
        issues?: Array<{ path: (string | number)[]; message: string }>;
        message?: string;
      };
      if (Array.isArray(zodErr.issues) && zodErr.issues.length > 0) {
        cliOutput.error('Schema validation failed with the following issues:');
        for (const issue of zodErr.issues) {
          const path = formatPath(issue.path ?? []);
          cliOutput.error(`  ${path}: ${issue.message}`);
        }
        throw new Error('Configuration validation failed');
      }
    }

    if (error instanceof Error && error.message !== 'Configuration validation failed') {
      cliOutput.error('Fatal error during diagnostics');
      cliOutput.error(error.message);
    }
    throw error;
  }
}
