import { z } from 'zod';

import { enrichCamelotPoolUsdPrices, isUsdStableToken } from '../core/usdPrices.js';
import {
  CamelotPoolSchema,
  PoolListResponseSchema,
  WalletPositionSchema,
  WalletPositionsResponseSchema,
  type CamelotPool,
  type WalletPosition,
} from '../domain/types.js';

const LOG_BASE = Math.log(1.0001);
const HTTP_TIMEOUT_MS = 60_000;
const CAMELOT_ALGEBRA_PROVIDER_ID_ARBITRUM =
  'Algebra_0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B_42161';

const TransactionInformationSchema = z.object({
  type: z.enum(['EVM_TX']),
  to: z.templateLiteral(['0x', z.string()]),
  data: z.templateLiteral(['0x', z.string()]),
  value: z.string(),
  chainId: z.string(),
});
export type TransactionInformation = z.infer<typeof TransactionInformationSchema>;

const PayableTokenSchema = z.object({
  tokenUid: z.object({
    chainId: z.string(),
    address: z.templateLiteral(['0x', z.string()]),
  }),
  amount: z.string(),
});

const PoolIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.templateLiteral(['0x', z.string()]),
});

const ClmmRangeSchema = z.union([
  z.object({
    type: z.literal('full'),
  }),
  z.object({
    type: z.literal('limited'),
    minPrice: z.string(),
    maxPrice: z.string(),
  }),
]);

const ClmmRebalanceRequestSchema = z.object({
  walletAddress: z.templateLiteral(['0x', z.string()]),
  supplyChain: z.string(),
  poolIdentifier: PoolIdentifierSchema,
  range: ClmmRangeSchema,
  payableTokens: z.array(PayableTokenSchema).min(1),
});
export type ClmmRebalanceRequest = z.infer<typeof ClmmRebalanceRequestSchema>;

const ClmmRebalanceResponseSchema = z.object({
  poolIdentifier: PoolIdentifierSchema.optional(),
  transactions: z.array(TransactionInformationSchema),
  requestId: z.string().optional(),
});
export type ClmmRebalanceResponse = z.infer<typeof ClmmRebalanceResponseSchema>;

const ClmmWithdrawRequestSchema = z.object({
  walletAddress: z.templateLiteral(['0x', z.string()]),
  poolTokenUid: PoolIdentifierSchema,
});
export type ClmmWithdrawRequest = z.infer<typeof ClmmWithdrawRequestSchema>;

const SwapTokenIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.templateLiteral(['0x', z.string()]),
});

const ClmmSwapRequestSchema = z.object({
  walletAddress: z.templateLiteral(['0x', z.string()]),
  amount: z.string(),
  amountType: z.enum(['exactIn', 'exactOut']),
  fromTokenUid: SwapTokenIdentifierSchema,
  toTokenUid: SwapTokenIdentifierSchema,
});
export type ClmmSwapRequest = z.infer<typeof ClmmSwapRequestSchema>;

type PoolListResponse = z.infer<typeof PoolListResponseSchema>;
type WalletPositionsResponse = z.infer<typeof WalletPositionsResponseSchema>;
type EmberLiquidityPool = PoolListResponse['liquidityPools'][number];
type EmberWalletPosition = WalletPositionsResponse['positions'][number];

export class EmberCamelotClient {
  constructor(private readonly baseUrl: string) {}

