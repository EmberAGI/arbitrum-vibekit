import { z } from 'zod';
import { OrderTypeSchema, TransactionPlanStatusSchema } from './enums.js';
import {
  TokenIdentifierSchema,
  FeeBreakdownSchema,
  TransactionPlanSchema,
  SwapEstimationSchema,
  ProviderTrackingInfoSchema,
  TransactionPlanErrorSchema,
} from './core.js';

export const SwapTokensRequestSchema = z.object({
  orderType: OrderTypeSchema,
  baseToken: TokenIdentifierSchema,
  quoteToken: TokenIdentifierSchema,
  amount: z.string(),
  limitPrice: z.string().optional(),
  slippageTolerance: z.string().optional(),
  expiration: z.string().optional(),
  recipient: z.string(),
});
export type SwapTokensRequest = z.infer<typeof SwapTokensRequestSchema>;

export const SwapTokensResponseSchema = z.object({
  status: TransactionPlanStatusSchema,
  orderType: OrderTypeSchema,
  baseToken: TokenIdentifierSchema,
  quoteToken: TokenIdentifierSchema,
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
  estimation: SwapEstimationSchema.optional(),
  providerTracking: ProviderTrackingInfoSchema.optional(),
  error: TransactionPlanErrorSchema.optional(),
  chainId: z.string(),
});
export type SwapTokensResponse = z.infer<typeof SwapTokensResponseSchema>;

export const GetProviderTrackingStatusRequestSchema = z.object({
  requestId: z.string(),
  transactionId: z.string(),
});
export type GetProviderTrackingStatusRequest = z.infer<
  typeof GetProviderTrackingStatusRequestSchema
>;

export const GetProviderTrackingStatusResponseSchema = z.object({
  trackingStatus: z.object({
    requestId: z.string(),
    transactionId: z.string(),
    providerName: z.string(),
    explorerUrl: z.string(),
    status: z.string(),
  }),
});
export type GetProviderTrackingStatusResponse = z.infer<
  typeof GetProviderTrackingStatusResponseSchema
>;
