import { z } from 'zod';

export const TokenSchema = z.object({
  address: z.templateLiteral(['0x', z.string()]),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  usdPrice: z.number().nonnegative().optional(),
});
export type Token = z.infer<typeof TokenSchema>;

export const GmxMarketSchema = z.object({
  address: z.templateLiteral(['0x', z.string()]),
  baseSymbol: z.string(),
  quoteSymbol: z.string(),
  token0: z.object({ symbol: z.string() }),
  token1: z.object({ symbol: z.string() }),
  maxLeverage: z.number().positive(),
});
export type GmxMarket = z.infer<typeof GmxMarketSchema>;

export const AlloraPredictionSchema = z.object({
  topic: z.string(),
  horizonHours: z.number().positive(),
  confidence: z.number().min(0).max(1),
  direction: z.enum(['up', 'down']),
  predictedPrice: z.number().positive(),
  timestamp: z.string(),
});
export type AlloraPrediction = z.infer<typeof AlloraPredictionSchema>;

export const GmxSetupInputSchema = z.object({
  walletAddress: z.templateLiteral(['0x', z.string()]),
  usdcAllocation: z.number().positive(),
  targetMarket: z.enum(['BTC', 'ETH']),
});

type GmxSetupInputBase = z.infer<typeof GmxSetupInputSchema>;
export interface GmxSetupInput extends GmxSetupInputBase {
  walletAddress: `0x${string}`;
  targetMarket: 'BTC' | 'ETH';
}

export const FundingTokenInputSchema = z.object({
  fundingTokenAddress: z.templateLiteral(['0x', z.string()]),
});

type FundingTokenInputBase = z.infer<typeof FundingTokenInputSchema>;
export interface FundingTokenInput extends FundingTokenInputBase {
  fundingTokenAddress: `0x${string}`;
}

export type ResolvedGmxConfig = {
  walletAddress: `0x${string}`;
  baseContributionUsd: number;
  fundingTokenAddress: `0x${string}`;
  targetMarket: GmxMarket;
  maxLeverage: number;
};

export type GmxAlloraActionKind =
  | 'signal'
  | 'open'
  | 'reduce'
  | 'close'
  | 'hold'
  | 'cooldown';

export type GmxAlloraTelemetry = {
  cycle: number;
  action: GmxAlloraActionKind;
  reason: string;
  marketSymbol: string;
  side?: 'long' | 'short';
  leverage?: number;
  sizeUsd?: number;
  prediction?: AlloraPrediction;
  txHash?: string;
  timestamp: string;
  metrics?: {
    confidence: number;
    decisionThreshold: number;
    cooldownRemaining: number;
  };
};
