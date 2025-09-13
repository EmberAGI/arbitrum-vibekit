import type {
  SupplyLiquidityRequest,
  SupplyLiquidityResponse,
  WithdrawLiquidityRequest,
  WithdrawLiquidityResponse,
} from '../schemas/liquidity.js';

/**
 * The callback function type for the supply liquidity action.
 */
export type LiquiditySupplyCallback = (
  request: SupplyLiquidityRequest
) => Promise<SupplyLiquidityResponse>;

/**
 * The callback function type for the withdraw liquidity action.
 */
export type LiquidityWithdrawCallback = (
  request: WithdrawLiquidityRequest
) => Promise<WithdrawLiquidityResponse>;

/**
 * The possible actions related to liquidity.
 */
export type LiquidityActions = 'liquidity-supply' | 'liquidity-withdraw';
