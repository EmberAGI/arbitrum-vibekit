import type {
  SupplyLiquidityArgs,
  LiquidityTransactionArtifact,
  WithdrawLiquidityArgs,
  TransactionPlan,
} from 'ember-schemas';

/**
 * The callback function type for the supply liquidity action.
 */
export type LiquiditySupplyCallback = (
  request: SupplyLiquidityArgs
) => Promise<LiquidityTransactionArtifact>;

/**
 * The response type for the withdraw liquidity action.
 */
export interface LiquidityWithdrawResponse {
  transactions: TransactionPlan[];
  chainId: string;
}

/**
 * The callback function type for the withdraw liquidity action.
 */
export type LiquidityWithdrawCallback = (
  request: WithdrawLiquidityArgs
) => Promise<LiquidityWithdrawResponse>;
