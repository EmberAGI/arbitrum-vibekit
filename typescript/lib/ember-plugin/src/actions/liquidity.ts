import type {
  SupplyLiquidityArgs,
  LiquidityTransactionArtifact,
  WithdrawLiquidityArgs,
  TransactionPlan,
} from 'ember-schemas';

/**
 * The callback function type for the supply liquidity action.
 */
export type SupplyLiquidityCallback = (
  request: SupplyLiquidityArgs
) => Promise<LiquidityTransactionArtifact>;

/**
 * The response type for the withdraw liquidity action.
 */
export interface WithdrawLiquidityResponse {
  transactions: TransactionPlan[];
  chainId: string;
}

/**
 * The callback function type for the withdraw liquidity action.
 */
export type WithdrawLiquidityCallback = (
  request: WithdrawLiquidityArgs
) => Promise<WithdrawLiquidityResponse>;
