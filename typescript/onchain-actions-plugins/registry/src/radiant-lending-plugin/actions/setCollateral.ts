import type { ActionDefinition } from '../../core/index.js';
import type { RadiantAdapter } from '../adapter.js';

/**
 * Action definition for enabling assets as collateral in Radiant V2 lending protocol
 * Allows users to enable their supplied assets as collateral for borrowing
 */
export const radiantSetCollateral: ActionDefinition = {
  type: 'lending-set-collateral',
  name: 'Radiant V2 Set Collateral',
  /**
   * Get available input tokens for set collateral action
   * @param adapter - RadiantAdapter instance
   * @returns Array of tokens that can be enabled as collateral
   */
  inputTokens: async (adapter: RadiantAdapter) => {
    const reserves = await adapter.getReserves();
    return [
      {
        chainId: adapter.chain.id.toString(),
        tokens: reserves.reservesData.map(reserve => reserve.underlyingAsset),
      },
    ];
  },
  /**
   * Get output tokens for set collateral action (no output tokens)
   * @returns Empty array as setting collateral doesn't produce output tokens
   */
  outputTokens: async () => Promise.resolve([]),
  /**
   * Callback function to create set collateral transaction
   * @param adapter - RadiantAdapter instance
   * @returns Bound method to create set collateral transaction
   */
  callback: (adapter: RadiantAdapter) => adapter.createSetCollateralTransaction.bind(adapter),
};
