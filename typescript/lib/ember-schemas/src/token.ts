import { z } from 'zod';

import { TokenIdentifierSchema } from './common.js';

export const TokenSchema = z.object({
  tokenUid: TokenIdentifierSchema.describe("Unique identifier for the token, if it's not a native token."),
  name: z.string().describe("Full name of the token, e.g., 'Ethereum'."),
  symbol: z.string().describe("Symbol of the token, e.g., 'ETH'."),
  isNative: z.boolean().describe("Whether this is the native token of the chain."),
  decimals: z.number().describe("Number of decimal places the token uses."),
  iconUri: z.string().optional().describe("URI for the token's icon."),
  usdPrice: z.string().optional().describe("Current USD price of the token, as a string to maintain precision."),
  isVetted: z.boolean().describe("Whether this token is considered vetted or trusted."),
});

export type Token = z.infer<typeof TokenSchema>;

// Market Data Schemas
export const GetMarketDataSchema = z.object({
  tokenUid: TokenIdentifierSchema.describe("Token identifier for which to fetch market data."),
});

export type GetMarketDataRequest = z.infer<typeof GetMarketDataSchema>;

export const GetMarketDataResponseSchema = z.object({
  price: z.number().optional().describe("Current price of the token in USD."),
  marketCap: z.number().optional().describe("Market capitalization in USD."),
  fullyDilutedValue: z.number().optional().describe("Fully diluted valuation in USD."),
  volume1m: z.number().optional().describe("Trading volume in the last 1 minute."),
  volume5m: z.number().optional().describe("Trading volume in the last 5 minutes."),
  volume30m: z.number().optional().describe("Trading volume in the last 30 minutes."),
  volume1h: z.number().optional().describe("Trading volume in the last 1 hour."),
  volume2h: z.number().optional().describe("Trading volume in the last 2 hours."),
  volume4h: z.number().optional().describe("Trading volume in the last 4 hours."),
  volume6h: z.number().optional().describe("Trading volume in the last 6 hours."),
  volume8h: z.number().optional().describe("Trading volume in the last 8 hours."),
  volume12h: z.number().optional().describe("Trading volume in the last 12 hours."),
  volume24h: z.number().optional().describe("Trading volume in the last 24 hours."),
  priceChange1m: z.number().optional().describe("Price change percentage in the last 1 minute."),
  priceChange5m: z.number().optional().describe("Price change percentage in the last 5 minutes."),
  priceChange30m: z.number().optional().describe("Price change percentage in the last 30 minutes."),
  priceChange1h: z.number().optional().describe("Price change percentage in the last 1 hour."),
  priceChange2h: z.number().optional().describe("Price change percentage in the last 2 hours."),
  priceChange4h: z.number().optional().describe("Price change percentage in the last 4 hours."),
  priceChange6h: z.number().optional().describe("Price change percentage in the last 6 hours."),
  priceChange8h: z.number().optional().describe("Price change percentage in the last 8 hours."),
  priceChange12h: z.number().optional().describe("Price change percentage in the last 12 hours."),
  priceChange24h: z.number().optional().describe("Price change percentage in the last 24 hours."),
});

export type GetMarketDataResponse = z.infer<typeof GetMarketDataResponseSchema>; 