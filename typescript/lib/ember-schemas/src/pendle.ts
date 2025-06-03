import { z } from 'zod';

import { TokenIdentifierSchema } from './common.js';
import { TokenSchema } from './token.js';

export const SwapTokensParamsSchema = z.object({
  fromTokenAddress: z.string().describe('The contract address of the token to swap from.'),
  fromTokenChainId: z.string().describe('The chain ID where the fromToken contract resides.'),
  toTokenAddress: z.string().describe('The contract address of the token to swap to.'),
  toTokenChainId: z.string().describe('The chain ID where the toToken contract resides.'),
  amount: z
    .string()
    .describe('The amount of the fromToken to swap (atomic, non-human readable format).'),
  userAddress: z.string().describe('The wallet address initiating the swap.'),
});
export type SwapTokensParams = z.infer<typeof SwapTokensParamsSchema>;

export const PendleSwapPreviewSchema = z.object({
  fromTokenName: z.string(),
  toTokenName: z.string(),
  humanReadableAmount: z.string(),
  chainName: z.string(),
  parsedChainId: z.string(),
});
export type PendleSwapPreview = z.infer<typeof PendleSwapPreviewSchema>;

export const PendleAgentTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema.describe('For native tokens, this may be empty.').optional(),
  name: z.string().describe('The human-readable name of the token.'),
  symbol: z.string().describe('The ticker symbol of the token.'),
  isNative: z.boolean().describe('Whether this token is native to its chain.'),
  decimals: z.number().int().describe('The number of decimal places the token uses.'),
  iconUri: z.string().optional().describe('Optional URI for the token icon.'),
  usdPrice: z
    .string()
    .optional()
    .describe(
      'Optional USD price as a string to avoid floating-point precision issues, e.g., "123.456789".'
    ),
  isVetted: z.boolean().describe('Whether the token has been vetted.'),
});
export type PendleAgentToken = z.infer<typeof PendleAgentTokenSchema>;

// Schema for getTokens tool response
export const GetTokensResponseSchema = z.object({
  tokens: z.array(
    z.object({
      symbol: z.string().optional(),
      tokenUid: z
        .object({
          chainId: z.string(),
          address: z.string(),
        })
        .optional(),
      name: z.string().optional(),
      decimals: z.number().optional(),
      isNative: z.boolean().optional(),
      iconUri: z.string().optional(),
      usdPrice: z.string().optional(),
      isVetted: z.boolean().optional(),
    })
  ),
});
export type GetTokensResponse = z.infer<typeof GetTokensResponseSchema>;

export const YieldMarketPoolDailyRewardEstimationSchema = z.object({
  asset: TokenSchema.optional(),
  amount: z.string(),
});
export type YieldMarketPoolDailyRewardEstimation = z.infer<
  typeof YieldMarketPoolDailyRewardEstimationSchema
>;

export const YieldMarketVolatileDataSchema = z.object({
  timestamp: z.string(),
  marketLiquidityUsd: z.string(),
  tradingVolumeUsd: z.string(),
  underlyingInterestApy: z.string(),
  underlyingRewardApy: z.string(),
  underlyingApy: z.string(),
  impliedApy: z.string(),
  ytFloatingApy: z.string(),
  swapFeeApy: z.string(),
  voterApy: z.string(),
  ptDiscount: z.string(),
  pendleApy: z.string(),
  arbApy: z.string(),
  lpRewardApy: z.string(),
  aggregatedApy: z.string(),
  maxBoostedApy: z.string(),
  estimatedDailyPoolRewards: z.array(YieldMarketPoolDailyRewardEstimationSchema),
  totalPt: z.string(),
  totalSy: z.string(),
  totalLp: z.string(),
  totalActiveSupply: z.string(),
  assetPriceUsd: z.string(),
});
export type YieldMarketVolatileData = z.infer<typeof YieldMarketVolatileDataSchema>;


export const YieldMarketSchema = z.object({
  name: z.string().describe('The name of the yield market.'),
  address: z.string().describe('The address of the yield market.'),
  expiry: z.string().describe('The expiry timestamp of the yield market.'),
  pt: z.string().describe('The address of the PT (principal token).'),
  yt: z.string().describe('The address of the YT (yield token).'),
  sy: z.string().describe('The address of the SY (standardized yield token).'),
  underlyingAsset: TokenSchema.describe('The underlying asset of the Pendle market.'),
  chainId: z.string().describe('The chain ID on which this yield market exists.'),
  volatileData: YieldMarketVolatileDataSchema.optional(),
});
export type YieldMarket = z.infer<typeof YieldMarketSchema>;
export const GetYieldMarketsResponseSchema = z.object({
  markets: z
    .array(YieldMarketSchema)
    .describe('List of yield markets matching the request criteria.'),
});
export type GetYieldMarketsResponse = z.infer<typeof GetYieldMarketsResponseSchema>; 


export const GetPendleMarketsRequestSchema = z.object({});
export type GetPendleMarketsRequestArgs = z.infer<typeof GetPendleMarketsRequestSchema>;