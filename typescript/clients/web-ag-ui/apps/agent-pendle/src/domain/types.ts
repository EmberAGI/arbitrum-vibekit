import { z } from 'zod';

export const TokenSchema = z.object({
  address: z.templateLiteral(['0x', z.string()]),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  usdPrice: z.number().nonnegative().optional(),
});
export type Token = z.infer<typeof TokenSchema>;

export const PendleYieldTokenSchema = z.object({
  marketAddress: z.templateLiteral(['0x', z.string()]),
  ptAddress: z.templateLiteral(['0x', z.string()]),
  ytAddress: z.templateLiteral(['0x', z.string()]),
  ptSymbol: z.string(),
  ytSymbol: z.string(),
  underlyingSymbol: z.string(),
  apy: z.number().nonnegative(),
  impliedApyPct: z.number().nonnegative().optional(),
  underlyingApyPct: z.number().nonnegative().optional(),
  pendleApyPct: z.number().nonnegative().optional(),
  aggregatedApyPct: z.number().nonnegative().optional(),
  swapFeeApyPct: z.number().nonnegative().optional(),
  ytFloatingApyPct: z.number().nonnegative().optional(),
  maxBoostedApyPct: z.number().nonnegative().optional(),
  maturity: z.string(),
});
export type PendleYieldToken = z.infer<typeof PendleYieldTokenSchema>;

export const PendleSetupInputSchema = z.object({
  walletAddress: z.templateLiteral(['0x', z.string()]),
  baseContributionUsd: z.number().positive().optional(),
});

type PendleSetupInputBase = z.infer<typeof PendleSetupInputSchema>;
export interface PendleSetupInput extends PendleSetupInputBase {
  walletAddress: `0x${string}`;
}

export const FundingTokenInputSchema = z.object({
  fundingTokenAddress: z.templateLiteral(['0x', z.string()]),
});

type FundingTokenInputBase = z.infer<typeof FundingTokenInputSchema>;
export interface FundingTokenInput extends FundingTokenInputBase {
  fundingTokenAddress: `0x${string}`;
}

export type ResolvedPendleConfig = {
  walletAddress: `0x${string}`;
  baseContributionUsd: number;
  fundingTokenAddress: `0x${string}`;
  targetYieldToken: PendleYieldToken;
};

export type PendleActionKind =
  | 'scan-yields'
  | 'rebalance'
  | 'compound'
  | 'rollover'
  | 'hold';

export type PendleTelemetry = {
  cycle: number;
  action: PendleActionKind;
  reason: string;
  apy: number;
  ytSymbol: string;
  txHash?: string;
  timestamp: string;
  metrics?: {
    bestApy: number;
    currentApy: number;
    apyDelta: number;
    rebalanceThresholdPct: number;
  };
};
