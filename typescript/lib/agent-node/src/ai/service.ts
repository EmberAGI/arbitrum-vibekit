import {
  streamText,
  stepCountIs,
  type ModelMessage,
  type LanguageModel,
  type Tool,
  type StreamTextResult,
} from 'ai';

import type { ModelConfigRuntime } from '../config/runtime/init.js';
import type { SkillModelOverride } from '../config/schemas/skill.schema.js';
import { serviceConfig } from '../config.js';
import { Logger } from '../utils/logger.js';

import {
  createProviderSelector,
  getAvailableProviders,
  DEFAULT_MODELS,
  type ProviderSelector,
} from './providers/index.js';

export interface AIConfig {
  provider?: 'openrouter' | 'openai' | 'xai' | 'hyperbolic';
  model?: string;
  openRouterApiKey?: string;
  openaiApiKey?: string;
  xaiApiKey?: string;
  hyperbolicApiKey?: string;
}

export interface AIContext {
  message: string;
  contextId: string;
  history?: ModelMessage[];
}

export interface AIOptions {
  tools?: Record<string, Tool>;
  onToolCall?: (name: string, args: unknown) => Promise<unknown>;
}

export interface AIResponse {
  kind?: 'message' | 'task';
  response?: string;
  action?: string;
  params?: unknown;
  tool_calls?: Array<{ name: string; arguments: unknown }>;
  artifacts?: unknown[];
  error?: unknown;
  parts?: unknown[];
}

export interface AIServiceRuntimeOptions {
  systemPrompt?: string;
  modelConfig?: ModelConfigRuntime;
  tools?: Map<string, Tool>;
}

type ReasoningLevel = 'none' | 'low' | 'medium' | 'high';

type ModelParameters = {
  temperature: number;
  topP: number;
  maxTokens: number;
  reasoning: ReasoningLevel;
};

function cloneSkillModelOverrides(
  overrides: Map<string, SkillModelOverride> | undefined,
): Map<string, SkillModelOverride> {
  if (!overrides) {
    return new Map();
  }

  return new Map(
    Array.from(overrides.entries()).map(([skillId, override]) => [
      skillId,
      {
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
      },
    ]),
  );
}

export class AIService {
  private config: AIConfig;
  private providerSelector: ProviderSelector;
  private selectedProvider: (model: string) => LanguageModel;
  private logger: Logger;
  private systemPrompt: string;
  private agentModelParams: ModelParameters;
  private skillModelOverrides: Map<string, SkillModelOverride>;
  private providerLocked: boolean;
  private modelLocked: boolean;
  public availableTools: Map<string, Tool> = new Map();

  constructor(configOverride: AIConfig, runtimeOptions: AIServiceRuntimeOptions = {}) {
    this.logger = Logger.getInstance('AIService');
    const runtimeAgentModel = runtimeOptions.modelConfig?.agent;
    this.providerLocked = Boolean(configOverride.provider ?? serviceConfig.ai.provider);
    this.modelLocked = Boolean(configOverride.model);
    const normalizedParams: ModelParameters = {
      temperature: runtimeAgentModel?.params?.temperature ?? 0.7,
      topP: runtimeAgentModel?.params?.topP ?? 1.0,
      maxTokens: runtimeAgentModel?.params?.maxTokens ?? 4096,
      reasoning: runtimeAgentModel?.params?.reasoning ?? 'low',
    };

    this.config = {
      provider:
        configOverride.provider ??
        serviceConfig.ai.provider ??
        runtimeAgentModel?.provider ??
        'openrouter',
      model: configOverride.model ?? runtimeAgentModel?.name,
      openRouterApiKey: configOverride.openRouterApiKey ?? serviceConfig.ai.openRouterApiKey,
      openaiApiKey: configOverride.openaiApiKey ?? serviceConfig.ai.openaiApiKey,
      xaiApiKey: configOverride.xaiApiKey ?? serviceConfig.ai.xaiApiKey,
      hyperbolicApiKey: configOverride.hyperbolicApiKey ?? serviceConfig.ai.hyperbolicApiKey,
    };

    // Initialize provider selector
    this.providerSelector = createProviderSelector({
      openRouterApiKey: this.config.openRouterApiKey,
      openaiApiKey: this.config.openaiApiKey,
      xaiApiKey: this.config.xaiApiKey,
      hyperbolicApiKey: this.config.hyperbolicApiKey,
    });

    // Log available providers (Decision 6)
    const availableProviders = getAvailableProviders(this.providerSelector);
    this.logger.debug(`Available AI providers: ${availableProviders.join(', ')}`);

    // Warn if provider not explicitly set (Decision 5)
    if (!configOverride.provider && !serviceConfig.ai.provider && !runtimeAgentModel?.provider) {
      this.logger.warn(
        'AI_PROVIDER not set, defaulting to "openrouter". Set AI_PROVIDER explicitly to suppress this warning.',
      );
    }

    // Select provider
    const provider = this.config.provider!;
    const providerFn = this.providerSelector[provider];

    if (!providerFn) {
      throw new Error(
        `Provider "${provider}" not available. ` +
          `Ensure ${provider.toUpperCase()}_API_KEY is configured in environment.`,
      );
    }

    this.selectedProvider = providerFn;

    // Initialize components
    this.systemPrompt = runtimeOptions.systemPrompt ?? '';
    this.agentModelParams = normalizedParams;
    this.skillModelOverrides = cloneSkillModelOverrides(runtimeOptions.modelConfig?.skills);

    // Populate available tools from runtime options
    if (runtimeOptions.tools) {
      this.availableTools = new Map(runtimeOptions.tools);
      this.logger.info(`Loaded ${this.availableTools.size} tools from runtime config`);
    }

    if (this.skillModelOverrides.size > 0) {
      this.logger.debug(
        `Skill model overrides loaded for: ${Array.from(this.skillModelOverrides.keys()).join(', ')}`,
      );
    }
  }

