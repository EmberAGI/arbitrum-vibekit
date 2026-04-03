import type { CreateAgentRuntimeOptions } from 'agent-runtime';

import {
  createPortfolioManagerDomain,
  type PortfolioManagerLifecycleState,
} from './sharedEmberAdapter.js';
import {
  createPortfolioManagerSharedEmberHttpHost,
  resolvePortfolioManagerSharedEmberBaseUrl,
} from './sharedEmberHttpHost.js';
import { createPortfolioManagerDiagnosticTool } from './diagnosticTool.js';
import { createPortfolioManagerWalletAccountingTool } from './walletAccountingTool.js';
import { PORTFOLIO_MANAGER_DEFAULT_ACCOUNTING_AGENT_ID } from './sharedEmberOnboardingState.js';

const DEFAULT_PORTFOLIO_MANAGER_MODEL = 'openai/gpt-5.4-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const PORTFOLIO_MANAGER_SYSTEM_PROMPT =
  'You are the portfolio manager orchestrator running on agent-runtime. Stay concise, keep onboarding state explicit, and use read_wallet_accounting_state whenever the user asks about wallet contents, reservations, or account status in Shared Ember.';

export type PortfolioManagerGatewayEnv = NodeJS.ProcessEnv & {
  OPENROUTER_API_KEY?: string;
  PORTFOLIO_MANAGER_MODEL?: string;
  PORTFOLIO_MANAGER_ENABLE_DIAGNOSTIC_TOOLS?: string;
  DATABASE_URL?: string;
  SHARED_EMBER_BASE_URL?: string;
  PORTFOLIO_MANAGER_OWS_WALLET_NAME?: string;
  PORTFOLIO_MANAGER_OWS_PASSPHRASE?: string;
  PORTFOLIO_MANAGER_OWS_VAULT_PATH?: string;
};

type PortfolioManagerAgentRuntimeOptions = CreateAgentRuntimeOptions<PortfolioManagerLifecycleState>;

export type PortfolioManagerAgentConfig = Pick<
  PortfolioManagerAgentRuntimeOptions,
  'agentOptions' | 'databaseUrl' | 'domain' | 'model' | 'systemPrompt' | 'tools'
>;

type PortfolioManagerGatewayModel = PortfolioManagerAgentConfig['model'];

export type PortfolioManagerGatewayDependencies = {
  protocolHost: ReturnType<typeof createPortfolioManagerSharedEmberHttpHost> | null;
};

type CreatePortfolioManagerAgentConfigOptions = {
  controllerWalletAddress?: `0x${string}`;
};

function requireEnvValue(
  value: string | undefined,
  name: keyof PortfolioManagerGatewayEnv,
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return normalized;
}

function createOpenRouterModel(modelId: string): PortfolioManagerGatewayModel {
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

export function createPortfolioManagerAgentConfig(
  env: PortfolioManagerGatewayEnv = process.env,
  options: CreatePortfolioManagerAgentConfigOptions = {},
): PortfolioManagerAgentConfig {
  const apiKey = requireEnvValue(env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY');
  const modelId = env.PORTFOLIO_MANAGER_MODEL?.trim() || DEFAULT_PORTFOLIO_MANAGER_MODEL;
  const enableDiagnosticTools = env.PORTFOLIO_MANAGER_ENABLE_DIAGNOSTIC_TOOLS?.trim() === '1';
  const { protocolHost } = resolvePortfolioManagerGatewayDependencies(env);

  return {
    model: createOpenRouterModel(modelId),
    systemPrompt: PORTFOLIO_MANAGER_SYSTEM_PROMPT,
    databaseUrl: env.DATABASE_URL,
    tools: [
      ...(protocolHost
        ? [
            createPortfolioManagerWalletAccountingTool({
              protocolHost,
              agentId: PORTFOLIO_MANAGER_DEFAULT_ACCOUNTING_AGENT_ID,
            }),
          ]
        : []),
      ...(enableDiagnosticTools ? [createPortfolioManagerDiagnosticTool()] : []),
    ],
    domain: createPortfolioManagerDomain({
      ...(protocolHost
        ? {
            protocolHost,
          }
        : {}),
      ...(options.controllerWalletAddress
        ? {
            controllerWalletAddress: options.controllerWalletAddress,
          }
        : {}),
    }),
    agentOptions: {
      initialState: {
        thinkingLevel: 'low',
      },
      getApiKey: () => apiKey,
    },
  };
}

export function resolvePortfolioManagerGatewayDependencies(
  env: PortfolioManagerGatewayEnv = process.env,
): PortfolioManagerGatewayDependencies {
  const sharedEmberBaseUrl = resolvePortfolioManagerSharedEmberBaseUrl(env);

  return {
    protocolHost: sharedEmberBaseUrl
      ? createPortfolioManagerSharedEmberHttpHost({
          baseUrl: sharedEmberBaseUrl,
        })
      : null,
  };
}
