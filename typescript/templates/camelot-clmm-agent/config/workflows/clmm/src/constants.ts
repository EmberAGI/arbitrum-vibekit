export const ARBITRUM_CHAIN_ID = 42161;
export const CAMELOT_FACTORY_ADDRESS = '0x1a3c9b1d2f0529d97f2afc5136cc23e58f1fd35b';
export const CAMELOT_POSITION_MANAGER_ADDRESS = '0x00c7f3082833e796a5b3e4bd59f6642ff44dcd15';

export const DEFAULT_MIN_TVL_USD = 500_000;
export const DEFAULT_TICK_BANDWIDTH_BPS = 75;
export const VOLATILE_TICK_BANDWIDTH_BPS = 125;
export const DEFAULT_REBALANCE_THRESHOLD_PCT = 0.6;
export const SAFETY_NET_MAX_IDLE_CYCLES = 10;
export const DATA_STALE_CYCLE_LIMIT = 2;

export const MAX_GAS_SPEND_ETH = 0.0015;
export const MAX_SLIPPAGE_BPS = 35;
export const AUTO_COMPOUND_COST_RATIO = 0.01;

export const DEFAULT_DEBUG_ALLOWED_TOKENS = new Set([
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
  '0x912ce59144191c1204e64559fe8253a0e49e6548', // ARB
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', // WBTC
]);

export const EMBER_API_BASE_URL =
  process.env['EMBER_API_BASE_URL']?.replace(/\/$/, '') ?? 'https://api.emberai.xyz';

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_STREAM_LIMIT = -1;

export function resolvePollIntervalMs(): number {
  const raw = process.env['CLMM_POLL_INTERVAL_MS'];
  if (!raw) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POLL_INTERVAL_MS;
}

export function resolveStreamLimit(): number {
  const raw = process.env['CLMM_STREAM_LIMIT'];
  if (!raw) {
    return DEFAULT_STREAM_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_STREAM_LIMIT;
  }
  return Math.trunc(parsed);
}

export function resolveEthUsdPrice(): number {
  const raw = process.env['CLMM_ETH_PRICE_USD'];
  if (!raw) {
    return 3500;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3500;
}
