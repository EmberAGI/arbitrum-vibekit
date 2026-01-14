/**
 * RadiantClient Interface
 * 
 * Abstraction layer for interacting with Radiant lending protocol.
 * This interface separates strategy logic from the underlying plugin implementation,
 * making strategies testable and portable.
 */

export interface RadiantClient {
  // Write actions - Execute transactions on Radiant protocol
  
  /** Supply tokens to Radiant lending pool */
  supply(params: { token: string; amount: string }): Promise<void>;
  
  /** Borrow tokens from Radiant lending pool */
  borrow(params: { token: string; amount: string }): Promise<void>;
  
  /** Repay borrowed tokens to Radiant lending pool */
  repay(params: { token: string; amount: string }): Promise<void>;
  
  /** Withdraw supplied tokens from Radiant lending pool */
  withdraw(params: { token: string; amount: string }): Promise<void>;

  // Read actions - Query user position and protocol state
  
  /** Get user's health factor (liquidation risk indicator, <1.0 = liquidatable) */
  getHealthFactor(wallet: string): Promise<number>;
  
  /** Get available borrow capacity in USD */
  getBorrowCapacity(wallet: string): Promise<bigint>;
  
  /** Get total collateral value in USD */
  getTotalCollateral(wallet: string): Promise<bigint>;
  
  /** Get total borrowed amount in USD */
  getBorrowedAmount(wallet: string): Promise<bigint>;

  // Rewards & APY
  
  /** Get pending RDNT rewards for user */
  getPendingRewards(wallet: string): Promise<bigint>;
  
  /** Get current lending and borrowing APY rates */
  getAPYSpread(): Promise<{ lendingAPY: number; borrowAPY: number }>;
}
