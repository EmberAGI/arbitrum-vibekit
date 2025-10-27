/**
 * Config Orchestrator
 * Main entry point for loading and composing agent configuration
 */

import { resolve, dirname } from 'path';

import type { AgentCard } from '@a2a-js/sdk';

import { composeAgentCard } from './composers/card-composer.js';
import {
  composeEffectiveSets,
  type EffectiveMCPServer,
  type EffectiveWorkflow,
} from './composers/effective-set-composer.js';
import { composePrompt, type ComposedPrompt } from './composers/prompt-composer.js';
import { loadAgentBase } from './loaders/agent-loader.js';
import { loadManifest } from './loaders/manifest-loader.js';
import { loadMCPRegistry } from './loaders/mcp-loader.js';
import { loadSkills } from './loaders/skill-loader.js';
import { loadWorkflowRegistry } from './loaders/workflow-loader.js';

/**
 * Fully composed agent configuration
 */
export interface ComposedAgentConfig {
  prompt: ComposedPrompt;
  card: AgentCard;
  mcpServers: EffectiveMCPServer[];
  workflows: EffectiveWorkflow[];
}

/**
 * Load and compose full agent configuration from manifest
 * @param manifestPath - Path to agent.manifest.json
 * @returns Composed agent configuration
 */
export function loadAgentConfig(manifestPath: string): Promise<ComposedAgentConfig> {
  return Promise.resolve().then(() => {
    // Load manifest
    const { manifest } = loadManifest(manifestPath);
    const manifestDir = dirname(manifestPath);

    // Load registries
    const mcpRegistryPath = resolve(manifestDir, manifest.registries?.mcp ?? './mcp.json');
    const workflowRegistryPath = resolve(
      manifestDir,
      manifest.registries?.workflows ?? './workflow.json',
    );

    const mcpRegistry = loadMCPRegistry(mcpRegistryPath);
    const workflowRegistry = loadWorkflowRegistry(workflowRegistryPath);

    // Load agent base
    const agentPath = resolve(manifestDir, 'agent.md');
    const agentBase = loadAgentBase(agentPath);

    // Load skills
    const skills = loadSkills(manifest.skills, manifestDir);

    // Compose prompt and card
    const prompt = composePrompt(agentBase, skills);
    const mergePolicy = manifest.merge ?? { card: undefined };
    const card = composeAgentCard(agentBase, skills, mergePolicy);

    // Compose effective sets
    const effectiveSets = composeEffectiveSets(mcpRegistry, workflowRegistry, skills);

    return {
      prompt,
      card,
      mcpServers: effectiveSets.mcpServers,
      workflows: effectiveSets.workflows,
    };
  });
}

/**
 * Load agent config with default manifest location
 * @param configDir - Config directory (defaults to ./config)
 * @returns Composed agent configuration
 */
export function loadAgentConfigFromDefault(
  configDir: string = './config',
): Promise<ComposedAgentConfig> {
  const manifestPath = resolve(configDir, 'agent.manifest.json');
  return loadAgentConfig(manifestPath);
}
