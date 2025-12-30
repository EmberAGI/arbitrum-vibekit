import type { GMXMarket, GMXToken } from '../domain/types.js';

/* =========================
   Network / Core Addresses
   ========================= */

export const ARBITRUM_CHAIN_ID = 42161;

// GMX v2 core contracts (Arbitrum)
export const GMX_EXCHANGE_ROUTER = '0x7C2E3e43b3E6B08e7b2D4c4C0d42eD1C3C8eC9d8'; // example – replace with actual
export const GMX_READER_ADDRESS = '0xA9A8b5F0f9B79c2A57dDf54e07E1f4B07f51E6B5'; // example – replace with actual
export const GMX_DATA_STORE = '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8'; // example – replace with actual

// Tokens (Arbitrum)
export const ARBITRUM_WETH_ADDRESS = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
export const ARBITRUM_USDC_ADDRESS = '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8';

/* =========================
   Trading Defaults
   ========================= */

export const DEFAULT_MARKET_PAIR = {
  longToken: ARBITRUM_WETH_ADDRESS,
  shortToken: ARBITRUM_USDC_ADDRESS,
};

export const DEFAULT_POSITION_SIZE_USD = 200; // $200 per trade
export const MAX_POSITION_SIZE_USD = 2000;
export const MAX_LEVERAGE = 5; // 5x
export const MIN_CONFIDENCE_THRESHOLD = 0.6; // Allora signal confidence

export const MAX_GAS_SPEND_ETH = 0.002;
export const MAX_SLIPPAGE_BPS = 50; // 0.5%

export const POSITION_CHECK_INTERVAL_MS = 30_000;
export const PNL_POLL_INTERVAL_MS = 15_000;

/* =========================
   Allora / Agent Config
   ========================= */

export const ALLORA_API_BASE_URL =
  process.env['ALLORA_API_BASE_URL']?.replace(/\/$/, '') ?? 'https://api.allora.network';

export const ALLORA_MODEL_ID = process.env['ALLORA_MODEL_ID'] ?? 'eth_perp_direction_v1';

/* =========================
   Helpers
   ========================= */

export function resolvePositionSizeUsd(): number {
  const raw = process.env['GMX_DEFAULT_POSITION_SIZE_USD'];
  if (!raw) return DEFAULT_POSITION_SIZE_USD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POSITION_SIZE_USD;
}

export function resolveMaxLeverage(): number {
  const raw = process.env['GMX_MAX_LEVERAGE'];
  if (!raw) return MAX_LEVERAGE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MAX_LEVERAGE;
}

/* =========================
   Market helpers
   ========================= */

export function isWeth(token: GMXToken) {
  return token.address.toLowerCase() === ARBITRUM_WETH_ADDRESS;
}

export function isUsdc(token: GMXToken) {
  return token.address.toLowerCase() === ARBITRUM_USDC_ADDRESS;
}

export function resolveEthUsdPrice(market: GMXMarket): number | undefined {
  const tokens = [market.longToken, market.shortToken];
  for (const token of tokens) {
    if (
      isWeth(token) &&
      typeof token.usdPrice === 'number' &&
      Number.isFinite(token.usdPrice) &&
      token.usdPrice > 0
    ) {
      return token.usdPrice;
    }
  }
  return undefined;
}
