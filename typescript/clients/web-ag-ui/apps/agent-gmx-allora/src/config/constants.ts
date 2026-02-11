import { privateKeyToAccount } from 'viem/accounts';

export const ARBITRUM_CHAIN_ID = 42161;

const DEFAULT_ONCHAIN_ACTIONS_API_URL = 'https://api.emberai.xyz';
const DEFAULT_ALLORA_API_BASE_URL = 'https://api.allora.network';
// Allora Consumer API expects a "signature format" / target chain slug.
// Docs commonly use Sepolia: "ethereum-11155111".
// Production deployments should override via ALLORA_CHAIN_ID.
const DEFAULT_ALLORA_CHAIN_ID = 'ethereum-11155111';
const DEFAULT_ALLORA_INFERENCE_CACHE_TTL_MS = 30_000;
const DEFAULT_ALLORA_8H_INFERENCE_CACHE_TTL_MS = 30_000;
const DEFAULT_GMX_ALLORA_TX_EXECUTION_MODE: GmxAlloraTxExecutionMode = 'plan';
const DEFAULT_DELEGATIONS_BYPASS = false;

export type GmxAlloraTxExecutionMode = 'plan' | 'execute';

type OnchainActionsBaseUrlLogger = (message: string, metadata?: Record<string, unknown>) => void;

type OnchainActionsBaseUrlOptions = {
  endpoint?: string;
  logger?: OnchainActionsBaseUrlLogger;
};

export function resolveOnchainActionsApiUrl(options?: OnchainActionsBaseUrlOptions): string {
  const envUrl = process.env['ONCHAIN_ACTIONS_API_URL'];
  const rawEndpoint = options?.endpoint ?? envUrl ?? DEFAULT_ONCHAIN_ACTIONS_API_URL;

  const source = options?.endpoint
    ? 'override'
    : envUrl
      ? 'ONCHAIN_ACTIONS_API_URL'
      : 'default';

  const endpoint = rawEndpoint.replace(/\/$/u, '');
  const isOpenApi = endpoint.endsWith('/openapi.json');
  const baseUrl = isOpenApi ? endpoint.replace(/\/openapi\.json$/u, '') : endpoint;

  if (options?.logger && source !== 'default') {
    if (isOpenApi) {
      options.logger('Normalized onchain-actions endpoint from OpenAPI spec URL', {
        endpoint,
        baseUrl,
        source,
      });
    } else if (baseUrl !== DEFAULT_ONCHAIN_ACTIONS_API_URL) {
      options.logger('Using custom onchain-actions base URL', { baseUrl, source });
    }
  }

  return baseUrl;
}

export const ONCHAIN_ACTIONS_API_URL = resolveOnchainActionsApiUrl();

export function resolveAlloraApiBaseUrl(): string {
  return process.env['ALLORA_API_BASE_URL']?.replace(/\/$/u, '') ?? DEFAULT_ALLORA_API_BASE_URL;
}

export function resolveAlloraApiKey(): string | undefined {
  return process.env['ALLORA_API_KEY'];
}

export function resolveAlloraChainId(): string {
  return process.env['ALLORA_CHAIN_ID']?.trim() || DEFAULT_ALLORA_CHAIN_ID;
}

export function resolveAlloraInferenceCacheTtlMs(): number {
  const raw = process.env['ALLORA_INFERENCE_CACHE_TTL_MS'];
  if (!raw) {
    return DEFAULT_ALLORA_INFERENCE_CACHE_TTL_MS;
  }

  const parsed = Number(raw);
  // Allow disabling caching by setting <= 0 or invalid values.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.trunc(parsed);
}