  private async fetchEndpoint<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(HTTP_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'No error body');
      throw new Error(`Ember API request failed (${response.status}): ${text}`);
    }

    const json: unknown = await response.json();
    return schema.parseAsync(json);
  }

  async listCamelotPools(chainId: number): Promise<CamelotPool[]> {
    const query = new URLSearchParams();
    // Ember's swagger docs omit chainId, but the endpoint supports it (required for CLMM usage).
    query.set('chainId', String(chainId));
    query.append('providerIds', CAMELOT_ALGEBRA_PROVIDER_ID_ARBITRUM);
    const data = await this.fetchEndpoint<PoolListResponse>(
      `/liquidity/pools?${query.toString()}`,
      PoolListResponseSchema,
    );
    const pools = data.liquidityPools
      .filter(
        (pool) =>
          pool.providerId.toLowerCase() === CAMELOT_ALGEBRA_PROVIDER_ID_ARBITRUM.toLowerCase(),
      )
      .map((pool) => toCamelotPool(pool))
      .filter((pool): pool is CamelotPool => Boolean(pool));
    enrichCamelotPoolUsdPrices(pools);
    return pools;
  }

  async getWalletPositions(
    walletAddress: `0x${string}`,
    chainId: number,
  ): Promise<WalletPosition[]> {
    const query = new URLSearchParams();
    query.set('chainId', String(chainId));
    query.append('providerIds', CAMELOT_ALGEBRA_PROVIDER_ID_ARBITRUM);
    const data = await this.fetchEndpoint<WalletPositionsResponse>(
      `/liquidity/positions/${walletAddress}?${query.toString()}`,
      WalletPositionsResponseSchema,
    );
    if (data.positions.length === 0) {
      return [];
    }

    const pools = await this.listCamelotPools(chainId);
    const poolMap = new Map(pools.map((pool) => [pool.address.toLowerCase(), pool]));

    return data.positions
      .filter(
        (position) =>
          position.providerId.toLowerCase() === CAMELOT_ALGEBRA_PROVIDER_ID_ARBITRUM.toLowerCase(),
      )
      .map((position) => toWalletPosition(position, poolMap))
      .filter((position): position is WalletPosition => Boolean(position));
  }

  async requestRebalance(payload: ClmmRebalanceRequest): Promise<ClmmRebalanceResponse> {
    const body = await this.fetchEndpoint<ClmmRebalanceResponse>(
      `/liquidity/supply`,
      ClmmRebalanceResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify(ClmmRebalanceRequestSchema.parse(payload)),
      },
    );

    return body;
  }

  async requestWithdrawal(payload: ClmmWithdrawRequest): Promise<ClmmRebalanceResponse> {
    const body = await this.fetchEndpoint<ClmmRebalanceResponse>(
      `/liquidity/withdraw`,
      ClmmRebalanceResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify(ClmmWithdrawRequestSchema.parse(payload)),
      },
    );

    return body;
  }

  async requestSwap(payload: ClmmSwapRequest): Promise<ClmmRebalanceResponse> {
    const body = await this.fetchEndpoint<ClmmRebalanceResponse>(`/swap`, ClmmRebalanceResponseSchema, {
      method: 'POST',
      body: JSON.stringify(ClmmSwapRequestSchema.parse(payload)),
    });

    return body;
  }
}

export async function fetchPoolSnapshot(
  client: EmberCamelotClient,
  poolAddress: `0x${string}`,
  chainId: number,
) {
  const pools = await client.listCamelotPools(chainId);
  const normalizedAddress = poolAddress.toLowerCase();
  return pools.find((pool) => pool.address.toLowerCase() === normalizedAddress);
}

export function normalizePool(pool: CamelotPool) {
  const tickSpacing = pool.tickSpacing ?? 60;
  const tick = pool.tick;
  const liquidity = BigInt(pool.liquidity);
  const token0Usd = pool.token0.usdPrice ?? 0;
  const token1Usd = pool.token1.usdPrice ?? 0;

  return {
    ...pool,
    tickSpacing,
    tick,
    liquidity,
    token0Usd,
    token1Usd,
  };
}

function normalizeAddress(address: string): `0x${string}` {
  const normalized = address.startsWith('0x') ? address : `0x${address}`;
  return normalized.toLowerCase() as `0x${string}`;
}

function priceToTick(price: number, decimalsDiff: number): number {
  if (!Number.isFinite(price) || price <= 0) {
    return 0;
  }
  const adjustedPrice = price / Math.pow(10, decimalsDiff);
  return Math.round(Math.log(adjustedPrice) / LOG_BASE);
}

function normalizePositionRangePrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0) {
    return 0;
  }
  return price;
}

function toCamelotPool(pool: EmberLiquidityPool): CamelotPool | undefined {
  if (pool.tokens.length < 2) {
    return undefined;
  }

  const [first, second] = pool.tokens;
  if (!first || !second) {
    return undefined;
  }

  const firstAddress = normalizeAddress(first.tokenUid.address);
  const secondAddress = normalizeAddress(second.tokenUid.address);

  // Token ordering is significant for CLMM math (token0/token1).
  // Ember does not guarantee array order matches Algebra token0/token1.
  const [token0Raw, token1Raw] =
    firstAddress.toLowerCase() <= secondAddress.toLowerCase() ? [first, second] : [second, first];

  const token0Address = normalizeAddress(token0Raw.tokenUid.address);
  const token1Address = normalizeAddress(token1Raw.tokenUid.address);

  // `priceToTick` expects token1/token0 (amount1 per amount0), adjusted for decimals.
  // Ember's `price` has been observed to come back as either token0/token1 or token1/token0,
  // so normalize it using a stable-coin heuristic when possible.
  const rawPrice = Number(pool.price);
  const token0Stable = isUsdStableToken(token0Address);
  const token1Stable = isUsdStableToken(token1Address);

  let token1PerToken0 = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0;
  if (token0Stable !== token1Stable && token1PerToken0 > 0) {
    // If token1 is USD-stable, token1/token0 should typically be > 1 (e.g. USDC per WETH).
    // If token0 is USD-stable, token1/token0 should typically be < 1 (e.g. WETH per USDC).
    const expectGreaterThanOne = token1Stable;
    const looksInverted = expectGreaterThanOne ? token1PerToken0 < 1 : token1PerToken0 > 1;
    if (looksInverted) {
      token1PerToken0 = 1 / token1PerToken0;
    }
  }

  const tick = priceToTick(token1PerToken0, token0Raw.decimals - token1Raw.decimals);

  return CamelotPoolSchema.parse({
    address: normalizeAddress(pool.identifier.address),
    token0: {
      address: token0Address,
      symbol: token0Raw.symbol,
      decimals: token0Raw.decimals,
    },
    token1: {
      address: token1Address,
      symbol: token1Raw.symbol,
      decimals: token1Raw.decimals,
    },
    tickSpacing: 60,
    tick,
    liquidity: '0',
  });
}

function toWalletPosition(
  position: EmberWalletPosition,
  poolMap: Map<string, CamelotPool>,
): WalletPosition | undefined {
  const poolAddress = normalizeAddress(position.poolIdentifier.address);
  const pool = poolMap.get(poolAddress.toLowerCase());
  let tickLower = 0;
  let tickUpper = 0;

  if (pool && position.positionRange) {
    const decimalsDiff = pool.token0.decimals - pool.token1.decimals;
    const lowerRaw = Number(position.positionRange.fromPrice ?? position.positionRange.toPrice ?? 0);
    const upperRaw = Number(position.positionRange.toPrice ?? position.positionRange.fromPrice ?? 0);
    const lower = normalizePositionRangePrice(lowerRaw);
    const upper = normalizePositionRangePrice(upperRaw);
    if (lower > 0 && upper > 0) {
      tickLower = priceToTick(Math.min(lower, upper), decimalsDiff);
      tickUpper = priceToTick(Math.max(lower, upper), decimalsDiff);
    }
  }

  const suppliedTokens =
    position.suppliedTokens?.map((token) => ({
      tokenAddress: normalizeAddress(token.tokenUid.address),
      symbol: token.symbol,
      decimals: token.decimals,
      amount: token.amount,
    })) ?? [];

  return WalletPositionSchema.parse({
    poolAddress,
    operator: position.operator,
    tickLower,
    tickUpper,
    suppliedTokens,
  });
}
