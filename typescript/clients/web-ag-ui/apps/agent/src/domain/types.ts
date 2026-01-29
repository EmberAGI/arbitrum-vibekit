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
  liquidity: z.string(),
  activeTvlUSD: z.number().nonnegative().optional(),
  feeTierBps: z.number().int().nonnegative().optional(),
});
export type CamelotPool = z.infer<typeof CamelotPoolSchema>;

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

export type ClmmActionKind =
  | 'enter-range'
  | 'adjust-range'
  | 'exit-range'
  | 'compound-fees'
  | 'hold';

export type RebalanceTelemetry = {
  cycle: number;
  poolAddress: `0x${string}`;
  midPrice: number;
  action: ClmmActionKind;
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
