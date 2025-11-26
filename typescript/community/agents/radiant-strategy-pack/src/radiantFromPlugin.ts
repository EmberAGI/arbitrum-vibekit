import { RadiantClient } from './radiantClient';

/**
 * Creates a RadiantClient from the Radiant plugin
 * 
 * This adapter wraps the Radiant plugin's transaction builders and data fetchers
 * into a unified interface that strategies can use.
 * 
 * @param plugin - The Radiant plugin instance from onchain-actions-plugins
 * @param wallet - User wallet address for position queries
 * @param executor - Function to execute transactions (signs and sends)
 */
export function makeRadiantClient(
  plugin: any,
  wallet: string,
  executor: (tx: { to: string; data: string; value: string | null }) => Promise<void>
): RadiantClient {
  return {
    async supply(params) {
      const tx = plugin.actions.supply(params);
      await executor(tx);
    },

    async borrow(params) {
      const tx = plugin.actions.borrow(params);
      await executor(tx);
    },

    async repay(params) {
      const tx = plugin.actions.repay(params);
      await executor(tx);
    },

    async withdraw(params) {
      const tx = plugin.actions.withdraw(params);
      await executor(tx);
    },

    async getHealthFactor(userWallet: string) {
      const position = await plugin.actions.getUserPosition(userWallet);
      return position.healthFactor;
    },

    async getBorrowCapacity(userWallet: string) {
      const position = await plugin.actions.getUserPosition(userWallet);
      return BigInt(position.availableBorrowsUSD || 0);
    },

    async getTotalCollateral(userWallet: string) {
      const position = await plugin.actions.getUserPosition(userWallet);
      return BigInt(position.totalCollateralUSD || 0);
    },

    async getBorrowedAmount(userWallet: string) {
      const position = await plugin.actions.getUserPosition(userWallet);
      return BigInt(position.totalDebtUSD || 0);
    },

    async getPendingRewards(userWallet: string) {
      // Radiant plugin doesn't expose rewards yet, return 0 for now
      return 0n;
    },

    async getAPYSpread() {
      const markets = await plugin.actions.fetchMarkets();
      // Return average APY spread from all markets
      const avgLending = markets.reduce((sum: number, m: any) => sum + m.supplyAPR, 0) / markets.length;
      const avgBorrow = markets.reduce((sum: number, m: any) => sum + m.borrowAPR, 0) / markets.length;
      return { lendingAPY: avgLending, borrowAPY: avgBorrow };
    },
  };
}
