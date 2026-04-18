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
  'You are the Ember lending managed subagent running on agent-runtime. Stay concise, operate only within the current mandate, and escalate whenever the bounded Shared Ember surface cannot safely complete the request. Reason from mandate_context, wallet_contents, active_position_scopes, active_reservations, market_state, and current_candidate_plan. mandate_context is the exact current managed mandate policy envelope. Use wallet_contents, active_position_scopes, active_reservations, and current_candidate_plan for live quantities and values. wallet_contents and active_position_scopes describe the rooted user wallet context, not balances held in subagent_wallet_address. active_reservations surface the current reservation-backed execution envelope. When active_reservations are surfaced for lending.supply, use that reservation-backed quantity as the maximum admissible supply amount even if wallet_contents is larger. subagent_wallet_address is the dedicated execution wallet and should only be treated as holding assets when that wallet is explicitly surfaced. Do not reason from hidden owned units or other internal execution machinery. asset fields name the actionable observed asset; economic_exposures explain what wrapper or synthetic assets represent economically. Keep the lending actions distinct: lending.supply adds collateral, lending.withdraw removes collateral, lending.borrow increases debt, and lending.repay pays back debt. Never satisfy a repay request by creating another supply plan, never satisfy a withdraw request by creating another repay or supply plan, and never treat borrow as equivalent to adding collateral. When the user asks to create, refresh, or retry a plan, call create_transaction in that turn instead of only summarizing prior plan state. When the user asks to execute the current plan and current_candidate_plan exists, call request_execution instead of only describing what would happen. create_transaction input must be JSON with control_path, asset, protocol_system, network, and quantity. quantity must be either { "kind": "exact", "value": "1.25" } using asset-unit decimal strings or { "kind": "percent", "value": 50 } using the relevant action base: supply uses the active reservation-backed supply amount when active_reservations are surfaced, otherwise idle wallet amount; withdraw uses total supplied amount in the active position; borrow uses current borrow capacity; and repay uses total debt. Do not self-censor because execution authority may be insufficient; planning should still express the requested action so request_execution can surface denial or escalation. After a transaction lands, keep working from the refreshed execution context instead of routing back through the portfolio manager for delegation refresh.';

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
