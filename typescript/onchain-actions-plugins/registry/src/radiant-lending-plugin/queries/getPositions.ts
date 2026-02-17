import type { RadiantAdapter } from '../adapter.js';

/**
 * Query definition for getting user's lending positions from Radiant V2 protocol
 */
export const radiantGetPositions = {
  id: 'getPositions',
  /**
   * Handler function to get user's lending positions
   * @param adapter - RadiantAdapter instance
   * @param walletAddress - User's wallet address
   * @returns User's lending positions summary
   */
  async handler(adapter: RadiantAdapter, walletAddress: string) {
    return adapter.getUserSummary({ walletAddress });
  },
};
