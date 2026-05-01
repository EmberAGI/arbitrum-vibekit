import type { ActionDefinition } from '../../core/index.js';
import type { RadiantAdapter } from '../adapter.js';

/**
 * Action definition for repaying borrowed tokens in Radiant V2 lending protocol
 * Allows users to repay their outstanding debt
 */
export const radiantRepay: ActionDefinition = {
  type: 'lending-repay',
  name: 'Radiant V2 Repay',
  /**
   * Get available input tokens for repay action (borrowable tokens to repay)
   * @param adapter - RadiantAdapter instance
   * @returns Array of borrowable tokens that can be repaid
   */
  inputTokens: async (adapter: RadiantAdapter) => {
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
   * Get output tokens for repay action (no output tokens)
   * @returns Empty array as repaying doesn't produce output tokens
   */
  outputTokens: async () => Promise.resolve([]),
  /**
   * Callback function to create repay transaction
   * @param adapter - RadiantAdapter instance
   * @returns Bound method to create repay transaction
   */
  callback: (adapter: RadiantAdapter) => adapter.createRepayTransaction.bind(adapter),
};
