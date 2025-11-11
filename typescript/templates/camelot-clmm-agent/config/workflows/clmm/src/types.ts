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

export const WalletPositionSchema = z.object({
  poolAddress: z.templateLiteral(['0x', z.string()]),
  operator: z.string(),
  liquidity: z.string(),
  tickLower: z.number().int(),
  tickUpper: z.number().int(),
  tokensOwed0: z.string().default('0'),
  tokensOwed1: z.string().default('0'),
});
export type WalletPosition = z.infer<typeof WalletPositionSchema>;

export const PoolListResponseSchema = z.object({
  pools: z.array(CamelotPoolSchema),
  asOf: z.string().datetime().optional(),
});
export type PoolListResponse = z.infer<typeof PoolListResponseSchema>;

export const WalletPositionsResponseSchema = z.object({
  positions: z.array(WalletPositionSchema),
});
export type WalletPositionsResponse = z.infer<typeof WalletPositionsResponseSchema>;

export const ClmmWorkflowParametersSchema = z.object({
  poolAddress: z.string().optional(),
  mode: z.enum(['debug', 'production']).optional(),
  tickBandwidthBps: z.number().int().positive().optional(),
  rebalanceThresholdPct: z.number().positive().optional(),
  maxIdleCycles: z.number().int().positive().optional(),
  targetNotionalUsd: z.number().positive().optional(),
});
export type ClmmWorkflowParameters = z.infer<typeof ClmmWorkflowParametersSchema>;

export const PoolSelectionInputSchema = z.object({
  poolAddress: z.templateLiteral(['0x', z.string()]),
});
export type PoolSelectionInput = z.infer<typeof PoolSelectionInputSchema>;

export const OperatorConfigInputSchema = z.object({
  walletAddress: z.templateLiteral(['0x', z.string()]),
  baseContributionUsd: z.number().positive(),
  autoCompoundFees: z.boolean().default(true),
  maxIdleCycles: z.number().int().min(1).max(60).default(10),
  manualBandwidthBps: z.number().int().min(25).max(250).optional(),
});
export type OperatorConfigInput = z.infer<typeof OperatorConfigInputSchema>;

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
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
};

export interface DecisionContext {
  pool: CamelotPool;
  position?: PositionSnapshot;
  midPrice: number;
  volatilityPct: number;
  cyclesSinceRebalance: number;
  tickBandwidthBps: number;
  rebalanceThresholdPct: number;
  maxIdleCycles: number;
  autoCompoundFees: boolean;
  estimatedFeeValueUsd?: number;
  estimatedGasCostUsd: number;
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
};