export function resolveAllora8hInferenceCacheTtlMs(): number {
  const raw = process.env['ALLORA_8H_INFERENCE_CACHE_TTL_MS'];
  if (!raw) {
    return DEFAULT_ALLORA_8H_INFERENCE_CACHE_TTL_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.trunc(parsed);
}

export const ALLORA_HORIZON_HOURS = 8;
export type AlloraTopicInferenceType = 'Log-Return' | 'Price';

export type AlloraTopicWhitelistEntry = {
  topicId: number;
  pair: `${string}/USD`;
  horizonHours: 8 | 24;
  inferenceType: AlloraTopicInferenceType;
};

export const ALLORA_TOPIC_WHITELIST: readonly AlloraTopicWhitelistEntry[] = [
  { topicId: 1, pair: 'BTC/USD', horizonHours: 8, inferenceType: 'Log-Return' },
  { topicId: 3, pair: 'SOL/USD', horizonHours: 8, inferenceType: 'Log-Return' },
  { topicId: 14, pair: 'BTC/USD', horizonHours: 8, inferenceType: 'Price' },
  { topicId: 19, pair: 'NEAR/USD', horizonHours: 8, inferenceType: 'Log-Return' },
  { topicId: 2, pair: 'ETH/USD', horizonHours: 24, inferenceType: 'Log-Return' },
  { topicId: 16, pair: 'ETH/USD', horizonHours: 24, inferenceType: 'Log-Return' },
  { topicId: 2, pair: 'ETH/USD', horizonHours: 8, inferenceType: 'Log-Return' },
  { topicId: 17, pair: 'SOL/USD', horizonHours: 24, inferenceType: 'Log-Return' },
  { topicId: 10, pair: 'SOL/USD', horizonHours: 8, inferenceType: 'Price' },
] as const;

function buildTopicLabel(entry: AlloraTopicWhitelistEntry): string {
  return `${entry.pair} - ${entry.inferenceType} - ${entry.horizonHours}h`;
}

function getWhitelistedTopicOrThrow(
  topicId: number,
  horizonHours?: AlloraTopicWhitelistEntry['horizonHours'],
): AlloraTopicWhitelistEntry {
  const whitelisted = ALLORA_TOPIC_WHITELIST.find((entry) => {
    if (entry.topicId !== topicId) {
      return false;
    }
    if (horizonHours === undefined) {
      return true;
    }
    return entry.horizonHours === horizonHours;
  });
  if (!whitelisted) {
    const horizonSuffix = horizonHours ? ` (${horizonHours}h)` : '';
    throw new Error(`Allora topic ${topicId}${horizonSuffix} is not in whitelist.`);
  }
  return whitelisted;
}

export const ALLORA_TOPIC_IDS = {
  BTC: 14,
  ETH: 2,
} as const;

export const ALLORA_TOPIC_LABELS = {
  BTC: buildTopicLabel(getWhitelistedTopicOrThrow(ALLORA_TOPIC_IDS.BTC, ALLORA_HORIZON_HOURS)),
  ETH: buildTopicLabel(getWhitelistedTopicOrThrow(ALLORA_TOPIC_IDS.ETH, ALLORA_HORIZON_HOURS)),
} as const;

export function resolveDelegationsBypass(): boolean {
  const raw = process.env['DELEGATIONS_BYPASS'];
  if (!raw) {
    return DEFAULT_DELEGATIONS_BYPASS;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function normalizeHexAddress(value: string, label: string): `0x${string}` {
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value.toLowerCase() as `0x${string}`;
}

export function resolveAgentWalletAddress(): `0x${string}` {
  const explicitAddress = process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'];
  if (explicitAddress) {
    const normalized = normalizeHexAddress(explicitAddress.trim(), 'GMX_ALLORA_AGENT_WALLET_ADDRESS');

    const rawPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
    if (rawPrivateKey) {
      const privateKey = normalizeHexAddress(rawPrivateKey.trim(), 'A2A_TEST_AGENT_NODE_PRIVATE_KEY');
      const derived = privateKeyToAccount(privateKey).address.toLowerCase() as `0x${string}`;
      if (derived !== normalized) {
        throw new Error(
          `GMX_ALLORA_AGENT_WALLET_ADDRESS (${normalized}) does not match A2A_TEST_AGENT_NODE_PRIVATE_KEY address (${derived}).`,
        );
      }
    }

    return normalized;
  }

  const rawPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
  if (!rawPrivateKey) {
    throw new Error(
      'Missing agent wallet configuration. Set GMX_ALLORA_AGENT_WALLET_ADDRESS (address only) or A2A_TEST_AGENT_NODE_PRIVATE_KEY (0x + 64 hex chars).',
    );
  }
  const privateKey = normalizeHexAddress(rawPrivateKey.trim(), 'A2A_TEST_AGENT_NODE_PRIVATE_KEY');
  const account = privateKeyToAccount(privateKey);
  return account.address.toLowerCase() as `0x${string}`;
}

export function resolveGmxAlloraTxExecutionMode(): GmxAlloraTxExecutionMode {
  const raw = process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
  if (!raw) {
    return DEFAULT_GMX_ALLORA_TX_EXECUTION_MODE;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'plan') {
    return 'plan';
  }

  // Support both "submit" (documented) and "execute" (consistent with other agents).
  if (normalized === 'submit' || normalized === 'execute') {
    return 'execute';
  }

  return DEFAULT_GMX_ALLORA_TX_EXECUTION_MODE;
}

const DEFAULT_POLL_INTERVAL_MS = 1_800_000;
const DEFAULT_STREAM_LIMIT = -1;
const DEFAULT_STATE_HISTORY_LIMIT = 100;

function resolveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolvePollIntervalMs(): number {
  return resolveNumber(process.env['GMX_ALLORA_POLL_INTERVAL_MS'], DEFAULT_POLL_INTERVAL_MS);
}

export function resolveStreamLimit(): number {
  const raw = process.env['GMX_ALLORA_STREAM_LIMIT'];
  if (!raw) {
    return DEFAULT_STREAM_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_STREAM_LIMIT;
  }
  return Math.trunc(parsed);
}

export function resolveStateHistoryLimit(): number {
  return resolveNumber(process.env['GMX_ALLORA_STATE_HISTORY_LIMIT'], DEFAULT_STATE_HISTORY_LIMIT);
}
