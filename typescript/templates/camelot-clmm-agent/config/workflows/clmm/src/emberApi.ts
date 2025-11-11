import { z } from 'zod';

import {
  CamelotPoolSchema,
  PoolListResponseSchema,
  WalletPositionsResponseSchema,
  type CamelotPool,
  type WalletPosition,
} from './types.js';

const TransactionInformationSchema = z.object({
  type: z.enum(['EVM_TX']),
  to: z.templateLiteral(['0x', z.string()]),
  data: z.templateLiteral(['0x', z.string()]),
  value: z.string(),
  chainId: z.string(),
});
export type TransactionInformation = z.infer<typeof TransactionInformationSchema>;

const ClmmRebalanceRequestSchema = z.object({
  walletAddress: z.templateLiteral(['0x', z.string()]),
  poolAddress: z.templateLiteral(['0x', z.string()]),
  chainId: z.string(),
  action: z.enum(['enter', 'adjust', 'exit', 'compound']),
  range: z
    .object({
      minPrice: z.string(),
      maxPrice: z.string(),
    })
    .optional(),
  maxSlippageBps: z.number().int().nonnegative(),
  maxGasEth: z.number().positive(),
  autoCompound: z.boolean().optional(),
  baseContributionUsd: z.number().positive().optional(),
});
export type ClmmRebalanceRequest = z.infer<typeof ClmmRebalanceRequestSchema>;

const ClmmRebalanceResponseSchema = z.object({
  transactions: z.array(TransactionInformationSchema),
  requestId: z.string().optional(),
});
export type ClmmRebalanceResponse = z.infer<typeof ClmmRebalanceResponseSchema>;

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
      `/liquidity/camelot/pools?chainId=${chainId}`,
      PoolListResponseSchema,
    );
    return data.pools;
  }

  async getWalletPositions(
    walletAddress: `0x${string}`,
    chainId: number,
  ): Promise<WalletPosition[]> {
    const data = await this.fetchEndpoint(
      `/liquidity/camelot/positions?walletAddress=${walletAddress}&chainId=${chainId}`,
      WalletPositionsResponseSchema,
    );
    return data.positions;
  }

  async requestRebalance(payload: ClmmRebalanceRequest): Promise<ClmmRebalanceResponse> {
    const body = await this.fetchEndpoint(
      `/liquidity/camelot/rebalance`,
      ClmmRebalanceResponseSchema,
      {
        method: 'POST',
        body: JSON.stringify(payload),
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
