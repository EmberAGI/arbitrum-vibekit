export const ARBITRUM_CHAIN_ID = 42161;

const DEFAULT_ONCHAIN_ACTIONS_API_URL = 'https://api.emberai.xyz';
const DEFAULT_ALLORA_API_BASE_URL = 'https://api.allora.network';
const DEFAULT_ALLORA_CHAIN_ID = 'allora-mainnet-1';
const DEFAULT_ALLORA_INFERENCE_CACHE_TTL_MS = 30_000;
const DEFAULT_ALLORA_8H_INFERENCE_CACHE_TTL_MS = 30_000;
const DEFAULT_GMX_ALLORA_TX_EXECUTION_MODE: GmxAlloraTxExecutionMode = 'plan';

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
export const ALLORA_TOPIC_IDS = {
  BTC: 14,
  ETH: 2,
} as const;

export const ALLORA_TOPIC_LABELS = {
  BTC: 'BTC/USD - Price Prediction - 8h',
  ETH: 'ETH/USD - Price Prediction - 8h',
} as const;

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

const DEFAULT_POLL_INTERVAL_MS = 10_000;
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
