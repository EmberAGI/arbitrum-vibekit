import { z } from 'zod';

import {
  CamelotPoolSchema,
  PoolListResponseSchema,
  WalletPositionSchema,
  WalletPositionsResponseSchema,
  type CamelotPool,
  type WalletPosition,
} from './types.js';
import { enrichCamelotPoolUsdPrices } from './usdPrices.js';

const LOG_BASE = Math.log(1.0001);

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

type EmberLiquidityPool = z.infer<typeof PoolListResponseSchema>['liquidityPools'][number];
type EmberWalletPosition = z.infer<typeof WalletPositionsResponseSchema>['positions'][number];

export class EmberCamelotClient {
  constructor(private readonly baseUrl: string) {}

  private async fetchEndpoint<T>(endpoint: string, schema: z.ZodSchema<T>, init?: RequestInit) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'No error body');
      throw new Error(`Ember API request failed (${response.status}): ${text}`);
    }

    const json = await response.json();
    return schema.parseAsync(json);
  }

  async listCamelotPools(chainId: number): Promise<CamelotPool[]> {
    const data = await this.fetchEndpoint(
      `/liquidity/pools?chainId=${chainId}`,
      PoolListResponseSchema,
    );
    const pools = data.liquidityPools
      .filter((pool) => pool.providerId.toLowerCase().includes('algebra'))
      .map((pool) => toCamelotPool(pool))
      .filter((pool): pool is CamelotPool => Boolean(pool));
    enrichCamelotPoolUsdPrices(pools);
    return pools;
  }

  async getWalletPositions(
    walletAddress: `0x${string}`,
    chainId: number,
  ): Promise<WalletPosition[]> {
    const data = await this.fetchEndpoint(
      `/liquidity/positions/${walletAddress}?chainId=${chainId}`,
      WalletPositionsResponseSchema,
    );
    if (data.positions.length === 0) {
      return [];
    }

    const pools = await this.listCamelotPools(chainId);
    const poolMap = new Map(pools.map((pool) => [pool.address.toLowerCase(), pool]));

    return data.positions
      .map((position) => toWalletPosition(position, poolMap))
      .filter((position): position is WalletPosition => Boolean(position));
  }

  async requestRebalance(payload: ClmmRebalanceRequest): Promise<ClmmRebalanceResponse> {
    const body = await this.fetchEndpoint(
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
    const body = await this.fetchEndpoint(
      `/liquidity/withdraw`,
      ClmmRebalanceResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify(ClmmWithdrawRequestSchema.parse(payload)),
      },
    );

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

function toCamelotPool(pool: EmberLiquidityPool): CamelotPool | undefined {
  if (pool.tokens.length < 2) {
    return undefined;
  }

  const [token0Raw, token1Raw] = pool.tokens;
  const tick = priceToTick(Number(pool.price), token0Raw.decimals - token1Raw.decimals);

  return CamelotPoolSchema.parse({
    address: normalizeAddress(pool.identifier.address),
    token0: {
      address: normalizeAddress(token0Raw.tokenUid.address),
      symbol: token0Raw.symbol,
      decimals: token0Raw.decimals,
    },
    token1: {
      address: normalizeAddress(token1Raw.tokenUid.address),
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
    const lower = Number(position.positionRange.fromPrice ?? position.positionRange.toPrice ?? 0);
    const upper = Number(position.positionRange.toPrice ?? position.positionRange.fromPrice ?? 0);
    if (Number.isFinite(lower) && Number.isFinite(upper)) {
      tickLower = priceToTick(Math.min(lower, upper), decimalsDiff);
      tickUpper = priceToTick(Math.max(lower, upper), decimalsDiff);
    }
  }

  return WalletPositionSchema.parse({
    poolAddress,
    operator: position.operator,
    tickLower,
    tickUpper,
  });
}
