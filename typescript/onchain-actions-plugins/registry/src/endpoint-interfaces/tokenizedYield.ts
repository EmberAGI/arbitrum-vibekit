import { z } from 'zod';

import {
  BuyPtRequestSchema,
  BuyPtResponseSchema,
  BuyYtRequestSchema,
  BuyYtResponseSchema,
  ClaimRewardsRequestSchema,
  ClaimRewardsResponseSchema,
  MintPtAndYtRequestSchema,
  MintPtAndYtResponseSchema,
  RedeemPtRequestSchema,
  RedeemPtResponseSchema,
  SellPtRequestSchema,
  SellPtResponseSchema,
  SellYtRequestSchema,
  SellYtResponseSchema,
} from '../core/schemas/tokenizedYield.js';
import { TokenIdentifierSchema, TokenSchema } from '../core/schemas/core.js';

export const CreateTokenizedYieldBuyPtEndpointRequestSchema =
  BuyPtRequestSchema.omit({ inputToken: true, amount: true }).extend({
    inputTokenUid: TokenIdentifierSchema,
    amount: z.string().transform((arg) => BigInt(arg)),
  });

export const CreateTokenizedYieldBuyPtResponseSchema = BuyPtResponseSchema.omit({
  ptTokenIdentifier: true,
}).extend({
  ptToken: TokenSchema,
  displayPtAmount: z.string(),
});
export type CreateTokenizedYieldBuyPtResponse = z.infer<
  typeof CreateTokenizedYieldBuyPtResponseSchema
>;

export const CreateTokenizedYieldBuyPtSchema = z.object({
  walletAddress: z.string().describe('The wallet address that will buy the PT tokens'),
  inputToken: z.string().describe('The token symbol or name to be used as input'),
  amount: z.string().describe('The amount of tokens to be used as input for buying PT'),
  slippage: z
    .string()
    .describe('The maximum acceptable slippage percentage for the buying transaction')
    .default('0.01'),
  chain: z.string().describe('The blockchain network to perform the action on'),
  minimumMarketExpiry: z.string().describe('The minimum expiry date of the market to use'),
});
export type CreateTokenizedYieldBuyPt = z.infer<typeof CreateTokenizedYieldBuyPtSchema>;

export const PromptTokenizedYieldBuyPtRequestSchema = CreateTokenizedYieldBuyPtSchema.pick({
  walletAddress: true,
  inputToken: true,
  amount: true,
  chain: true,
  minimumMarketExpiry: true,
}).partial();

export const CreateTokenizedYieldBuyYtEndpointRequestSchema =
  BuyYtRequestSchema.omit({ inputToken: true, amount: true }).extend({
    inputTokenUid: TokenIdentifierSchema,
    amount: z.string().transform((arg) => BigInt(arg)),
  });

export const CreateTokenizedYieldBuyYtResponseSchema = BuyYtResponseSchema.omit({
  ytTokenIdentifier: true,
}).extend({
  ytToken: TokenSchema,
  displayYtAmount: z.string(),
});
export type CreateTokenizedYieldBuyYtResponse = z.infer<
  typeof CreateTokenizedYieldBuyYtResponseSchema
>;

export const CreateTokenizedYieldBuyYtSchema = z.object({
  walletAddress: z.string().describe('The wallet address that will buy the YT tokens'),
  inputToken: z.string().describe('The token symbol or name to be used as input'),
  amount: z.string().describe('The amount of tokens to be used as input for buying YT'),
  slippage: z
    .string()
    .describe('The maximum acceptable slippage percentage for the buying transaction')
    .default('0.01'),
  chain: z.string().describe('The blockchain network to perform the action on'),
  minimumMarketExpiry: z.string().describe('The minimum expiry date of the market to use'),
});
export type CreateTokenizedYieldBuyYt = z.infer<typeof CreateTokenizedYieldBuyYtSchema>;

export const PromptTokenizedYieldBuyYtRequestSchema = CreateTokenizedYieldBuyYtSchema.pick({
  walletAddress: true,
  inputToken: true,
  amount: true,
  chain: true,
  minimumMarketExpiry: true,
}).partial();

export const CreateTokenizedYieldSellPtEndpointRequestSchema =
  SellPtRequestSchema.omit({ ptToken: true, amount: true }).extend({
    ptTokenUid: TokenIdentifierSchema,
    amount: z.string().transform((arg) => BigInt(arg)),
  });

export const CreateTokenizedYieldSellPtResponseSchema = SellPtResponseSchema.omit({
  tokenOutIdentifier: true,
}).extend({
  tokenOut: TokenSchema,
  displayAmountOut: z.string(),
});
export type CreateTokenizedYieldSellPtResponse = z.infer<
  typeof CreateTokenizedYieldSellPtResponseSchema
>;

export const CreateTokenizedYieldSellPtSchema = z.object({
  walletAddress: z.string().describe('The wallet address that will sell the PT tokens'),
  ptToken: z.string().describe('The PT token symbol or name to be sold'),
  amount: z.string().describe('The amount of PT tokens to sell'),
  slippage: z
    .string()
    .describe('The maximum acceptable slippage percentage for the selling transaction')
    .default('0.01'),
  chain: z.string().describe('The blockchain network to perform the action on'),
});
export type CreateTokenizedYieldSellPt = z.infer<typeof CreateTokenizedYieldSellPtSchema>;

export const PromptTokenizedYieldSellPtRequestSchema = CreateTokenizedYieldSellPtSchema.pick({
  walletAddress: true,
  ptToken: true,
  amount: true,
  chain: true,
}).partial();

export const CreateTokenizedYieldSellYtEndpointRequestSchema =
  SellYtRequestSchema.omit({ ytToken: true, amount: true }).extend({
    ytTokenUid: TokenIdentifierSchema,
    amount: z.string().transform((arg) => BigInt(arg)),
  });

