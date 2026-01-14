import { z } from 'zod';

export const PoolTokenSchema = z.object({
  address: z.templateLiteral(['0x', z.string()]),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  usdPrice: z.number().nonnegative().optional(),
});
export type PoolToken = z.infer<typeof PoolTokenSchema>;

export const CamelotPoolSchema = z.object({
  address: z.templateLiteral(['0x', z.string()]),
  token0: PoolTokenSchema,
  token1: PoolTokenSchema,
  tickSpacing: z.number().int().positive().default(10),
  tick: z.coerce.number(),
  sqrtPriceX96: z.string().optional(),
  liquidity: z.string(),
  activeTvlUSD: z.number().nonnegative().optional(),
  volume24hUSD: z.number().nonnegative().optional(),
  feeTierBps: z.number().int().nonnegative().optional(),
});
export type CamelotPool = z.infer<typeof CamelotPoolSchema>;

const ChainIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.string(),
});

const WalletPositionTokenSchema = z.object({
  tokenAddress: z.templateLiteral(['0x', z.string()]),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  amount: z.string().optional(),
  usdPrice: z.number().nonnegative().optional(),
  valueUsd: z.number().nonnegative().optional(),
});
export type WalletPositionToken = z.infer<typeof WalletPositionTokenSchema>;

export const WalletPositionSchema = z.object({
  poolAddress: z.templateLiteral(['0x', z.string()]),
  operator: z.string(),
  positionId: z.string().optional(),
  liquidity: z.string().optional(),
  tickLower: z.number().int(),
  tickUpper: z.number().int(),
  tokensOwed0: z.string().optional(),
  tokensOwed1: z.string().optional(),
  suppliedTokens: z.array(WalletPositionTokenSchema).optional(),
  feesOwedTokens: z.array(WalletPositionTokenSchema).optional(),
  rewardsOwedTokens: z.array(WalletPositionTokenSchema).optional(),
});
export type WalletPosition = z.infer<typeof WalletPositionSchema>;

const EmberPoolTokenSchema = z.object({
  tokenUid: ChainIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  isNative: z.boolean().optional(),
  iconUri: z.string().optional(),
  isVetted: z.boolean().optional(),
});

export const PoolListResponseSchema = z.object({
  liquidityPools: z.array(
    z.object({
      identifier: ChainIdentifierSchema,
      tokens: z.array(EmberPoolTokenSchema).min(2),
      currentPrice: z.string(),
      tickSpacing: z.number().int().positive().optional(),
      providerId: z.string(),
      poolName: z.string(),
    }),
  ),
  cursor: z.string().nullable().optional(),
  currentPage: z.number().int().nullable().optional(),
  totalPages: z.number().int().nullable().optional(),
  totalItems: z.number().int().nullable().optional(),
});
export type PoolListResponse = z.infer<typeof PoolListResponseSchema>;

const EmberPositionRangeSchema = z
  .object({
    fromPrice: z.string(),
    toPrice: z.string(),
  })
  .partial()
  .optional();

const EmberNumberishSchema = z.union([z.string(), z.number()]);

const EmberWalletTokenSchema = EmberPoolTokenSchema.extend({
  amount: z.string().optional(),
  suppliedAmount: z.string().optional(),
  owedTokens: z.string().optional(),
  usdPrice: EmberNumberishSchema.optional(),
  valueUsd: EmberNumberishSchema.optional(),
});

export const WalletPositionsResponseSchema = z.object({
  positions: z.array(
    z.object({
      poolIdentifier: ChainIdentifierSchema,
      operator: z.string(),
      positionId: z.string().optional(),
      price: z.string().optional(),
      providerId: z.string(),
      poolName: z.string().optional(),
      currentPrice: z.string().optional(),
      currentTick: z.number().int().optional(),
      tickLower: z.number().int().optional(),
      tickUpper: z.number().int().optional(),
      inRange: z.boolean().optional(),
      feesValueUsd: EmberNumberishSchema.optional(),
      rewardsValueUsd: EmberNumberishSchema.optional(),
      positionValueUsd: EmberNumberishSchema.optional(),
      positionRange: EmberPositionRangeSchema,
      suppliedTokens: z.array(EmberWalletTokenSchema).optional(),
      pooledTokens: z.array(EmberWalletTokenSchema).optional(),
      feesOwedTokens: z.array(EmberWalletTokenSchema).optional(),
      rewardsOwedTokens: z.array(EmberWalletTokenSchema).optional(),
    }),
  ),
  cursor: z.string().nullable().optional(),
  currentPage: z.number().int().nullable().optional(),
  totalPages: z.number().int().nullable().optional(),
  totalItems: z.number().int().nullable().optional(),
});
export type WalletPositionsResponse = z.infer<typeof WalletPositionsResponseSchema>;

