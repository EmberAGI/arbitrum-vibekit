export const ARBITRUM_CHAIN_ID = 42161;

const DEFAULT_STABLECOIN_WHITELIST = [
  'USDai',
  'reUSD',
  'NUSD',
  'rUSD',
  'yzUSD',
  'ysUSDC',
  'upUSDC',
  'USD3',
  'jrUSDe',
  'iUSD',
  'syrupUSDC',
  'syrupUSDT',
  'USDe',
];

const DEFAULT_CHAIN_IDS = [ARBITRUM_CHAIN_ID.toString()];
const DEFAULT_REBALANCE_THRESHOLD_PCT = 0.5;
const DEFAULT_DELEGATIONS_BYPASS = false;
const DEFAULT_SMOKE_MODE = false;
const DEFAULT_TX_EXECUTION_MODE: PendleTxExecutionMode = 'execute';

export type PendleTxExecutionMode = 'execute' | 'plan';

export const ONCHAIN_ACTIONS_API_URL =
  process.env['ONCHAIN_ACTIONS_API_URL']?.replace(/\/$/, '') ?? 'https://api.emberai.xyz';

const DEFAULT_POLL_INTERVAL_MS = 3_600_000;
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
  return resolveNumber(process.env['PENDLE_POLL_INTERVAL_MS'], DEFAULT_POLL_INTERVAL_MS);
}

export function resolveRebalanceThresholdPct(): number {
  const raw = process.env['PENDLE_REBALANCE_THRESHOLD_PCT'];
  if (!raw) {
    return DEFAULT_REBALANCE_THRESHOLD_PCT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REBALANCE_THRESHOLD_PCT;
  }
  return parsed;
}

export function resolvePendleChainIds(): string[] {
  const raw = process.env['PENDLE_CHAIN_IDS'];
  if (!raw) {
    return DEFAULT_CHAIN_IDS;
  }
  const parsed = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? parsed : DEFAULT_CHAIN_IDS;
}

export function resolveStablecoinWhitelist(): string[] {
  const raw = process.env['PENDLE_STABLECOIN_WHITELIST'];
  if (!raw) {
    return [...DEFAULT_STABLECOIN_WHITELIST];
  }
  const parsed = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_STABLECOIN_WHITELIST];
}

export function resolveDelegationsBypass(): boolean {
  const raw = process.env['DELEGATIONS_BYPASS'];
  if (!raw) {
    return DEFAULT_DELEGATIONS_BYPASS;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function resolvePendleSmokeMode(): boolean {
  const raw = process.env['PENDLE_SMOKE_MODE'];
  if (!raw) {
    return DEFAULT_SMOKE_MODE;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function resolvePendleTxExecutionMode(): PendleTxExecutionMode {
  const raw = process.env['PENDLE_TX_EXECUTION_MODE'];
  if (!raw) {
    // In delegation bypass mode we typically do not have a signing key available locally,
    // but we still want to exercise tx building for smoke testing.
    return resolveDelegationsBypass() ? 'plan' : DEFAULT_TX_EXECUTION_MODE;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'plan' ? 'plan' : DEFAULT_TX_EXECUTION_MODE;
}

export function resolveStreamLimit(): number {
  const raw = process.env['PENDLE_STREAM_LIMIT'];
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
  return resolveNumber(process.env['PENDLE_STATE_HISTORY_LIMIT'], DEFAULT_STATE_HISTORY_LIMIT);
}
