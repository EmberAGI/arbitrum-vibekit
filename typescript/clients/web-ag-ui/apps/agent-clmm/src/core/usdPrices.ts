import { deriveMidPrice } from './decision-engine.js';
import type { CamelotPool } from '../domain/types.js';

const LOGICAL_ONE = 1;

const USD_STABLE_TOKENS: ReadonlyArray<{ address: `0x${string}`; price: number }> = [
  { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', price: LOGICAL_ONE }, // USDC
  { address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', price: LOGICAL_ONE }, // USDC.e
  { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', price: LOGICAL_ONE }, // USDT
  { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', price: LOGICAL_ONE }, // DAI
];

const STABLE_TOKEN_MAP = new Map(
  USD_STABLE_TOKENS.map(({ address, price }) => [address.toLowerCase(), price]),
);

function isPositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalize(address: string): string {
  return address.toLowerCase();
}

function seedKnownPrices(pools: CamelotPool[]) {
  const knownPrices = new Map(STABLE_TOKEN_MAP);
  for (const pool of pools) {
    const token0Price = pool.token0.usdPrice;
    if (isPositive(token0Price)) {
      knownPrices.set(normalize(pool.token0.address), token0Price);
    }
    const token1Price = pool.token1.usdPrice;
    if (isPositive(token1Price)) {
      knownPrices.set(normalize(pool.token1.address), token1Price);
    }
  }
  return knownPrices;
}

function updateTokenPrice(
  pool: CamelotPool,
  prices: Map<string, number>,
  midPrice: number,
): boolean {
  const token0Key = normalize(pool.token0.address);
  const token1Key = normalize(pool.token1.address);
  const token0Known = prices.get(token0Key);
  const token1Known = prices.get(token1Key);
  let updated = false;

  if (!isPositive(token0Known) && isPositive(token1Known)) {
    const derived = midPrice * token1Known;
    if (isPositive(derived)) {
      prices.set(token0Key, derived);
      updated = true;
    }
  }

  if (!isPositive(token1Known) && isPositive(token0Known)) {
    const derived = token0Known / midPrice;
    if (isPositive(derived)) {
      prices.set(token1Key, derived);
      updated = true;
    }
  }

  return updated;
}

/**
 * Mutates the provided pool list by filling missing token USD prices using Camelot
 * pool ratios against known USD stablecoins. Returns the consolidated price map.
 */
export function enrichCamelotPoolUsdPrices(pools: CamelotPool[]): Map<string, number> {
  const prices = seedKnownPrices(pools);
  let progress = true;

  while (progress) {
    progress = false;
    for (const pool of pools) {
      const midPrice = deriveMidPrice(pool);
      if (!Number.isFinite(midPrice) || midPrice <= 0) {
        continue;
      }
      if (updateTokenPrice(pool, prices, midPrice)) {
        progress = true;
      }
    }
  }

  for (const pool of pools) {
    const token0Price = prices.get(normalize(pool.token0.address));
    if (isPositive(token0Price)) {
      pool.token0.usdPrice = token0Price;
    }
    const token1Price = prices.get(normalize(pool.token1.address));
    if (isPositive(token1Price)) {
      pool.token1.usdPrice = token1Price;
    }
  }

  return prices;
}

export function isUsdStableToken(address: string): boolean {
  return STABLE_TOKEN_MAP.has(normalize(address));
}