export const OperatorConfigInputSchema = z.object({
  poolAddress: z.templateLiteral(['0x', z.string()]),
  walletAddress: z.templateLiteral(['0x', z.string()]),
  baseContributionUsd: z.number().positive().optional(),
});
type OperatorConfigInputBase = z.infer<typeof OperatorConfigInputSchema>;
export interface OperatorConfigInput extends OperatorConfigInputBase {
  poolAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}

export const FundingTokenInputSchema = z.object({
  fundingTokenAddress: z.templateLiteral(['0x', z.string()]),
});
type FundingTokenInputBase = z.infer<typeof FundingTokenInputSchema>;
export interface FundingTokenInput extends FundingTokenInputBase {
  fundingTokenAddress: `0x${string}`;
}

export type ResolvedOperatorConfig = {
  walletAddress: `0x${string}`;
  baseContributionUsd: number;
  autoCompoundFees: boolean;
  manualBandwidthBps: number;
};

export type PriceRange = {
  lowerTick: number;
  upperTick: number;
  lowerPrice: number;
  upperPrice: number;
  bandwidthBps: number;
};

export type PositionSnapshot = {
  poolAddress: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  liquidity?: bigint;
  tokensOwed0?: bigint;
  tokensOwed1?: bigint;
};

export interface DecisionContext {
  pool: CamelotPool;
  position?: PositionSnapshot;
  midPrice: number;
  volatilityPct: number;
  cyclesSinceRebalance: number;
  tickBandwidthBps: number;
  rebalanceThresholdPct: number;
  autoCompoundFees: boolean;
  estimatedFeeValueUsd?: number;
  maxGasSpendUsd: number;
  gasSpentUsd?: number;
  gasSpentWei?: string;
}

export type ClmmAction =
  | {
      kind: 'enter-range';
      reason: string;
      targetRange: PriceRange;
    }
  | {
      kind: 'adjust-range';
      reason: string;
      targetRange: PriceRange;
    }
  | {
      kind: 'exit-range';
      reason: string;
    }
  | {
      kind: 'compound-fees';
      reason: string;
    }
  | {
      kind: 'hold';
      reason: string;
    };

export type RebalanceTelemetry = {
  cycle: number;
  poolAddress: `0x${string}`;
  midPrice: number;
  action: ClmmAction['kind'];
  reason: string;
  tickLower?: number;
  tickUpper?: number;
  txHash?: string;
  timestamp: string;
  metrics?: {
    tick: number;
    tickSpacing: number;
    midPrice: number;
    volatilityPct: number;
    tvlUsd?: number;
    rebalanceThresholdPct: number;
    cyclesSinceRebalance: number;
    bandwidthBps: number;
    inRange?: boolean;
    inInnerBand?: boolean;
    positionRange?: {
      lowerTick: number;
      upperTick: number;
      lowerPrice: number;
      upperPrice: number;
      widthTicks: number;
    };
    targetRange: {
      lowerTick: number;
      upperTick: number;
      lowerPrice: number;
      upperPrice: number;
      widthTicks: number;
      bandwidthBps: number;
    };
    distanceToEdges?: {
      ticksFromLower: number;
      ticksToUpper: number;
      pctFromLower?: number;
      pctToUpper?: number;
      innerBand?: {
        lowerTick: number;
        upperTick: number;
        ticksFromInnerLower: number;
        ticksToInnerUpper: number;
      };
    };
    estimatedFeeValueUsd?: number;
    maxGasSpendUsd: number;
    gasSpentUsd?: number;
    gasSpentWei?: string;
  };
};
