import type {
  CreateAgentRuntimeOptions,
} from 'agent-runtime';
import type { AgentRuntimeSigningService } from 'agent-runtime/internal';

import { createEmberLendingDomain, type EmberLendingLifecycleState } from './sharedEmberAdapter.js';
import {
  createEmberLendingSharedEmberHttpHost,
  resolveEmberLendingSharedEmberBaseUrl,
} from './sharedEmberHttpHost.js';

const DEFAULT_EMBER_LENDING_MODEL = 'openai/gpt-5.4-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const EMBER_LENDING_SYSTEM_PROMPT =
  'You are the Ember lending managed subagent running on agent-runtime. Stay concise, operate only within the current mandate, and escalate whenever the bounded Shared Ember surface cannot safely complete the request.';

export type EmberLendingGatewayEnv = NodeJS.ProcessEnv & {
  OPENROUTER_API_KEY?: string;
  EMBER_LENDING_MODEL?: string;
  DATABASE_URL?: string;
  SHARED_EMBER_BASE_URL?: string;
  EMBER_LENDING_OWS_WALLET_NAME?: string;
  EMBER_LENDING_OWS_PASSPHRASE?: string;
  EMBER_LENDING_OWS_VAULT_PATH?: string;
};

type EmberLendingAgentRuntimeOptions = CreateAgentRuntimeOptions<EmberLendingLifecycleState>;

export type EmberLendingAgentConfig = Pick<
  EmberLendingAgentRuntimeOptions,
  'agentOptions' | 'databaseUrl' | 'domain' | 'model' | 'systemPrompt' | 'tools'
>;

type EmberLendingGatewayModel = EmberLendingAgentConfig['model'];

export type EmberLendingGatewayDependencies = {
  protocolHost: ReturnType<typeof createEmberLendingSharedEmberHttpHost> | undefined;
};

type CreateEmberLendingAgentConfigOptions = {
  runtimeSigning?: AgentRuntimeSigningService;
  runtimeSignerRef?: string;
};

function requireEnvValue(
  value: string | undefined,
  name: keyof EmberLendingGatewayEnv,
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return normalized;
}

function createOpenRouterModel(modelId: string): EmberLendingGatewayModel {
  return {
    id: modelId,
    name: modelId,
    api: 'openai-responses',
    provider: 'openrouter',
    baseUrl: OPENROUTER_BASE_URL,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128_000,
    maxTokens: 4_096,
  };
}

export function createEmberLendingAgentConfig(
  env: EmberLendingGatewayEnv = process.env,
  options: CreateEmberLendingAgentConfigOptions = {},
): EmberLendingAgentConfig {
  const apiKey = requireEnvValue(env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY');
  const modelId = env.EMBER_LENDING_MODEL?.trim() || DEFAULT_EMBER_LENDING_MODEL;
  const { protocolHost } = resolveEmberLendingGatewayDependencies(env);

  return {
    model: createOpenRouterModel(modelId),
    systemPrompt: EMBER_LENDING_SYSTEM_PROMPT,
    databaseUrl: env.DATABASE_URL,
    tools: [],
    domain: createEmberLendingDomain({
      protocolHost,
      runtimeSigning: options.runtimeSigning,
      runtimeSignerRef: options.runtimeSignerRef,
    }),
    agentOptions: {
      initialState: {
        thinkingLevel: 'low',
      },
      getApiKey: () => apiKey,
    },
  };
}

export function resolveEmberLendingGatewayDependencies(
  env: EmberLendingGatewayEnv = process.env,
): EmberLendingGatewayDependencies {
  const sharedEmberBaseUrl = resolveEmberLendingSharedEmberBaseUrl(env);

  return {
    protocolHost: sharedEmberBaseUrl
      ? createEmberLendingSharedEmberHttpHost({
          baseUrl: sharedEmberBaseUrl,
        })
      : undefined,
  };
}
