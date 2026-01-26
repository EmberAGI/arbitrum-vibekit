import { z } from 'zod';

import type { TokenDescriptor, TokenPriceQuote } from './types.js';

const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';
const HTTP_TIMEOUT_MS = 20_000;
const MAX_ADDRESSES_PER_REQUEST = 50;

const CoinGeckoTokenPriceSchema = z.record(
  z.string(),
  z.object({
    usd: z.number().nonnegative(),
  }),
);

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

function normalizeAddress(address: `0x${string}`): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

export function toCaip19TokenId(params: { chainId: number; address: `0x${string}` }): string {
  return `eip155:${params.chainId}/erc20:${normalizeAddress(params.address)}`;
}

export function resolveCoinGeckoPlatformId(chainId: number): string | null {
  if (chainId === 42161) {
    return 'arbitrum-one';
  }
  return null;
}

async function fetchTokenPriceBatch(params: {
  platformId: string;
  addresses: `0x${string}`[];
}): Promise<Map<string, number>> {
  if (params.addresses.length === 0) {
    return new Map();
  }

  const query = new URLSearchParams();
  query.set('contract_addresses', params.addresses.map((address) => normalizeAddress(address)).join(','));
  query.set('vs_currencies', 'usd');

  const response = await fetch(`${COINGECKO_API_BASE}/simple/token_price/${params.platformId}?${query.toString()}`,
    {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`CoinGecko API request failed (${response.status})`);
  }

  const json: unknown = await response.json();
  const parsed: Record<string, { usd: number }> = CoinGeckoTokenPriceSchema.parse(json);
  const prices = new Map<string, number>();
  const entries = Object.entries(parsed) as Array<[string, { usd: number }]>;
  for (const [address, entry] of entries) {
    prices.set(address.toLowerCase(), entry.usd);
  }
  return prices;
}

export async function fetchCoinGeckoTokenPrices(params: {
  chainId: number;
  tokens: TokenDescriptor[];
}): Promise<Map<string, TokenPriceQuote>> {
  const platformId = resolveCoinGeckoPlatformId(params.chainId);
  if (!platformId || params.tokens.length === 0) {
    return new Map();
  }

  const uniqueAddresses = Array.from(
    new Set(params.tokens.map((token) => normalizeAddress(token.address))),
  );
  const chunks = chunk(uniqueAddresses, MAX_ADDRESSES_PER_REQUEST);
  const priceMap = new Map<string, TokenPriceQuote>();

  for (const addresses of chunks) {
    const batchPrices = await fetchTokenPriceBatch({ platformId, addresses });
    for (const token of params.tokens) {
      const normalized = normalizeAddress(token.address);
      const price = batchPrices.get(normalized);
      if (price === undefined) {
        continue;
      }
      const caip19 = toCaip19TokenId({ chainId: params.chainId, address: normalized });
      if (!priceMap.has(caip19)) {
        priceMap.set(caip19, {
          tokenAddress: normalized,
          usdPrice: price,
          source: 'coingecko',
        });
      }
    }
  }

  return priceMap;
}
