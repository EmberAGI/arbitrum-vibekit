import type { CamelotPool, WalletPosition } from '../domain/types.js';

import { toCaip19TokenId } from './coinGecko.js';
import type { TokenPriceMap } from './pricing.js';
import type { PositionValue, TokenAmountBreakdown } from './types.js';

export const CAMELOT_PROTOCOL_ID = 'camelot-clmm';

function normalizeAddress(address: `0x${string}`): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function parseBaseUnitsAmount(amount: string | undefined, decimals: number): number | undefined {
  if (!amount) {
    return undefined;
  }
  if (amount.includes('.')) {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (!/^\d+$/.test(amount)) {
    return undefined;
  }

  const padded = amount.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals) || '0';
  const fraction = padded.slice(-decimals);
  const value = Number(`${whole}.${fraction}`);
  return Number.isFinite(value) ? value : undefined;
}

function buildTokenBreakdown(params: {
  tokenAddress: `0x${string}`;
  symbol: string;
  decimals: number;
  amountBaseUnits?: string;
  priceMap: TokenPriceMap;
  chainId: number;
  category: TokenAmountBreakdown['category'];
}): TokenAmountBreakdown {
  const normalizedAddress = normalizeAddress(params.tokenAddress);
  const amount = parseBaseUnitsAmount(params.amountBaseUnits, params.decimals);
  const priceKey = toCaip19TokenId({ chainId: params.chainId, address: normalizedAddress });
  const priceQuote = params.priceMap.get(priceKey);
  const usdPrice = priceQuote?.usdPrice;
  const valueUsd =
    amount !== undefined && usdPrice !== undefined
      ? Number((amount * usdPrice).toFixed(6))
      : undefined;

  return {
    tokenAddress: normalizedAddress,
    symbol: params.symbol,
    decimals: params.decimals,
    amountBaseUnits: params.amountBaseUnits,
    amount,
    usdPrice,
    valueUsd,
    source: priceQuote?.source,
    category: params.category,
  };
}

function sumTokenValues(tokens: TokenAmountBreakdown[]): number {
  return tokens.reduce((sum, token) => sum + (token.valueUsd ?? 0), 0);
}

export function computeCamelotPositionValues(params: {
  chainId: number;
  positions: WalletPosition[];
  poolsByAddress: Map<string, CamelotPool>;
  priceMap: TokenPriceMap;
}): PositionValue[] {
  const sortedPositions = [...params.positions].sort((left, right) =>
    left.poolAddress.localeCompare(right.poolAddress),
  );

  return sortedPositions.map((position, index) => {
    const tokens: TokenAmountBreakdown[] = [];
    const suppliedTokens = position.suppliedTokens ?? [];
    for (const token of suppliedTokens) {
      tokens.push(
        buildTokenBreakdown({
          tokenAddress: token.tokenAddress,
          symbol: token.symbol,
          decimals: token.decimals,
          amountBaseUnits: token.amount,
          priceMap: params.priceMap,
          chainId: params.chainId,
          category: 'supplied',
        }),
      );
    }

    let feesUsd: number | undefined;
    const pool = params.poolsByAddress.get(position.poolAddress.toLowerCase());
    if (pool) {
      const feeTokens: TokenAmountBreakdown[] = [];
      if (position.tokensOwed0) {
        feeTokens.push(
          buildTokenBreakdown({
            tokenAddress: pool.token0.address,
            symbol: pool.token0.symbol,
            decimals: pool.token0.decimals,
            amountBaseUnits: position.tokensOwed0,
            priceMap: params.priceMap,
            chainId: params.chainId,
            category: 'fees',
          }),
        );
      }
      if (position.tokensOwed1) {
        feeTokens.push(
          buildTokenBreakdown({
            tokenAddress: pool.token1.address,
            symbol: pool.token1.symbol,
            decimals: pool.token1.decimals,
            amountBaseUnits: position.tokensOwed1,
            priceMap: params.priceMap,
            chainId: params.chainId,
            category: 'fees',
          }),
        );
      }
      if (feeTokens.length > 0) {
        tokens.push(...feeTokens);
        feesUsd = sumTokenValues(feeTokens);
      }
    }

    const positionValueUsd = Number(sumTokenValues(tokens).toFixed(6));

    return {
      positionId: `camelot-${position.poolAddress}-${index}`,
      poolAddress: position.poolAddress,
      protocolId: CAMELOT_PROTOCOL_ID,
      tokens,
      positionValueUsd,
      feesUsd,
    };
  });
}
