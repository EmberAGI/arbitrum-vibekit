import type { ActionDefinition } from '../../core/index.js';
import type { RadiantAdapter } from '../adapter.js';

/**
 * Action definition for disabling assets as collateral in Radiant V2 lending protocol
 * Allows users to disable their supplied assets as collateral
 */
export const radiantUnsetCollateral: ActionDefinition = {
  type: 'lending-unset-collateral',
  name: 'Radiant V2 Unset Collateral',
  /**
   * Get available input tokens for unset collateral action
   * @param adapter - RadiantAdapter instance
   * @returns Array of tokens that can be disabled as collateral
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
   * Get output tokens for unset collateral action (no output tokens)
   * @returns Empty array as unsetting collateral doesn't produce output tokens
   */
  outputTokens: async () => Promise.resolve([]),
  /**
   * Callback function to create unset collateral transaction
   * @param adapter - RadiantAdapter instance
   * @returns Bound method to create unset collateral transaction
   */
  callback: (adapter: RadiantAdapter) => adapter.createUnsetCollateralTransaction.bind(adapter),
};