export const CreateTokenizedYieldSellYtResponseSchema = SellYtResponseSchema.omit({
  tokenOutIdentifier: true,
}).extend({
  tokenOut: TokenSchema,
  displayAmountOut: z.string(),
});
export type CreateTokenizedYieldSellYtResponse = z.infer<
  typeof CreateTokenizedYieldSellYtResponseSchema
>;

export const CreateTokenizedYieldSellYtSchema = z.object({
  walletAddress: z.string().describe('The wallet address that will sell the YT tokens'),
  ytToken: z.string().describe('The YT token symbol or name to be sold'),
  amount: z.string().describe('The amount of YT tokens to sell'),
  slippage: z
    .string()
    .describe('The maximum acceptable slippage percentage for the selling transaction')
    .default('0.01'),
  chain: z.string().describe('The blockchain network to perform the action on'),
});
export type CreateTokenizedYieldSellYt = z.infer<typeof CreateTokenizedYieldSellYtSchema>;

export const PromptTokenizedYieldSellYtRequestSchema = CreateTokenizedYieldSellYtSchema.pick({
  walletAddress: true,
  ytToken: true,
  amount: true,
  chain: true,
}).partial();

export const CreateTokenizedYieldMintPtAndYtEndpointRequestSchema =
  MintPtAndYtRequestSchema.omit({ inputToken: true, amount: true }).extend({
    inputTokenUid: TokenIdentifierSchema,
    amount: z.string().transform((arg) => BigInt(arg)),
  });

export const CreateTokenizedYieldMintPtAndYtResponseSchema =
  MintPtAndYtResponseSchema.omit({
    ptTokenIdentifier: true,
    ytTokenIdentifier: true,
  }).extend({
    ptToken: TokenSchema,
    displayPtAmount: z.string(),
    ytToken: TokenSchema,
    displayYtAmount: z.string(),
  });
export type CreateTokenizedYieldMintPtAndYtResponse = z.infer<
  typeof CreateTokenizedYieldMintPtAndYtResponseSchema
>;

export const CreateTokenizedYieldMintPtAndYtSchema = z.object({
  walletAddress: z
    .string()
    .describe('The wallet address that will mint the PT and YT tokens'),
  inputToken: z.string().describe('The token symbol or name to be used as input'),
  amount: z
    .string()
    .describe('The amount of tokens to be used as input for minting PT and YT'),
  slippage: z
    .string()
    .describe('The maximum acceptable slippage percentage for the minting transaction')
    .default('0.01'),
  chain: z.string().describe('The blockchain network to perform the action on'),
  minimumMarketExpiry: z.string().describe('The minimum expiry date of the market to use'),
});
export type CreateTokenizedYieldMintPTAndYt = z.infer<
  typeof CreateTokenizedYieldMintPtAndYtSchema
>;

export const PromptTokenizedYieldMintPtAndYtRequestSchema =
  CreateTokenizedYieldMintPtAndYtSchema.pick({
    walletAddress: true,
    inputToken: true,
    amount: true,
    chain: true,
    minimumMarketExpiry: true,
  }).partial();

export const CreateTokenizedYieldRedeemPtEndpointRequestSchema =
  RedeemPtRequestSchema.omit({ ptToken: true, amount: true }).extend({
    ptTokenUid: TokenIdentifierSchema,
    amount: z.string().transform((arg) => BigInt(arg)),
  });

export const CreateTokenizedYieldRedeemPtResponseSchema =
  RedeemPtResponseSchema.omit({
    underlyingTokenIdentifier: true,
  }).extend({
    underlyingToken: TokenSchema,
    displayUnderlyingAmount: z.string(),
  });
export type CreateTokenizedYieldRedeemPtResponse = z.infer<
  typeof CreateTokenizedYieldRedeemPtResponseSchema
>;

export const CreateTokenizedYieldRedeemPtSchema = z.object({
  walletAddress: z.string().describe('The wallet address that will redeem the PT tokens'),
  ptToken: z
    .string()
    .describe('The PT token symbol or name to be redeemed after maturity'),
  amount: z.string().describe('The amount of PT tokens to redeem'),
  chain: z.string().describe('The blockchain network to perform the action on'),
});
export type CreateTokenizedYieldRedeemPt = z.infer<typeof CreateTokenizedYieldRedeemPtSchema>;

export const PromptTokenizedYieldRedeemPtRequestSchema =
  CreateTokenizedYieldRedeemPtSchema.pick({
    walletAddress: true,
    ptToken: true,
    amount: true,
    chain: true,
  }).partial();

export const CreateTokenizedYieldClaimRewardsEndpointRequestSchema =
  ClaimRewardsRequestSchema.omit({ ytToken: true }).extend({
    ytTokenUid: TokenIdentifierSchema,
  });

export const CreateTokenizedYieldClaimRewardsResponseSchema = ClaimRewardsResponseSchema;
export type CreateTokenizedYieldClaimRewardsResponse = z.infer<
  typeof CreateTokenizedYieldClaimRewardsResponseSchema
>;

export const CreateTokenizedYieldClaimRewardsSchema = z.object({
  walletAddress: z.string().describe('The wallet address that will claim the rewards'),
  ytToken: z.string().describe('The YT token symbol or name to claim rewards from'),
  chain: z.string().describe('The blockchain network to perform the action on'),
});
export type CreateTokenizedYieldClaimRewards = z.infer<
  typeof CreateTokenizedYieldClaimRewardsSchema
>;

export const PromptTokenizedYieldClaimRewardsRequestSchema =
  CreateTokenizedYieldClaimRewardsSchema.pick({
    walletAddress: true,
    ytToken: true,
    chain: true,
  }).partial();
