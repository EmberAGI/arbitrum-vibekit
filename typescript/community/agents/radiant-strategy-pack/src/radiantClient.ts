/**
 * RadiantClient Interface
 * 
 * Abstraction layer for interacting with Radiant lending protocol on Arbitrum.
 * This interface separates strategy logic from the underlying plugin implementation,
 * making strategies testable, portable, and easier to maintain.
 * 
 * The interface provides:
 * - Transaction operations (supply, borrow, repay, withdraw)
 * - Position queries (health factor, collateral, debt)
 * - Market data (APY rates, rewards)
 * 
 * All monetary amounts are handled as strings for transaction parameters
 * and BigInt for query results to maintain precision with large numbers.
 */

export interface RadiantClient {
  
  // ========================================
  // TRANSACTION OPERATIONS
  // ========================================
  
  /**
   * Supply tokens to Radiant lending pool
   * 
   * Deposits tokens into the lending pool to earn supply APY.
   * Supplied tokens can be used as collateral for borrowing.
   * 
   * Requirements:
   * - User must have sufficient token balance
   * - Token must be approved for the lending pool contract
   * 
   * @param params.token - Token contract address (e.g., USDC, WETH)
   * @param params.amount - Amount to supply in token's smallest unit (wei)
   * @throws Error if transaction fails or insufficient balance/approval
   */
  supply(params: { token: string; amount: string }): Promise<void>;
  
  /**
   * Borrow tokens from Radiant lending pool
   * 
   * Takes a loan against supplied collateral. Borrowed amount accrues
   * interest at the current borrow APY rate.
   * 
   * Requirements:
   * - User must have sufficient collateral supplied
   * - Collateral must be enabled for borrowing
   * - Borrow amount must not cause health factor to drop below 1.0
   * 
   * @param params.token - Token contract address to borrow
   * @param params.amount - Amount to borrow in token's smallest unit (wei)
   * @throws Error if insufficient collateral or would cause liquidation
   */
  borrow(params: { token: string; amount: string }): Promise<void>;
  
  /**
   * Repay borrowed tokens to Radiant lending pool
   * 
   * Pays back borrowed tokens plus accrued interest. Reduces debt
   * and improves health factor.
   * 
   * Requirements:
   * - User must have sufficient token balance to repay
   * - Token must be approved for the lending pool contract
   * 
   * @param params.token - Token contract address to repay
   * @param params.amount - Amount to repay in token's smallest unit (wei)
   * @throws Error if insufficient balance or approval
   */
  repay(params: { token: string; amount: string }): Promise<void>;
  
  /**
   * Withdraw supplied tokens from Radiant lending pool
   * 
   * Removes tokens from the lending pool, stopping supply APY earnings.
   * If tokens are used as collateral, withdrawal may be restricted.
   * 
   * Requirements:
   * - User must have sufficient supplied balance (aTokens)
   * - Withdrawal must not cause health factor to drop below 1.0
   * 
   * @param params.token - Token contract address to withdraw
   * @param params.amount - Amount to withdraw in token's smallest unit (wei)
   * @throws Error if insufficient balance or would cause liquidation
   */
  withdraw(params: { token: string; amount: string }): Promise<void>;

  // ========================================
  // POSITION QUERIES
  // ========================================
  
  /**
   * Get user's current health factor
   * 
   * Health factor indicates how close a position is to liquidation:
   * - > 1.0: Position is safe
   * - = 1.0: Position is at liquidation threshold
   * - < 1.0: Position can be liquidated
   * 
   * Formula: (Total Collateral * Liquidation Threshold) / Total Debt
   * 
   * @param wallet - User wallet address to check
   * @returns Health factor as decimal number (e.g., 1.35)
   * @throws Error if unable to fetch position data
   */
  getHealthFactor(wallet: string): Promise<number>;
  
  /**
   * Get user's available borrow capacity in USD
   * 
   * Maximum additional amount the user can borrow without exceeding
   * the liquidation threshold. Based on current collateral and prices.
   * 
   * @param wallet - User wallet address to check
   * @returns Available borrow capacity in USD (as BigInt for precision)
   * @throws Error if unable to fetch position data
   */
  getBorrowCapacity(wallet: string): Promise<bigint>;
  
  /**
   * Get user's total collateral value in USD
   * 
   * Sum of all supplied assets valued at current market prices,
   * adjusted by each asset's collateral factor.
   * 
   * @param wallet - User wallet address to check
   * @returns Total collateral value in USD (as BigInt for precision)
   * @throws Error if unable to fetch position data
   */
  getTotalCollateral(wallet: string): Promise<bigint>;
  
  /**
   * Get user's total borrowed amount in USD
   * 
   * Sum of all borrowed assets plus accrued interest,
   * valued at current market prices.
   * 
   * @param wallet - User wallet address to check
   * @returns Total debt value in USD (as BigInt for precision)
   * @throws Error if unable to fetch position data
   */
  getBorrowedAmount(wallet: string): Promise<bigint>;

  // ========================================
  // REWARDS & MARKET DATA
  // ========================================
  
  /**
   * Get user's pending RDNT rewards
   * 
   * Radiant protocol rewards users with RDNT tokens for lending
   * and borrowing activities. Rewards can be claimed and compounded.
   * 
   * Note: Current implementation returns 0 as the plugin doesn't
   * yet support reward queries. Will be updated when available.
   * 
   * @param wallet - User wallet address to check
   * @returns Pending RDNT rewards (as BigInt for precision)
   * @throws Error if unable to fetch reward data
   */
  getPendingRewards(wallet: string): Promise<bigint>;
  
  /**
   * Get current APY spread between lending and borrowing rates
   * 
   * Provides market overview by calculating average APY rates
   * across all supported assets. Useful for strategy decisions.
   * 
   * @returns Object containing average lending and borrowing APY rates
   * @returns lendingAPY - Average supply APY across all markets (percentage)
   * @returns borrowAPY - Average borrow APY across all markets (percentage)
   * @throws Error if unable to fetch market data
   */
  getAPYSpread(): Promise<{ lendingAPY: number; borrowAPY: number }>;
}
