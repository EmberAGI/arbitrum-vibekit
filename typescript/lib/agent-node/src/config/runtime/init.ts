/**
 * Config Runtime Initialization
 * Main entry point for loading and initializing agent configuration
 */

import { resolve, dirname } from 'path';

import type { AgentCard } from '@a2a-js/sdk';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Tool } from 'ai';

import { Logger } from '../../utils/logger.js';
import type { WorkflowRuntime } from '../../workflows/runtime.js';
import { composeAgentCard } from '../composers/card-composer.js';
import { composeEffectiveSets, type EffectiveSets } from '../composers/effective-set-composer.js';
import { composePrompt, type ComposedPrompt } from '../composers/prompt-composer.js';
import { loadAgentBase } from '../loaders/agent-loader.js';
import { loadManifest } from '../loaders/manifest-loader.js';
import { loadMCPRegistry, type LoadedMCPRegistry } from '../loaders/mcp-loader.js';
import { loadSkills, type LoadedSkill } from '../loaders/skill-loader.js';
import { loadWorkflowRegistry, type LoadedWorkflowRegistry } from '../loaders/workflow-loader.js';
import type { ModelConfig } from '../schemas/agent.schema.js';
import type { AgentManifest } from '../schemas/manifest.schema.js';
import type { SkillModelOverride } from '../schemas/skill.schema.js';

import { MCPInstantiator, type MCPServerInstance } from './mcp-instantiator.js';
import { loadTools, closeAllMCPClients } from './tool-loader.js';
import { ConfigWorkspaceWatcher, type ChangeHandler, type FileChange } from './watcher.js';
import { WorkflowPluginLoader, type LoadedWorkflowPlugin } from './workflow-loader.js';

export interface InitOptions {
  root: string;
  dev?: boolean;
  onHotReload?: HotReloadHandler;
}

export interface ModelConfigRuntime {
  agent: ModelConfig;
  skills: Map<string, SkillModelOverride>;
}

export interface HotReloadEvent {
  change: FileChange;
  config: AgentConfig;
  updated: {
    prompt?: boolean;
    agentCard?: boolean;
    models?: boolean;
    mcp?: {
      started: string[];
      stopped: string[];
      restarted: string[];
    };
    workflows?: {
      added: string[];
      removed: string[];
      reloaded: string[];
    };
  };
}

export type HotReloadHandler = (event: HotReloadEvent) => Promise<void> | void;

interface WorkspaceSnapshot {
  manifest: AgentManifest;
  manifestDir: string;
  agentBase: ReturnType<typeof loadAgentBase>;
  skills: LoadedSkill[];
  mcpRegistry: LoadedMCPRegistry;
  workflowRegistry: LoadedWorkflowRegistry;
  prompt: ComposedPrompt;
  agentCard: AgentCard;
  effectiveSets: EffectiveSets;
  models: ModelConfigRuntime;
}

const DEFAULT_AGENT_MODEL = {
  provider: 'openrouter',
  name: 'anthropic/claude-sonnet-4.5',
  params: {
    temperature: 0.7,
    topP: 1.0,
    maxTokens: 4096,
    reasoning: 'low' as const,
  },
} as const;

function resolveAgentModel(model: ModelConfig | undefined): ModelConfig {
  const provider = model?.provider ?? DEFAULT_AGENT_MODEL.provider;
  const name = model?.name ?? DEFAULT_AGENT_MODEL.name;
  const params = {
    temperature: model?.params?.temperature ?? DEFAULT_AGENT_MODEL.params.temperature,
    topP: model?.params?.topP ?? DEFAULT_AGENT_MODEL.params.topP,
    maxTokens: model?.params?.maxTokens ?? DEFAULT_AGENT_MODEL.params.maxTokens,
    reasoning: model?.params?.reasoning ?? DEFAULT_AGENT_MODEL.params.reasoning,
  } as NonNullable<ModelConfig['params']>;

  return {
    provider,
    name,
    params,
  };
}

function cloneSkillModelOverride(override: SkillModelOverride): SkillModelOverride {
  return {
    ...(override.provider ? { provider: override.provider } : {}),
    ...(override.name ? { name: override.name } : {}),
    ...(override.params
      ? {
          params: {
            ...(override.params.temperature !== undefined
              ? { temperature: override.params.temperature }
              : {}),
            ...(override.params.reasoning !== undefined
              ? { reasoning: override.params.reasoning }
              : {}),
          },
        }
      : {}),
  };
}

