import { z } from 'zod';

import { TokenIdentifierSchema, TokenSchema, TransactionPlanSchema } from './core.js';

export const MintPtAndYtRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  slippage: z
    .string()
    .describe('Maximum acceptable slippage percentage as a decimal string')
    .default('0.01'),
  inputToken: TokenSchema.describe('Token to be used for minting PT and YT'),
  amount: z.bigint().describe('Amount of input token to be used for minting'),
  marketAddress: z.string().describe('Address of the yield market'),
});
export type MintPtAndYtRequest = z.infer<typeof MintPtAndYtRequestSchema>;

export const MintPtAndYtResponseSchema = z.object({
  exactPtAmount: z.string().describe('Amount of Principal Tokens (PT) minted'),
  displayPtAmount: z.string().describe('Display amount of Principal Tokens (PT) minted'),
  ptTokenIdentifier: TokenIdentifierSchema.describe('Details of the minted Principal Token (PT)'),
  exactYtAmount: z.string().describe('Amount of Yield Tokens (YT) minted'),
  displayYtAmount: z.string().describe('Display amount of Yield Tokens (YT) minted'),
  ytTokenIdentifier: TokenIdentifierSchema.describe('Details of the minted Yield Token (YT)'),
  transactions: z
    .array(TransactionPlanSchema)
    .describe('Array of transaction plans required to complete the minting process'),
});
export type MintPtAndYtResponse = z.infer<typeof MintPtAndYtResponseSchema>;

export const BuyPtRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  slippage: z
    .string()
    .describe('Maximum acceptable slippage percentage as a decimal string')
    .default('0.01'),
  inputToken: TokenSchema.describe('Token to be used for minting PT and YT'),
  amount: z.bigint().describe('Amount of input token to be used for minting'),
  marketAddress: z.string().describe('Address of the yield market'),
});
export type BuyPtRequest = z.infer<typeof BuyPtRequestSchema>;

export const BuyPtResponseSchema = z.object({
  exactPtAmount: z.string().describe('Amount of Principal Tokens (PT) minted'),
  displayPtAmount: z.string().describe('Display amount of Principal Tokens (PT) minted'),
  ptTokenIdentifier: TokenIdentifierSchema.describe('Details of the minted Principal Token (PT)'),
  transactions: z
    .array(TransactionPlanSchema)
    .describe('Array of transaction plans required to complete the minting process'),
});
export type BuyPtResponse = z.infer<typeof BuyPtResponseSchema>;

export const BuyYtRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  slippage: z
    .string()
    .describe('Maximum acceptable slippage percentage as a decimal string')
    .default('0.01'),
  inputToken: TokenSchema.describe('Token to be used for minting PT and YT'),
  amount: z.bigint().describe('Amount of input token to be used for minting'),
  marketAddress: z.string().describe('Address of the yield market'),
});
export type BuyYtRequest = z.infer<typeof BuyYtRequestSchema>;

export const BuyYtResponseSchema = z.object({
  exactYtAmount: z.string().describe('Amount of Yield Tokens (YT) minted'),
  displayYtAmount: z.string().describe('Display amount of Yield Tokens (YT) minted'),
  ytTokenIdentifier: TokenIdentifierSchema.describe('Details of the minted Yield Token (YT)'),
  transactions: z
    .array(TransactionPlanSchema)
    .describe('Array of transaction plans required to complete the minting process'),
});
export type BuyYtResponse = z.infer<typeof BuyYtResponseSchema>;

export const SellPtRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  slippage: z
    .string()
    .describe('Maximum acceptable slippage percentage as a decimal string')
    .default('0.01'),
  ptToken: TokenSchema.describe('Principal Token (PT) to be sold'),
  amount: z.bigint().describe('Amount of Principal Token (PT) to be sold'),
});
export type SellPtRequest = z.infer<typeof SellPtRequestSchema>;

export const SellPtResponseSchema = z.object({
  tokenOut: TokenSchema.describe('Details of the token received from selling PT'),
  exactAmountOut: z.string().describe('Exact amount of token received from selling PT'),
  displayAmountOut: z.string().describe('Display amount of token received from selling PT'),
  transactions: z
    .array(TransactionPlanSchema)
    .describe('Array of transaction plans required to complete the selling process'),
});
export type SellPtResponse = z.infer<typeof SellPtResponseSchema>;

export const SellYtRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  slippage: z
    .string()
    .describe('Maximum acceptable slippage percentage as a decimal string')
    .default('0.01'),
  ytToken: TokenSchema.describe('Yield Token (YT) to be sold'),
  amount: z.bigint().describe('Amount of Yield Token (YT) to be sold'),
});
export type SellYtRequest = z.infer<typeof SellYtRequestSchema>;

