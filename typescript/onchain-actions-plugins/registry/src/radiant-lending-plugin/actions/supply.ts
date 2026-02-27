import type { ActionDefinition } from '../../core/index.js';
import type { RadiantAdapter } from '../adapter.js';

/**
 * Action definition for supplying tokens to Radiant V2 lending protocol
 * Allows users to deposit tokens and earn yield
 */
export const radiantSupply: ActionDefinition = {
  type: 'lending-supply',
  name: 'Radiant V2 Supply',
  /**
   * Get available input tokens for supply action
   * @param adapter - RadiantAdapter instance
   * @returns Array of available tokens that can be supplied
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
   * Get output tokens received when supplying (aTokens)
   * @param adapter - RadiantAdapter instance
   * @returns Array of aTokens received when supplying
   */
  outputTokens: async (adapter: RadiantAdapter) => {
    const reserves = await adapter.getReserves();
    return [
      {
        chainId: adapter.chain.id.toString(),
        tokens: reserves.reservesData.map(reserve => reserve.aTokenAddress),
      },
    ];
  },
  /**
   * Callback function to create supply transaction
   * @param adapter - RadiantAdapter instance
   * @returns Bound method to create supply transaction
   */
  callback: (adapter: RadiantAdapter) => adapter.createSupplyTransaction.bind(adapter),
};
