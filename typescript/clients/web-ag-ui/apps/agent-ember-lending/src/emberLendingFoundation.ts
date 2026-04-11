import type {
  CreateAgentRuntimeOptions,
} from 'agent-runtime';
import type { AgentRuntimeSigningService } from 'agent-runtime/internal';

import {
  createEmberLendingDomain,
  type EmberLendingAnchoredPayloadResolver,
  type EmberLendingLifecycleState,
} from './sharedEmberAdapter.js';
import {
  createEmberLendingOnchainActionsAnchoredPayloadResolver,
  resolveEmberLendingOnchainActionsApiUrl,
} from './onchainActionsPayloadResolver.js';
import {
  createEmberLendingSharedEmberHttpHost,
  resolveEmberLendingSharedEmberBaseUrl,
} from './sharedEmberHttpHost.js';

const DEFAULT_EMBER_LENDING_MODEL = 'openai/gpt-5.4';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const EMBER_LENDING_SYSTEM_PROMPT =
  'You are the Ember lending managed subagent running on agent-runtime. Stay concise, operate only within the current mandate, and escalate whenever the bounded Shared Ember surface cannot safely complete the request. Treat the live Shared Ember execution context as authoritative for what is currently admitted: if active reservations or owned units expose control paths such as lending.supply, lending.borrow, lending.withdraw, or lending.repay, those follow-up actions are in scope for this thread even when the top-line mandate summary only says lend or supply. Compare the managed_lending_policy against the live lending_position_scopes before acting: managed_lending_policy contains the mandate boundary and its provenance, while lending_position_scopes contain the live scope state you must judge against that boundary. Use managed_lending_policy.max_ltv_bps and managed_lending_policy.min_health_factor as policy limits, not as live measurements. If live scope freshness is stale or missing for a decision that depends on health, headroom, or debt state, escalate instead of claiming the mandate is satisfied. Keep the concepts distinct: lending.supply adds collateral, lending.withdraw removes collateral, lending.borrow increases debt, and lending.repay pays back debt. Never satisfy a repay request by creating another supply plan, never satisfy a withdraw request by creating another repay or supply plan, and never treat borrow as equivalent to adding collateral. When a specific follow-up reservation is active, prefer that exact control path in the planning command. When the user asks to create, refresh, or retry a transaction plan, call the planning tool in that turn instead of only summarizing prior plan state. When the user asks to execute the current plan, call the execution tool instead of only describing what would happen. If the current thread already has a candidate plan plus an active reservation summary or active reservation for that plan control path, treat that as sufficient evidence to attempt execution through Shared Ember now. Do not claim the reservation is inactive unless the current thread state explicitly shows that no matching active reservation exists. When the user asks for an exact amount or any partial amount such as half, the planning command must include requested_quantities with exact base-unit quantity strings; omitting requested_quantities is invalid for that request. After a transaction lands, keep working from the refreshed execution context instead of routing back through the portfolio manager for delegation refresh.';

export type EmberLendingGatewayEnv = NodeJS.ProcessEnv & {
  OPENROUTER_API_KEY?: string;
  EMBER_LENDING_MODEL?: string;
  DATABASE_URL?: string;
  SHARED_EMBER_BASE_URL?: string;
  ONCHAIN_ACTIONS_API_URL?: string;
  ARBITRUM_RPC_URL?: string;
  ETHEREUM_RPC_URL?: string;
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
  anchoredPayloadResolver: EmberLendingAnchoredPayloadResolver;
};

type CreateEmberLendingAgentConfigOptions = {
  runtimeSigning?: AgentRuntimeSigningService;
  dependencies?: EmberLendingGatewayDependencies;
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
  const { protocolHost, anchoredPayloadResolver } =
    options.dependencies ?? resolveEmberLendingGatewayDependencies(env);

  return {
    model: createOpenRouterModel(modelId),
    systemPrompt: EMBER_LENDING_SYSTEM_PROMPT,
    databaseUrl: env.DATABASE_URL,
    tools: [],
    domain: createEmberLendingDomain({
      protocolHost,
      runtimeSigning: options.runtimeSigning,
      anchoredPayloadResolver,
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
  const onchainActionsApiUrl = resolveEmberLendingOnchainActionsApiUrl(env);

  return {
    protocolHost: sharedEmberBaseUrl
      ? createEmberLendingSharedEmberHttpHost({
          baseUrl: sharedEmberBaseUrl,
        })
      : undefined,
    anchoredPayloadResolver: createEmberLendingOnchainActionsAnchoredPayloadResolver({
      baseUrl: onchainActionsApiUrl,
      env,
    }),
  };
}
