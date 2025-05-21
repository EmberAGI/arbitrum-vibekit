import { z } from 'zod';
import { TokenSchema } from './token.js';
import { AskEncyclopediaSchema as GenericAskEncyclopediaSchema } from './swapping-agent-schemas.js';

export const LendingCapabilitySchema = z.object({
  capabilityId: z.string().optional(),
  currentSupplyApy: z.string().optional(),
  currentBorrowApy: z.string().optional(),
  underlyingToken: TokenSchema.optional(),
  maxLtv: z.string().optional(),
  liquidationThreshold: z.string().optional(),
});
export type LendingCapability = z.infer<typeof LendingCapabilitySchema>;

export const LendingAgentCapabilitySchema = z.object({
  lendingCapability: LendingCapabilitySchema.optional(),
});
export type LendingAgentCapability = z.infer<typeof LendingAgentCapabilitySchema>;

export const LendingGetCapabilitiesResponseSchema = z.object({
  capabilities: z.array(LendingAgentCapabilitySchema),
});
export type LendingGetCapabilitiesResponse = z.infer<typeof LendingGetCapabilitiesResponseSchema>;

export const McpTextWrapperSchema = z.object({
  content: z
    .array(
      z.object({
        type: z.literal('text'),
        text: z.string(),
      })
    )
    .min(1),
});
export type McpTextWrapper = z.infer<typeof McpTextWrapperSchema>;

export const BorrowRepaySupplyWithdrawSchema = z.object({
  tokenName: z
    .string()
    .describe(
      "The symbol of the token (e.g., 'USDC', 'WETH'). Must be one of the available tokens."
    ),
  amount: z
    .string()
    .describe('The amount of the token to use, as a string representation of a number.'),
});
export type BorrowRepaySupplyWithdrawArgs = z.infer<typeof BorrowRepaySupplyWithdrawSchema>;

export const GetUserPositionsSchema = z.object({});
export type GetUserPositionsArgs = z.infer<typeof GetUserPositionsSchema>;

export const LendingAskEncyclopediaSchema = GenericAskEncyclopediaSchema;
export type LendingAskEncyclopediaArgs = z.infer<typeof LendingAskEncyclopediaSchema>;

// Schema for individual user reserve data, aligned with SDK's LendTokenDetail
export const UserReserveSchema = z.object({
  token: TokenSchema.optional().describe("The token for which this reserve data pertains. Optional as per SDK definition (Token | undefined)."),
  underlyingBalance: z.string().describe("User's balance of the underlying asset in this reserve."),
  underlyingBalanceUsd: z.string().describe("USD value of the user's underlying balance in this reserve."),
  variableBorrows: z.string().describe("User's total variable debt for this asset in this reserve."),
  variableBorrowsUsd: z.string().describe("USD value of the user's variable debt for this asset in this reserve."),
  totalBorrows: z.string().describe("User's total debt (stable + variable) for this asset in this reserve."),
  totalBorrowsUsd: z.string().describe("USD value of the user's total debt for this asset in this reserve."),
});
export type UserReserve = z.infer<typeof UserReserveSchema>; 