export const SellYtResponseSchema = z.object({
  tokenOut: TokenSchema.describe('Details of the token received from selling YT'),
  exactAmountOut: z.string().describe('Exact amount of token received from selling YT'),
  displayAmountOut: z.string().describe('Display amount of token received from selling YT'),
  transactions: z
    .array(TransactionPlanSchema)
    .describe('Array of transaction plans required to complete the selling process'),
});
export type SellYtResponse = z.infer<typeof SellYtResponseSchema>;

export const RedeemPtRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  ptToken: TokenSchema.describe('Principal Token (PT) to be redeemed'),
  amount: z.bigint().describe('Amount of Principal Token (PT) to be redeemed'),
});
export type RedeemPtRequest = z.infer<typeof RedeemPtRequestSchema>;

export const RedeemPtResponseSchema = z.object({
  underlyingTokenIdentifier: TokenIdentifierSchema.describe(
    'Details of the underlying token received upon redemption',
  ),
  exactUnderlyingAmount: z.string().describe('Exact amount of underlying token received'),
  displayUnderlyingAmount: z.string().describe('Display amount of underlying token received'),
  transactions: z
    .array(TransactionPlanSchema)
    .describe('Array of transaction plans required to complete the redemption process'),
});
export type RedeemPtResponse = z.infer<typeof RedeemPtResponseSchema>;

export const ClaimRewardsRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  ytToken: TokenSchema.describe('Yield Token (YT) for which to claim rewards'),
});
export type ClaimRewardsRequest = z.infer<typeof ClaimRewardsRequestSchema>;

export const ClaimRewardsResponseSchema = z.object({
  transactions: z
    .array(TransactionPlanSchema)
    .describe('Array of transaction plans required to complete the reward claiming process'),
});
export type ClaimRewardsResponse = z.infer<typeof ClaimRewardsResponseSchema>;

export const TokenizedYieldMarketSchema = z.object({
  marketIdentifier: TokenIdentifierSchema.describe('Unique identifier for the yield market'),
  ptToken: TokenSchema.describe('Details of the Principal Token (PT)'),
  ytToken: TokenSchema.describe('Details of the Yield Token (YT)'),
  underlyingToken: TokenSchema.describe('Details of the underlying asset token'),
  expiry: z.string().describe('Expiry date of the yield market in ISO 8601 format'),
  details: z.object({}),
});

export const MarketTokenizedYieldRequestSchema = z.object({
  chainIds: z
    .array(z.string().describe('Blockchain network identifier'))
    .describe('List of chain IDs to filter the markets'),
});
export type MarketTokenizedYieldRequest = z.infer<typeof MarketTokenizedYieldRequestSchema>;

export const MarketTokenizedYieldResponseSchema = z.object({
  markets: z
    .array(TokenizedYieldMarketSchema)
    .describe('Array of tokenized yield markets matching the request criteria'),
});

export const TokenizedYieldUserPositionSchema = z.object({
  marketIdentifier: TokenIdentifierSchema.describe('Unique identifier for the yield market'),
  pt: z.object({
    token: TokenSchema.describe('Details of the Principal Token (PT) held by the user'),
    exactAmount: z.string().describe('Exact amount of Principal Token (PT) held'),
    displayAmount: z.string().describe('Display amount of Principal Token (PT) held'),
  }),
  yt: z.object({
    token: TokenSchema.describe('Details of the Yield Token (YT) held by the user'),
    exactAmount: z.string().describe('Exact amount of Yield Token (YT) held'),
    displayAmount: z.string().describe('Display amount of Yield Token (YT) held'),
    claimableRewards: z.array(
      z.object({
        token: TokenSchema.describe('Details of the reward token claimable by the user'),
        exactAmount: z.string().describe('Exact amount of reward token claimable'),
        displayAmount: z.string().describe('Display amount of reward token claimable'),
      }),
    ),
  }),
});

export const TokenizedYieldUserPositionsRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  chainIds: z
    .array(z.string().describe('Blockchain network identifier'))
    .describe('List of chain IDs to filter the user positions'),
});
export type TokenizedYieldUserPositionsRequest = z.infer<
  typeof TokenizedYieldUserPositionsRequestSchema
>;

export const TokenizedYieldUserPositionsResponseSchema = z.object({
  positions: z
    .array(TokenizedYieldUserPositionSchema)
    .describe('Array of user positions in tokenized yield markets'),
});
export type TokenizedYieldUserPositionsResponse = z.infer<
  typeof TokenizedYieldUserPositionsResponseSchema
>;