function buildModelConfig(
  agentBase: ReturnType<typeof loadAgentBase>,
  skills: LoadedSkill[],
): ModelConfigRuntime {
  const agentModel = resolveAgentModel(agentBase.frontmatter.model);
  const skillModelOverrides = new Map<string, SkillModelOverride>();

  for (const skill of skills) {
    if (skill.frontmatter.model) {
      skillModelOverrides.set(
        skill.frontmatter.skill.id,
        cloneSkillModelOverride(skill.frontmatter.model),
      );
    }
  }

  return {
    agent: agentModel,
    skills: skillModelOverrides,
  };
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

function modelsEqual(a: ModelConfigRuntime, b: ModelConfigRuntime): boolean {
  if (a.agent.provider !== b.agent.provider || a.agent.name !== b.agent.name) {
    return false;
  }

  const paramsA = a.agent.params ?? DEFAULT_AGENT_MODEL.params;
  const paramsB = b.agent.params ?? DEFAULT_AGENT_MODEL.params;

  if (
    paramsA.temperature !== paramsB.temperature ||
    paramsA.topP !== paramsB.topP ||
    paramsA.maxTokens !== paramsB.maxTokens ||
    paramsA.reasoning !== paramsB.reasoning
  ) {
    return false;
  }

  if (a.skills.size !== b.skills.size) {
    return false;
  }

  for (const [skillId, overrideA] of a.skills.entries()) {
    const overrideB = b.skills.get(skillId);
    if (!overrideB) {
      return false;
    }
    if (!deepEqual(overrideA, overrideB)) {
      return false;
    }
  }

  return true;
}

export interface AgentConfig {
  agentCard: AgentCard;
  finalPrompt: ComposedPrompt;
  effectiveSets: EffectiveSets;
  mcpInstances: Map<string, MCPServerInstance>;
  workflowPlugins: Map<string, LoadedWorkflowPlugin>;
  workflowRuntime?: WorkflowRuntime;
  models: ModelConfigRuntime;
  tools: Map<string, Tool>;
  mcpClients: Map<string, Client>;
}

export interface AgentConfigHandle {
  config: AgentConfig;
  close: () => Promise<void>;
  reload: (change?: FileChange) => Promise<void>;
  onHotReload: (handler: HotReloadHandler) => void;
}

export async function initFromConfigWorkspace(options: InitOptions): Promise<AgentConfigHandle> {
  const logger = Logger.getInstance('ConfigRuntime');
  const configRoot = resolve(options.root);
  const manifestPath = resolve(configRoot, 'agent.manifest.json');
  const defaultRegistries = { mcp: './mcp.json', workflows: './workflow.json' } as const;

  const composeWorkspace = (): WorkspaceSnapshot => {
    const { manifest } = loadManifest(manifestPath);
    const manifestDir = dirname(manifestPath);
    const registries = manifest.registries ?? defaultRegistries;
    const mcpRegistryPath = resolve(manifestDir, registries.mcp);
    const workflowRegistryPath = resolve(manifestDir, registries.workflows);

    const mcpRegistry = loadMCPRegistry(mcpRegistryPath);
    const workflowRegistry = loadWorkflowRegistry(workflowRegistryPath);
    const agentPath = resolve(configRoot, 'agent.md');
    const agentBase = loadAgentBase(agentPath);
    const skills = loadSkills(manifest.skills, manifestDir);

    const prompt = composePrompt(agentBase, skills);
    const mergePolicy = manifest.merge ?? { card: undefined };
    const agentCard = composeAgentCard(agentBase, skills, mergePolicy);
    const effectiveSets = composeEffectiveSets(mcpRegistry, workflowRegistry, skills);
    const models = buildModelConfig(agentBase, skills);

    return {
      manifest,
      manifestDir,
      agentBase,
      skills,
      mcpRegistry,
      workflowRegistry,
      prompt,
      agentCard,
      effectiveSets,
      models,
    };
  };

  logger.info('Initializing agent from config workspace', { root: configRoot });

  let currentSnapshot = composeWorkspace();

  logger.info('Loaded config workspace', {
    skills: currentSnapshot.skills.length,
    mcpServers: Object.keys(currentSnapshot.mcpRegistry.registry.mcpServers).length,
    workflows: currentSnapshot.workflowRegistry.registry.workflows.length,
  });

  const mcpInstantiator = new MCPInstantiator();
  const mcpInstances = mcpInstantiator.instantiate(currentSnapshot.effectiveSets.mcpServers);

  const workflowLoader = new WorkflowPluginLoader();
  const workflowPlugins = await workflowLoader.load(
    currentSnapshot.effectiveSets.workflows,
    currentSnapshot.manifestDir,
  );

  // Load tools from MCP servers and workflows
  const { tools, mcpClients, workflowRuntime } = await loadTools(mcpInstances, workflowPlugins);

  logger.info('Composed configuration', {
    effectiveMcpServers: currentSnapshot.effectiveSets.mcpServers.length,
    effectiveWorkflows: currentSnapshot.effectiveSets.workflows.length,
  });

  logger.info('Runtime initialized', {
    mcpInstances: mcpInstances.size,
    workflowPlugins: workflowPlugins.size,
    tools: tools.size,
  });

  const agentConfig: AgentConfig = {
    agentCard: currentSnapshot.agentCard,
    finalPrompt: currentSnapshot.prompt,
    effectiveSets: currentSnapshot.effectiveSets,
    mcpInstances,
    workflowPlugins,
    workflowRuntime,
    models: currentSnapshot.models,
    tools,
    mcpClients,
  };

  const hotReloadHandlers: HotReloadHandler[] = [];
  if (options.onHotReload) {
    hotReloadHandlers.push(options.onHotReload);
  }

  const notifyHotReload = async (event: HotReloadEvent): Promise<void> => {
    for (const handler of hotReloadHandlers) {
      try {
        await handler(event);
      } catch (error) {
        logger.error('Hot reload handler error', error);
      }
    }
  };

  const manualChange: FileChange = {
    type: 'manual',
    path: configRoot,
    event: 'change',
  };

  const updatePromptAndCard = (
    snapshot: WorkspaceSnapshot,
    updated: HotReloadEvent['updated'],
  ): void => {
    if (snapshot.prompt.content !== agentConfig.finalPrompt.content) {
      updated.prompt = true;
    }

    if (!deepEqual(snapshot.agentCard, agentConfig.agentCard)) {
      updated.agentCard = true;
    }

    agentConfig.finalPrompt = snapshot.prompt;
    agentConfig.agentCard = snapshot.agentCard;
  };

  const reloadTools = async (): Promise<void> => {
    // Close existing MCP clients
    await closeAllMCPClients(agentConfig.mcpClients);

    // Reload tools from current MCP instances and workflow plugins
    const { tools, mcpClients, workflowRuntime } = await loadTools(
      agentConfig.mcpInstances,
      agentConfig.workflowPlugins,
    );

    agentConfig.tools = tools;
    agentConfig.mcpClients = mcpClients;
    agentConfig.workflowRuntime = workflowRuntime;

    logger.info('Tools reloaded', { toolCount: tools.size });
  };

  const reloadMcpServers = async (
    snapshot: WorkspaceSnapshot,
    updated: HotReloadEvent['updated'],
  ): Promise<void> => {
    const result = await mcpInstantiator.reload(snapshot.effectiveSets.mcpServers);
    if (result.started.length || result.stopped.length || result.restarted.length) {
      updated.mcp = result;
      // Reload tools when MCP servers change
      await reloadTools();
    }
    agentConfig.mcpInstances = mcpInstantiator.getInstances();
  };

  const reloadWorkflows = async (
    snapshot: WorkspaceSnapshot,
    updated: HotReloadEvent['updated'],
  ): Promise<void> => {
    const current = new Map(agentConfig.effectiveSets.workflows.map((wf) => [wf.id, wf]));
    const next = new Map(snapshot.effectiveSets.workflows.map((wf) => [wf.id, wf]));

    const added: string[] = [];
    const removed: string[] = [];
    const reloaded: string[] = [];

    for (const id of current.keys()) {
      if (!next.has(id) || !next.get(id)?.entry.enabled) {
        workflowLoader.remove(id);
        agentConfig.workflowPlugins.delete(id);
        removed.push(id);
      }
    }

    for (const workflow of snapshot.effectiveSets.workflows) {
      if (!workflow.entry.enabled) {
        workflowLoader.remove(workflow.id);
        agentConfig.workflowPlugins.delete(workflow.id);
        continue;
      }

      const existing = current.get(workflow.id);

      if (!existing) {
        await workflowLoader.load([workflow], snapshot.manifestDir);
        const plugin = workflowLoader.getPlugin(workflow.id);
        if (plugin) {
          agentConfig.workflowPlugins.set(workflow.id, plugin);
        }
        added.push(workflow.id);
        continue;
      }

      const entryChanged = !deepEqual(existing.entry, workflow.entry);
      const overridesChanged = !deepEqual(existing.overrides, workflow.overrides);

      if (entryChanged) {
        await workflowLoader.reload(workflow.id, workflow, snapshot.manifestDir);
        const plugin = workflowLoader.getPlugin(workflow.id);
        if (plugin) {
          agentConfig.workflowPlugins.set(workflow.id, plugin);
        }
        reloaded.push(workflow.id);
      } else if (overridesChanged) {
        const plugin = agentConfig.workflowPlugins.get(workflow.id);
        if (plugin) {
          plugin.overrides = workflow.overrides;
        }
        reloaded.push(workflow.id);
      }
    }

    if (added.length || removed.length || reloaded.length) {
      updated.workflows = {
        added,
        removed,
        reloaded,
      };
      // Reload tools when workflows change
      await reloadTools();
    }

    agentConfig.workflowPlugins = new Map(workflowLoader.getPlugins());
  };

  const reloadWorkflowModule = async (
    change: FileChange,
    updated: HotReloadEvent['updated'],
  ): Promise<void> => {
    const pluginEntry = Array.from(agentConfig.workflowPlugins.values()).find(
      (plugin) => plugin.source === change.path,
    );

    if (!pluginEntry) {
      logger.warn(`Workflow module change detected but no plugin matched path ${change.path}`);
      return;
    }

    const workflow = agentConfig.effectiveSets.workflows.find((wf) => wf.id === pluginEntry.id);
    if (!workflow) {
      logger.warn(`Workflow ${pluginEntry.id} not found in effective set during reload`);
      return;
    }

    await workflowLoader.reload(pluginEntry.id, workflow, currentSnapshot.manifestDir);
    const reloadedPlugin = workflowLoader.getPlugin(pluginEntry.id);
    if (reloadedPlugin) {
      agentConfig.workflowPlugins.set(pluginEntry.id, reloadedPlugin);
    }

    updated.workflows = {
      added: [],
      removed: [],
      reloaded: [pluginEntry.id],
    };
  };

  let reloadQueue = Promise.resolve();

  const performReload = async (change: FileChange): Promise<void> => {
    const updated: HotReloadEvent['updated'] = {};

    if (change.type === 'workflow-module') {
      await reloadWorkflowModule(change, updated);
      await notifyHotReload({ change, config: agentConfig, updated });
      return;
    }

    const nextSnapshot = composeWorkspace();

    updatePromptAndCard(nextSnapshot, updated);

    if (!modelsEqual(agentConfig.models, nextSnapshot.models)) {
      agentConfig.models = nextSnapshot.models;
      updated.models = true;
    }

    const requiresMcpReload =
      change.type === 'manual' ||
      change.type === 'manifest' ||
      change.type === 'skill' ||
      change.type === 'mcp' ||
      change.type === 'agent';

    if (requiresMcpReload) {
      await reloadMcpServers(nextSnapshot, updated);
    }

    const requiresWorkflowReload =
      change.type === 'manual' ||
      change.type === 'manifest' ||
      change.type === 'skill' ||
      change.type === 'workflow';

    if (requiresWorkflowReload) {
      await reloadWorkflows(nextSnapshot, updated);
    }

    agentConfig.effectiveSets = nextSnapshot.effectiveSets;
    agentConfig.workflowPlugins = new Map(workflowLoader.getPlugins());
    agentConfig.mcpInstances = mcpInstantiator.getInstances();
    currentSnapshot = nextSnapshot;

    await notifyHotReload({ change, config: agentConfig, updated });
  };

  const enqueueReload = (change: FileChange): Promise<void> => {
    reloadQueue = reloadQueue
      .then(() => performReload(change))
      .catch((error) => {
        logger.error('Hot reload failed', error);
      });
    return reloadQueue;
  };

  let watcher: ConfigWorkspaceWatcher | undefined;
  const reloadHandler = (change: FileChange): Promise<void> => enqueueReload(change);

  if (options.dev) {
    watcher = new ConfigWorkspaceWatcher();

    const onChange: ChangeHandler = async (change) => {
      logger.info(`Config change detected, reloading...`, { type: change.type });
      try {
        await reloadHandler(change);
      } catch (error) {
        logger.error('Reload failed', error);
      }
    };

    watcher.start(configRoot, onChange);
  }

  const close = async (): Promise<void> => {
    logger.info('Shutting down config runtime');

    if (watcher) {
      watcher.stop();
    }

    // Close MCP clients
    await closeAllMCPClients(agentConfig.mcpClients);

    // Shutdown MCP server processes
    await mcpInstantiator.shutdown();

    // Clear workflow plugins
    workflowLoader.clear();

    logger.info('Config runtime shutdown complete');
  };

  return {
    config: agentConfig,
    close,
    reload: (change?: FileChange) => reloadHandler(change ?? manualChange),
    onHotReload: (handler: HotReloadHandler) => {
      hotReloadHandlers.push(handler);
    },
  };
}
