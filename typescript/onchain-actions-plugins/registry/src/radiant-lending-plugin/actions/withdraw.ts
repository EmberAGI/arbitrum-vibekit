import type { ActionDefinition } from '../../core/index.js';
import type { RadiantAdapter } from '../adapter.js';

/**
 * Action definition for withdrawing tokens from Radiant V2 lending protocol
 * Allows users to withdraw previously supplied tokens
 */
export const radiantWithdraw: ActionDefinition = {
  type: 'lending-withdraw',
  name: 'Radiant V2 Withdraw',
  /**
   * Get available input tokens for withdraw action (aTokens)
   * @param adapter - RadiantAdapter instance
   * @returns Array of aTokens that can be withdrawn
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
   * Get output tokens received when withdrawing (underlying tokens)
   * @param adapter - RadiantAdapter instance
   * @returns Array of underlying tokens received when withdrawing
   */
  outputTokens: async (adapter: RadiantAdapter) => {
    const reserves = await adapter.getReserves();
    return [
      {
        chainId: adapter.chain.id.toString(),
        tokens: reserves.reservesData.map(reserve => reserve.underlyingAsset),
      },
    ];
  },
  /**
   * Callback function to create withdraw transaction
   * @param adapter - RadiantAdapter instance
   * @returns Bound method to create withdraw transaction
   */
  callback: (adapter: RadiantAdapter) => adapter.createWithdrawTransaction.bind(adapter),
};
