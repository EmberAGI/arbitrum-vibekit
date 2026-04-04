/**
 * Price feed tools for fetching OHLCV data from Arbitrum DEXes.
 * Uses on-chain data via viem + public APIs for candle data.
 */

import { createPublicClient, http, formatUnits } from "viem";
import { arbitrum } from "viem/chains";
import type { TradingPair } from "../context/types.js";

const POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const client = createPublicClient({
  chain: arbitrum,
  transport: http(process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc"),
});

export async function getPrice(pair: TradingPair): Promise<number> {
  // Use CoinGecko free API for price data (no key needed for /simple/price)
  const ids: Record<string, string> = {
    WETH: "ethereum",
    ARB: "arbitrum",
    GMX: "gmx",
    PENDLE: "pendle",
    LINK: "chainlink",
    UNI: "uniswap",
  };

  const coinId = ids[pair.base];
  if (!coinId) throw new Error(`Unknown token: ${pair.base}`);

  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
  );
  const data = await res.json();
  return data[coinId]?.usd ?? 0;
}

export async function getOHLCV(
  pair: TradingPair,
  interval: string = "1h",
  limit: number = 100
): Promise<number[][]> {
  const ids: Record<string, string> = {
    WETH: "ethereum",
    ARB: "arbitrum",
    GMX: "gmx",
    PENDLE: "pendle",
    LINK: "chainlink",
    UNI: "uniswap",
  };

  const coinId = ids[pair.base];
  if (!coinId) throw new Error(`Unknown token: ${pair.base}`);

  // CoinGecko market_chart for candle data (free, no key)
  const days = interval === "1h" ? 4 : interval === "4h" ? 14 : 30;
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
  );
  const data = await res.json();

  // Convert to OHLCV format (CoinGecko gives price points, we approximate)
  const prices: [number, number][] = data.prices || [];
  return prices.slice(-limit).map(([ts, price]) => [ts, price, price, price, price, 0]);
}

export async function getCloses(pair: TradingPair, limit: number = 100): Promise<number[]> {
  const ohlcv = await getOHLCV(pair, "1h", limit);
  return ohlcv.map((c) => c[4]);
}

export async function getBlockNumber(): Promise<bigint> {
  return client.getBlockNumber();
}
