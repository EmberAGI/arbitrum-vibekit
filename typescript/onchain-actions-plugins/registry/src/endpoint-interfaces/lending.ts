import { z } from 'zod';

import { TokenIdentifierSchema } from '../core/schemas/core.js';
import {
  BorrowTokensRequestSchema,
  RepayTokensRequestSchema,
  SupplyTokensRequestSchema,
  WithdrawTokensRequestSchema,
} from '../core/schemas/lending.js';

import {
  PaginatedPossibleResultsRequestSchema,
  PaginatedPossibleResultsResponseSchema,
} from './pagination.js';

export const CreateLendingSupplyRequestSchema = z.object({
  walletAddress: z
    .string()
    .describe('The wallet address that will supply tokens to the lending protocol'),
  amount: z.string().describe('The amount of tokens to supply to the lending protocol'),
  supplyChain: z
    .string()
    .describe('The blockchain network where the lending protocol exists'),
  supplyToken: z
    .string()
    .describe('The token symbol or name to supply to the lending protocol'),
});
export type CreateLendingSupplyRequest = z.infer<typeof CreateLendingSupplyRequestSchema>;

export const PromptLendingSupplyRequestSchema = CreateLendingSupplyRequestSchema.pick({
  walletAddress: true,
  supplyToken: true,
  supplyChain: true,
}).partial();

export const PossibleLendingSupplyRequestSchema = PaginatedPossibleResultsRequestSchema.merge(
  PromptLendingSupplyRequestSchema,
);
export type PossibleLendingSupplyRequest = z.infer<typeof PossibleLendingSupplyRequestSchema>;

export const PossibleLendingSupplyOptionSchema = z.object({
  createRequest: CreateLendingSupplyRequestSchema.pick({
    supplyToken: true,
    supplyChain: true,
  }),
  data: z.object({}).describe('Additional lending supply data (currently empty)'),
});
export type PossibleLendingSupplyOption = z.infer<typeof PossibleLendingSupplyOptionSchema>;

export const PossibleLendingSupplyResponseSchema = PaginatedPossibleResultsResponseSchema.extend({
  options: z
    .array(PossibleLendingSupplyOptionSchema)
    .describe('Available tokens and chains where you can supply to lending protocols'),
});

export const CreateSupplyEndpointRequestSchema = SupplyTokensRequestSchema.omit({
  supplyToken: true,
  amount: true,
}).extend({
  supplyTokenUid: TokenIdentifierSchema,
  amount: z.string().transform((arg) => BigInt(arg)),
});

export const CreateLendingBorrowRequestSchema = z.object({
  walletAddress: z
    .string()
    .describe('The wallet address that will borrow tokens from the lending protocol'),
  amount: z.string().describe('The amount of tokens to borrow from the lending protocol'),
  borrowChain: z.string().describe('The blockchain network where the borrowing will occur'),
  borrowToken: z.string().describe('The token symbol or name to borrow from lending protocols'),
});
export type CreateLendingBorrowRequest = z.infer<typeof CreateLendingBorrowRequestSchema>;

export const PromptLendingBorrowRequestSchema = CreateLendingBorrowRequestSchema.pick({
  walletAddress: true,
  borrowToken: true,
  borrowChain: true,
}).partial();

export const PossibleLendingBorrowRequestSchema = PaginatedPossibleResultsRequestSchema.merge(
  PromptLendingBorrowRequestSchema,
);
export type PossibleLendingBorrowRequest = z.infer<typeof PossibleLendingBorrowRequestSchema>;

export const PossibleLendingBorrowOptionSchema = z.object({
  createRequest: CreateLendingBorrowRequestSchema.pick({
    borrowToken: true,
    borrowChain: true,
  }),
  data: z.object({}).describe('Additional borrow data (currently empty)'),
});
export type PossibleLendingBorrowOption = z.infer<typeof PossibleLendingBorrowOptionSchema>;

export const PossibleLendingBorrowResponseSchema = PaginatedPossibleResultsResponseSchema.extend({
  options: z
    .array(PossibleLendingBorrowOptionSchema)
    .describe('Available tokens and chains where you can borrow from lending protocols'),
});

