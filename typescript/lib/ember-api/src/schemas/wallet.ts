import { z } from 'zod';
import { BalanceSchema, TokenSchema } from './core.js';
import { LendingPositionSchema } from './lending.js';

export const GetWalletLendingPositionsRequestSchema = z.object({
  walletAddress: z.string(),
});
export type GetWalletLendingPositionsRequest = z.infer<
  typeof GetWalletLendingPositionsRequestSchema
>;

export const GetWalletLendingPositionsResponseSchema = z.object({
  positions: z.array(LendingPositionSchema),
});

export type GetWalletLendingPositionsResponse = z.infer<
  typeof GetWalletLendingPositionsResponseSchema
>;

export const GetWalletBalancesRequestSchema = z.object({
  walletAddress: z.string(),
});
export type GetWalletBalancesRequest = z.infer<typeof GetWalletBalancesRequestSchema>;

export const GetWalletBalancesResponseSchema = z.object({
  balances: z.array(BalanceSchema),
});
export type GetWalletBalancesResponse = z.infer<typeof GetWalletBalancesResponseSchema>;

export const YieldMarketPoolDailyRewardEstimationSchema = z.object({
  asset: TokenSchema,
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
  name: z.string(),
  address: z.string(),
  expiry: z.string(),
  pt: TokenSchema,
  yt: TokenSchema,
  sy: z.string(),
  underlyingAsset: TokenSchema,
  chainId: z.string(),
  volatileData: YieldMarketVolatileDataSchema.optional(),
});
export type YieldMarket = z.infer<typeof YieldMarketSchema>;

export const GetYieldMarketsRequestSchema = z.object({
  chainIds: z.array(z.string()),
});
export type GetYieldMarketsRequest = z.infer<typeof GetYieldMarketsRequestSchema>;

export const GetYieldMarketsResponseSchema = z.object({
  markets: z.array(YieldMarketSchema),
});
export type GetYieldMarketsResponse = z.infer<typeof GetYieldMarketsResponseSchema>;

export const GetMarketDataRequestSchema = z.object({
  tokenUid: z.object({
    chainId: z.string(),
    address: z.string(),
  }),
});
export type GetMarketDataRequest = z.infer<typeof GetMarketDataRequestSchema>;

export const GetMarketDataResponseSchema = z.object({
  price: z.number(),
  marketCap: z.number().optional(),
  fullyDilutedValue: z.number().optional(),
  volume1m: z.number().optional(),
  volume5m: z.number().optional(),
  volume30m: z.number().optional(),
  volume1h: z.number().optional(),
  volume2h: z.number().optional(),
  volume4h: z.number().optional(),
  volume6h: z.number().optional(),
  volume8h: z.number().optional(),
  volume12h: z.number().optional(),
  volume24h: z.number().optional(),
  priceChange1m: z.number().optional(),
  priceChange5m: z.number().optional(),
  priceChange30m: z.number().optional(),
  priceChange1h: z.number().optional(),
  priceChange2h: z.number().optional(),
  priceChange4h: z.number().optional(),
  priceChange6h: z.number().optional(),
  priceChange8h: z.number().optional(),
  priceChange12h: z.number().optional(),
  priceChange24h: z.number().optional(),
});
export type GetMarketDataResponse = z.infer<typeof GetMarketDataResponseSchema>;