  setTools(tools: Map<string, Tool>): void {
    this.availableTools = new Map(tools);
    this.logger.info(`Tools updated: ${this.availableTools.size} tools available`);
  }

  getAvailableTools(): string[] {
    return Array.from(this.availableTools.keys());
  }

  updateSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  applyModelConfig(modelConfig: ModelConfigRuntime): void {
    this.skillModelOverrides = cloneSkillModelOverrides(modelConfig.skills);

    const params = {
      temperature: modelConfig.agent.params?.temperature ?? 0.7,
      topP: modelConfig.agent.params?.topP ?? 1.0,
      maxTokens: modelConfig.agent.params?.maxTokens ?? 4096,
      reasoning: modelConfig.agent.params?.reasoning ?? 'low',
    } as ModelParameters;

    this.agentModelParams = params;

    if (!this.providerLocked && modelConfig.agent.provider) {
      const provider = modelConfig.agent.provider;
      const providerFn = this.providerSelector[provider];
      if (!providerFn) {
        throw new Error(
          `Provider "${provider}" not available. Ensure corresponding API keys are configured.`,
        );
      }
      this.config.provider = provider;
      this.selectedProvider = providerFn;
    }

    if (!this.modelLocked && modelConfig.agent.name) {
      this.config.model = modelConfig.agent.name;
    }
  }

  streamMessage(
    context: AIContext,
    options?: AIOptions,
  ): StreamTextResult<Record<string, Tool>, unknown>['fullStream'] {
    if (!this.selectedProvider) {
      throw new Error('AI provider not initialized');
    }

    // Get system prompt
    const systemPrompt = this.systemPrompt;

    // Build messages array
    const messages: ModelMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    if (context.history) {
      messages.push(...context.history);
    }

    messages.push({
      role: 'user',
      content: context.message,
    });

    // Get configuration
    const maxSteps = serviceConfig.agent.maxSteps;
    const { temperature, topP, reasoning } = this.agentModelParams;
    const providerOptions = this.buildProviderOptions(reasoning);

    // Get tools for this request
    const tools = options?.tools || Object.fromEntries(this.availableTools);
    const onToolCall = options?.onToolCall;

    this.logger.debug('Starting streamText', { maxSteps });

    // Determine model to use
    const model = this.config.model ?? this.getDefaultModel();

    // Stream response using Vercel AI SDK with automatic tool calling loop
    const result = streamText({
      model: this.selectedProvider(model),
      messages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      temperature,
      topP,
      stopWhen: stepCountIs(maxSteps),
      providerOptions,
      ...(onToolCall ? { onToolCall } : {}),
    });

    // Return full stream to get tool call events including tool calls and results
    return result.fullStream;
  }

  private getDefaultModel(): string {
    return DEFAULT_MODELS[this.config.provider!] ?? DEFAULT_MODELS.openrouter;
  }

  private buildProviderOptions(
    reasoning: ReasoningLevel,
  ): { openrouter?: { reasoning: { effort: string } } } | undefined {
    if (!reasoning || reasoning === 'none') {
      return undefined;
    }

    if (this.config.provider === 'openrouter') {
      return {
        openrouter: {
          reasoning: {
            effort: reasoning,
          },
        },
      } as const;
    }

    return undefined;
  }

  /**
   * Get tools as a Record for Vercel AI SDK
   */
  getToolsAsRecord(): Record<string, Tool> {
    return Object.fromEntries(this.availableTools.entries());
  }
}
