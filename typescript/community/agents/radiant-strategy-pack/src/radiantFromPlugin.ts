/**
 * Radiant Plugin Adapter
 * 
 * Creates a RadiantClient from the Radiant plugin, providing a unified interface
 * that strategies can use without worrying about plugin implementation details.
 * 
 * This adapter:
 * - Wraps plugin transaction builders with execution logic
 * - Handles data fetching and position queries
 * - Provides error handling and validation
 * - Abstracts away plugin-specific interfaces
 * 
 * The adapter pattern allows strategies to focus on business logic while
 * maintaining flexibility to swap underlying implementations.
 */

import { RadiantClient } from './radiantClient.js';

/**
 * Creates a RadiantClient from the Radiant plugin
 * 
 * This adapter wraps the Radiant plugin's transaction builders and data fetchers
 * into a unified interface that strategies can use consistently.
 * 
 * @param plugin - The Radiant plugin instance from onchain-actions-plugins
 * @param wallet - User wallet address for position queries and transactions
 * @param executor - Function to execute transactions (handles signing and sending)
 * @returns RadiantClient instance with all lending operations available
 */
export function makeRadiantClient(
  plugin: any,
  wallet: string,
  executor: (tx: { to: string; data: string; value: string | null }) => Promise<void>
): RadiantClient {
  
  // Validate inputs
  if (!plugin || !plugin.actions) {
    throw new Error('Invalid plugin: must have actions property');
  }
  
  if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    throw new Error('Invalid wallet address format');
  }
  
  if (typeof executor !== 'function') {
    throw new Error('Executor must be a function');
  }

  return {
    /**
     * Supply assets to Radiant lending pool
     * 
     * @param params Supply parameters (token address and amount)
     */
    async supply(params) {
      try {
        if (!params.token || !params.amount) {
          throw new Error('Supply requires token and amount parameters');
        }
        
        console.log(`📤 Building supply transaction for ${params.amount} of ${params.token}`);
        const tx = plugin.actions.supply(params);
        
        if (!tx || !tx.to || !tx.data) {
          throw new Error('Plugin returned invalid transaction data');
        }
        
        await executor(tx);
      } catch (error: any) {
        throw new Error(`Supply operation failed: ${error.message}`);
      }
    },

    /**
     * Borrow assets from Radiant lending pool
     * 
     * @param params Borrow parameters (token address and amount)
     */
    async borrow(params) {
      try {
        if (!params.token || !params.amount) {
          throw new Error('Borrow requires token and amount parameters');
        }
        
        console.log(`📤 Building borrow transaction for ${params.amount} of ${params.token}`);
        const tx = plugin.actions.borrow(params);
        
        if (!tx || !tx.to || !tx.data) {
          throw new Error('Plugin returned invalid transaction data');
        }
        
        await executor(tx);
      } catch (error: any) {
        throw new Error(`Borrow operation failed: ${error.message}`);
      }
    },

    /**
     * Repay borrowed assets to Radiant lending pool
     * 
     * @param params Repay parameters (token address and amount)
     */
    async repay(params) {
      try {
        if (!params.token || !params.amount) {
          throw new Error('Repay requires token and amount parameters');
        }
        
        console.log(`📤 Building repay transaction for ${params.amount} of ${params.token}`);
        const tx = plugin.actions.repay(params);
        
        if (!tx || !tx.to || !tx.data) {
          throw new Error('Plugin returned invalid transaction data');
        }
        
        await executor(tx);
      } catch (error: any) {
        throw new Error(`Repay operation failed: ${error.message}`);
      }
    },

    /**
     * Withdraw supplied assets from Radiant lending pool
     * 
     * @param params Withdraw parameters (token address and amount)
     */
    async withdraw(params) {
      try {
        if (!params.token || !params.amount) {
          throw new Error('Withdraw requires token and amount parameters');
        }
        
        console.log(`📤 Building withdraw transaction for ${params.amount} of ${params.token}`);
        const tx = plugin.actions.withdraw(params);
        
        if (!tx || !tx.to || !tx.data) {
          throw new Error('Plugin returned invalid transaction data');
        }
        
        await executor(tx);
      } catch (error: any) {
        throw new Error(`Withdraw operation failed: ${error.message}`);
      }
    },

    /**
     * Get user's current health factor
     * 
     * Health factor indicates how close a position is to liquidation.
     * Values below 1.0 indicate liquidation risk.
     * 
     * @param userWallet - Wallet address to check (optional, uses default wallet)
     * @returns Current health factor as a number
     */
    async getHealthFactor(userWallet: string) {
      try {
        const targetWallet = userWallet || wallet;
        console.log(`📊 Fetching health factor for ${targetWallet}`);
        
        const position = await plugin.actions.getUserPosition(targetWallet);
        
        if (!position) {
          throw new Error('No position data returned from plugin');
        }
        
        // Handle case where user has no position (no collateral/debt)
        if (!position.healthFactor && position.healthFactor !== 0) {
          console.log('ℹ️  No active position found, returning max health factor');
          return Number.MAX_SAFE_INTEGER; // No debt = infinite health factor
        }
        
        return position.healthFactor;
      } catch (error: any) {
        throw new Error(`Failed to get health factor: ${error.message}`);
      }
    },

    /**
     * Get user's available borrow capacity in USD
     * 
     * @param userWallet - Wallet address to check (optional, uses default wallet)
     * @returns Available borrow capacity as BigInt
     */
    async getBorrowCapacity(userWallet: string) {
      try {
        const targetWallet = userWallet || wallet;
        console.log(`📊 Fetching borrow capacity for ${targetWallet}`);
        
        const position = await plugin.actions.getUserPosition(targetWallet);
        
        if (!position) {
          throw new Error('No position data returned from plugin');
        }
        
        return BigInt(position.availableBorrowsUSD || 0);
      } catch (error: any) {
        throw new Error(`Failed to get borrow capacity: ${error.message}`);
      }
    },

    /**
     * Get user's total collateral value in USD
     * 
     * @param userWallet - Wallet address to check (optional, uses default wallet)
     * @returns Total collateral value as BigInt
     */
    async getTotalCollateral(userWallet: string) {
      try {
        const targetWallet = userWallet || wallet;
        console.log(`📊 Fetching total collateral for ${targetWallet}`);
        
        const position = await plugin.actions.getUserPosition(targetWallet);
        
        if (!position) {
          throw new Error('No position data returned from plugin');
        }
        
        return BigInt(position.totalCollateralUSD || 0);
      } catch (error: any) {
        throw new Error(`Failed to get total collateral: ${error.message}`);
      }
    },

    /**
     * Get user's total borrowed amount in USD
     * 
     * @param userWallet - Wallet address to check (optional, uses default wallet)
     * @returns Total borrowed amount as BigInt
     */
    async getBorrowedAmount(userWallet: string) {
      try {
        const targetWallet = userWallet || wallet;
        console.log(`📊 Fetching borrowed amount for ${targetWallet}`);
        
        const position = await plugin.actions.getUserPosition(targetWallet);
        
        if (!position) {
          throw new Error('No position data returned from plugin');
        }
        
        return BigInt(position.totalDebtUSD || 0);
      } catch (error: any) {
        throw new Error(`Failed to get borrowed amount: ${error.message}`);
      }
    },

    /**
     * Get user's pending RDNT rewards
     * 
     * Note: Current Radiant plugin doesn't expose rewards functionality yet.
     * This is a placeholder that returns 0 for now.
     * 
     * @param userWallet - Wallet address to check (optional, uses default wallet)
     * @returns Pending rewards as BigInt (currently always 0)
     */
    async getPendingRewards(userWallet: string) {
      try {
        // TODO: Implement when Radiant plugin adds reward support
        console.log('ℹ️  Reward functionality not yet available in plugin');
        return 0n;
      } catch (error: any) {
        throw new Error(`Failed to get pending rewards: ${error.message}`);
      }
    },

    /**
     * Get current APY spread between lending and borrowing rates
     * 
     * Calculates average APY across all markets to give an overview
     * of current yield opportunities.
     * 
     * @returns Object with average lending and borrowing APYs
     */
    async getAPYSpread() {
      try {
        console.log('📊 Fetching market APY data');
        const markets = await plugin.actions.fetchMarkets();
        
        if (!markets || markets.length === 0) {
          throw new Error('No market data available');
        }
        
        // Calculate average APYs across all markets
        const avgLending = markets.reduce((sum: number, m: any) => {
          return sum + (m.supplyAPR || 0);
        }, 0) / markets.length;
        
        const avgBorrow = markets.reduce((sum: number, m: any) => {
          return sum + (m.borrowAPR || 0);
        }, 0) / markets.length;
        
        return { 
          lendingAPY: avgLending, 
          borrowAPY: avgBorrow 
        };
      } catch (error: any) {
        throw new Error(`Failed to get APY spread: ${error.message}`);
      }
    },
  };
}
