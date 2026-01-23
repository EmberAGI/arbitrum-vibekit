import { enrichCamelotPoolUsdPrices } from '../core/usdPrices.js';
import type { CamelotPool, WalletPosition, WalletPositionToken } from '../domain/types.js';

import { fetchCoinGeckoTokenPrices, toCaip19TokenId } from './coinGecko.js';
import type { TokenDescriptor, TokenPriceQuote } from './types.js';

function normalizeAddress(address: `0x${string}`): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

export type TokenPriceMap = Map<string, TokenPriceQuote>;

function deriveTokenPricesFromPositionTokens(params: {
  chainId: number;
  tokens: WalletPositionToken[];
}): TokenPriceMap {
  const tokenPriceMap: TokenPriceMap = new Map();

  for (const token of params.tokens) {
    const usdPrice = token.usdPrice;
    if (usdPrice === undefined || !Number.isFinite(usdPrice) || usdPrice <= 0) {
      continue;
    }
    const tokenAddress = normalizeAddress(token.tokenAddress);
    tokenPriceMap.set(toCaip19TokenId({ chainId: params.chainId, address: tokenAddress }), {
      tokenAddress,
      usdPrice,
      source: 'ember',
    });
  }

  return tokenPriceMap;
}

export function deriveTokenPricesFromPositions(params: {
  chainId: number;
  positions: WalletPosition[];
}): TokenPriceMap {
  const prices: TokenPriceMap = new Map();

  const mergePrices = (tokenPrices: TokenPriceMap) => {
    for (const [key, quote] of tokenPrices.entries()) {
      if (!prices.has(key)) {
        prices.set(key, quote);
      }
    }
  };

  for (const position of params.positions) {
    if (position.suppliedTokens && position.suppliedTokens.length > 0) {
      mergePrices(
        deriveTokenPricesFromPositionTokens({
          chainId: params.chainId,
          tokens: position.suppliedTokens,
        }),
      );
    }
    if (position.feesOwedTokens && position.feesOwedTokens.length > 0) {
      mergePrices(
        deriveTokenPricesFromPositionTokens({
          chainId: params.chainId,
          tokens: position.feesOwedTokens,
        }),
      );
    }
    if (position.rewardsOwedTokens && position.rewardsOwedTokens.length > 0) {
      mergePrices(
        deriveTokenPricesFromPositionTokens({
          chainId: params.chainId,
          tokens: position.rewardsOwedTokens,
        }),
      );
    }
  }

  return prices;
}

export function deriveTokenPricesFromPools(pools: CamelotPool[], chainId: number): TokenPriceMap {
  const prices = enrichCamelotPoolUsdPrices(pools);
  const tokenPriceMap: TokenPriceMap = new Map();

  for (const pool of pools) {
    const token0Price = pool.token0.usdPrice;
    if (token0Price !== undefined && Number.isFinite(token0Price) && token0Price > 0) {
      const tokenAddress = normalizeAddress(pool.token0.address);
      tokenPriceMap.set(toCaip19TokenId({ chainId, address: tokenAddress }), {
        tokenAddress,
        usdPrice: token0Price,
        source: 'ember',
      });
    }
    const token1Price = pool.token1.usdPrice;
    if (token1Price !== undefined && Number.isFinite(token1Price) && token1Price > 0) {
      const tokenAddress = normalizeAddress(pool.token1.address);
      tokenPriceMap.set(toCaip19TokenId({ chainId, address: tokenAddress }), {
        tokenAddress,
        usdPrice: token1Price,
        source: 'ember',
      });
    }
  }

  if (prices.size > tokenPriceMap.size) {
    for (const [address, price] of prices.entries()) {
      if (!Number.isFinite(price) || price <= 0) {
        continue;
      }
      const tokenAddress = normalizeAddress(address as `0x${string}`);
      const key = toCaip19TokenId({ chainId, address: tokenAddress });
      if (!tokenPriceMap.has(key)) {
        tokenPriceMap.set(key, {
          tokenAddress,
          usdPrice: price,
          source: 'ember',
        });
      }
    }
  }

  return tokenPriceMap;
}

export async function resolveTokenPriceMap(params: {
  chainId: number;
  pools: CamelotPool[];
  tokens: TokenDescriptor[];
  positions?: WalletPosition[];
}): Promise<TokenPriceMap> {
  const positionPrices = params.positions
    ? deriveTokenPricesFromPositions({ chainId: params.chainId, positions: params.positions })
    : new Map<string, TokenPriceQuote>();
  const poolPrices = deriveTokenPricesFromPools(params.pools, params.chainId);
  const emberPrices: TokenPriceMap = new Map(positionPrices);
  for (const [key, quote] of poolPrices.entries()) {
    if (!emberPrices.has(key)) {
      emberPrices.set(key, quote);
    }
  }
  const missingTokens = params.tokens.filter((token) => {
    const key = toCaip19TokenId({ chainId: params.chainId, address: token.address });
    return !emberPrices.has(key);
  });

  if (missingTokens.length === 0) {
    return emberPrices;
  }

  const coinGeckoPrices = await fetchCoinGeckoTokenPrices({
    chainId: params.chainId,
    tokens: missingTokens,
  });

  for (const [key, quote] of coinGeckoPrices.entries()) {
    if (!emberPrices.has(key)) {
      emberPrices.set(key, quote);
    }
  }

  return emberPrices;
}
