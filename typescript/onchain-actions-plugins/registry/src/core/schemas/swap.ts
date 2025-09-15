import { z } from 'zod';
import {
  FeeBreakdownSchema,
  TransactionPlanSchema,
  SwapEstimationSchema,
  ProviderTrackingInfoSchema,
  TokenSchema,
} from './core.js';

export const SwapTokensRequestSchema = z.object({
  fromToken: TokenSchema,
  toToken: TokenSchema,
  amount: z.bigint(),
  limitPrice: z.string().optional(),
  slippageTolerance: z.string().optional(),
  expiration: z.string().optional(),
  recipient: z.string(),
});
export type SwapTokensRequest = z.infer<typeof SwapTokensRequestSchema>;

export const SwapTokensResponseSchema = z.object({
  fromToken: TokenSchema,
  toToken: TokenSchema,
  exactFromAmount: z.string(),
  displayFromAmount: z.string(),
  exactToAmount: z.string(),
  displayToAmount: z.string(),
  transactions: z.array(TransactionPlanSchema),
  feeBreakdown: FeeBreakdownSchema.optional(),
  estimation: SwapEstimationSchema.optional(),
  providerTracking: ProviderTrackingInfoSchema.optional(),
});
export type SwapTokensResponse = z.infer<typeof SwapTokensResponseSchema>;