export const CreateBorrowEndpointRequestSchema = BorrowTokensRequestSchema.omit({
  borrowToken: true,
  amount: true,
}).extend({
  borrowTokenUid: TokenIdentifierSchema,
  amount: z.string().transform((arg) => BigInt(arg)),
});

export const CreateLendingRepayRequestSchema = z.object({
  walletAddress: z
    .string()
    .describe('The wallet address that will repay tokens to the lending protocol'),
  amount: z.string().describe('The amount of tokens to repay to the lending protocol'),
  repayChain: z.string().describe('The blockchain network where repayment will occur'),
  repayToken: z.string().describe('The token symbol or name to repay to lending protocols'),
});
export type CreateLendingRepayRequest = z.infer<typeof CreateLendingRepayRequestSchema>;

export const PromptLendingRepayRequestSchema = CreateLendingRepayRequestSchema.pick({
  walletAddress: true,
  repayToken: true,
  repayChain: true,
}).partial();

export const PossibleLendingRepayRequestSchema = PaginatedPossibleResultsRequestSchema.merge(
  PromptLendingRepayRequestSchema,
);
export type PossibleLendingRepayRequest = z.infer<typeof PossibleLendingRepayRequestSchema>;

export const PossibleLendingRepayOptionSchema = z.object({
  createRequest: CreateLendingRepayRequestSchema.pick({
    repayToken: true,
    repayChain: true,
  }),
  data: z.object({}).describe('Additional repay data (currently empty)'),
});
export type PossibleLendingRepayOption = z.infer<typeof PossibleLendingRepayOptionSchema>;

export const PossibleLendingRepayResponseSchema = PaginatedPossibleResultsResponseSchema.extend({
  options: z
    .array(PossibleLendingRepayOptionSchema)
    .describe('Available tokens and chains where you can repay to lending protocols'),
});

export const CreateRepayEndpointRequestSchema = RepayTokensRequestSchema.omit({
  repayToken: true,
  amount: true,
}).extend({
  repayTokenUid: TokenIdentifierSchema,
  amount: z.string().transform((arg) => BigInt(arg)),
});

export const CreateLendingWithdrawRequestSchema = z.object({
  walletAddress: z
    .string()
    .describe('The wallet address that will withdraw tokens from the lending protocol'),
  amount: z.string().describe('The amount of tokens to withdraw from the lending protocol'),
  withdrawChain: z
    .string()
    .describe('The blockchain network where the withdrawal will occur'),
  withdrawToken: z
    .string()
    .describe('The token symbol or name to withdraw from lending protocols'),
});
export type CreateLendingWithdrawRequest = z.infer<typeof CreateLendingWithdrawRequestSchema>;

export const PromptLendingWithdrawRequestSchema = CreateLendingWithdrawRequestSchema.pick({
  walletAddress: true,
  withdrawToken: true,
  withdrawChain: true,
}).partial();

export const PossibleLendingWithdrawRequestSchema =
  PaginatedPossibleResultsRequestSchema.merge(PromptLendingWithdrawRequestSchema);
export type PossibleLendingWithdrawRequest = z.infer<
  typeof PossibleLendingWithdrawRequestSchema
>;

export const PossibleLendingWithdrawOptionSchema = z.object({
  createRequest: CreateLendingWithdrawRequestSchema.pick({
    withdrawToken: true,
    withdrawChain: true,
  }),
  data: z.object({}).describe('Additional withdraw data (currently empty)'),
});
export type PossibleLendingWithdrawOption = z.infer<
  typeof PossibleLendingWithdrawOptionSchema
>;

export const PossibleLendingWithdrawResponseSchema = PaginatedPossibleResultsResponseSchema.extend({
  options: z
    .array(PossibleLendingWithdrawOptionSchema)
    .describe('Available tokens and chains where you can withdraw from lending protocols'),
});

export const CreateWithdrawEndpointRequestSchema = WithdrawTokensRequestSchema.omit({
  tokenToWithdraw: true,
  amount: true,
}).extend({
  tokenUidToWidthraw: TokenIdentifierSchema,
  amount: z.string().transform((arg) => BigInt(arg)),
});
