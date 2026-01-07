import { z } from 'zod';

/* ============================
   OrderType (0–8)
   ============================ */

export const OrderTypeSchema = z.union([
  z.literal(0), // MarketSwap
  z.literal(1), // LimitSwap
  z.literal(2), // MarketIncrease
  z.literal(3), // LimitIncrease
  z.literal(4), // MarketDecrease
  z.literal(5), // LimitDecrease
  z.literal(6), // StopLossDecrease
  z.literal(7), // Liquidation
  z.literal(8), // StopIncrease
]);

export type OrderType = z.infer<typeof OrderTypeSchema>;

/* ============================
   PositionDirection (0 | 1)
   ============================ */

export const PositionDirectionSchema = z.union([
  z.literal(0), // Long
  z.literal(1), // Short
]);

export type PositionDirection = z.infer<typeof PositionDirectionSchema>;

/* ============================
   DecreaseSwapType (0–2)
   ============================ */

export const DecreaseSwapTypeSchema = z.union([
  z.literal(0), // NoSwap
  z.literal(1), // SwapPnlTokenToCollateralToken
  z.literal(2), // SwapCollateralTokenToPnlToken
]);

export type DecreaseSwapType = z.infer<typeof DecreaseSwapTypeSchema>;

/*
interface GMXOrderParams {
  // Basic params
  orderType: OrderType;
  direction: PositionDirection;
  sizeDeltaUsd: bigint; // in USD with 30 decimals
  acceptablePrice: bigint; // price bound with 30 decimals

  // Token params
  collateralToken: string;
  collateralAmount: bigint; // token amount with appropriate decimals

  // Market
  marketAddress: string;

  // Fees
  executionFee: bigint; // in native token (ETH)

  // Optional
  isLong?: boolean;
  swapPath?: string[];
  callbackContract?: string;
  uiFeeReceiver?: string;
  minOutputAmount?: bigint; // For swaps and decrease orders
  triggerPrice?: bigint; // For limit/stop orders
  decreasePositionSwapType?: DecreaseSwapType; // For decrease orders
  shouldUnwrapNativeToken?: boolean; // For ETH unwrapping
}

*/
export const GMXOrderParamsSchema = z.object({
  orderType: OrderTypeSchema,
  direction: PositionDirectionSchema,

  sizeDeltaUsd: z.bigint(),
  acceptablePrice: z.bigint(),

  collateralToken: z.string(),
  collateralAmount: z.bigint(),

  marketAddress: z.string(),

  executionFee: z.bigint(),

  isLong: z.boolean().optional(),
  swapPath: z.array(z.string()).optional(),
  callbackContract: z.string().optional(),
  uiFeeReceiver: z.string().optional(),
  minOutputAmount: z.bigint().optional(),
  triggerPrice: z.bigint().optional(),
  decreasePositionSwapType: DecreaseSwapTypeSchema.optional(),
  shouldUnwrapNativeToken: z.boolean().optional(),
});

export type GMXOrderParams = z.infer<typeof GMXOrderParamsSchema>;
