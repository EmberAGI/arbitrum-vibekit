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
  tickSpacing: z.number().int().positive().default(60),
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
});
export type WalletPositionToken = z.infer<typeof WalletPositionTokenSchema>;

export const WalletPositionSchema = z.object({
  poolAddress: z.templateLiteral(['0x', z.string()]),
  operator: z.string(),
  liquidity: z.string().optional(),
  tickLower: z.number().int(),
  tickUpper: z.number().int(),
  tokensOwed0: z.string().optional(),
  tokensOwed1: z.string().optional(),
  suppliedTokens: z.array(WalletPositionTokenSchema).optional(),
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
      price: z.string(),
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

const EmberWalletTokenSchema = EmberPoolTokenSchema.extend({
  amount: z.string().optional(),
});

export const WalletPositionsResponseSchema = z.object({
  positions: z.array(
    z.object({
      poolIdentifier: ChainIdentifierSchema,
      operator: z.string(),
      price: z.string().optional(),
      providerId: z.string(),
      positionRange: EmberPositionRangeSchema,
      suppliedTokens: z.array(EmberWalletTokenSchema),
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
