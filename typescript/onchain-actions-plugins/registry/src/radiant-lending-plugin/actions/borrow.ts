import type { ActionDefinition } from '../../core/index.js';
import type { RadiantAdapter } from '../adapter.js';

/**
 * Action definition for borrowing tokens from Radiant V2 lending protocol
 * Allows users to borrow tokens against their collateral
 */
export const radiantBorrow: ActionDefinition = {
  type: 'lending-borrow',
  name: 'Radiant V2 Borrow',
  /**
   * Get available input tokens for borrow action (aTokens as collateral)
   * @param adapter - RadiantAdapter instance
   * @returns Array of aTokens that can be used as collateral
   */
  inputTokens: async (adapter: RadiantAdapter) => {
    const reserves = await adapter.getReserves();
    return [
      {
        chainId: adapter.chain.id.toString(),
        tokens: reserves.reservesData.map(reserve => reserve.aTokenAddress),
      },
    ];
  },
  /**
   * Get output tokens that can be borrowed
   * @param adapter - RadiantAdapter instance
   * @returns Array of tokens available for borrowing
   */
  outputTokens: async (adapter: RadiantAdapter) => {
    const reserves = await adapter.getReserves();
    const borrowableAssets = reserves.reservesData
      .filter(reserve => reserve.borrowingEnabled)
      .map(reserve => reserve.underlyingAsset);
    
    return [
      {
        chainId: adapter.chain.id.toString(),
        tokens: borrowableAssets,
      },
    ];
  },
  /**
   * Callback function to create borrow transaction
   * @param adapter - RadiantAdapter instance
   * @returns Bound method to create borrow transaction
   */
  callback: (adapter: RadiantAdapter) => adapter.createBorrowTransaction.bind(adapter),
};
