import type { GMXMarket, GMXToken } from '../domain/types.ts';

/* =========================
   Network / Core Addresses
   ========================= */

export const ARBITRUM_CHAIN_ID = 42161;

// GMX v2 core contracts (Arbitrum)
export const GMX_MARKET_FACTORY = '0xf5F30B10141E1F63FC11eD772931A8294a591996';
export const GMX_EXCHANGE_ROUTER = '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41';
export const GMX_ORDER_VAULT = '0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5';
export const GMX_READER_ADDRESS = '0x470fbC46bcC0f16532691Df360A07d8Bf5ee0789';
export const GMX_DATA_STORE = '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8';
export const GM_ETH_USDC_MARKET = `0x70d95587d40A2caf56bd97485aB3Eec10Bee6336`;
export const GM_TOKEN_SWAP_ONLY_USDC_DAI = `0x850de3cdEaADF65ED342c52Be7E46Bb251A87e26`; // TODO: Add USDC-DAI swap-only market address
export const GM_TOKEN_SWAP_ONLY_USDC_USDT = 0xb686bcb112660343e6d15bdb65297e110c8311c4;

// Tokens (Arbitrum)
export const ARBITRUM_DAI_ADDRESS = `0xebB0c6991690e0C7c0cFAD3F3Ab69763fD5321DE`; // TODO: Add DAI address
export const ARBITRUM_WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
export const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
/* =========================
   Trading Defaults
   ========================= */

export const DEFAULT_MARKET_PAIR = {
  longToken: ARBITRUM_WETH_ADDRESS,
  shortToken: ARBITRUM_USDC_ADDRESS,
};

export const DEFAULT_POSITION_SIZE_USD = 10; // $10 per trade
export const MAX_POSITION_SIZE_USD = 100;
export const MAX_LEVERAGE = 2; // 2x
export const MIN_CONFIDENCE_THRESHOLD = 0.8; // Allora signal confidence

export const MAX_GAS_SPEND_ETH = 0.002;
export const MAX_SLIPPAGE_BPS = 50; // 0.5%

export const POSITION_CHECK_INTERVAL_MS = 30_000;
export const PNL_POLL_INTERVAL_MS = 15_000;

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_STREAM_LIMIT = -1;

/*
=========================
    Processing with Allora
=========================
*/

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

export function resolvePollIntervalMs(): number {
  const raw = process.env['GMX_POLL_INTERVAL_MS'];
  if (!raw) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POLL_INTERVAL_MS;
}

export function resolveStreamLimit(): number {
  const raw = process.env['GMX_STREAM_LIMIT'];
  if (!raw) {
    return DEFAULT_STREAM_LIMIT;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_STREAM_LIMIT;
  }
  return Math.trunc(parsed);
}
