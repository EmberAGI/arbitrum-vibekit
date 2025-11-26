/**
 * Radiant Leveraged Looping Lender Strategy
 * 
 * Automates the process of building leverage by repeatedly borrowing and re-supplying assets.
 * This creates a leveraged position that amplifies both yields and risks.
 * 
 * How it works:
 * 1. Check health factor is above minimum threshold
 * 2. Calculate available borrow capacity
 * 3. Borrow a percentage (utilizationBps) of available capacity
 * 4. Supply the borrowed amount back as collateral
 * 5. Repeat until maxLoops reached or health factor drops
 * 
 * Safety features:
 * - Health factor check before each loop
 * - Configurable utilization rate to maintain safe HF
 * - Maximum loop limit to prevent infinite execution
 * - Zero-borrow detection to stop when no capacity remains
 * 
 * @example
 * ```typescript
 * const result = await executeLoopingLender(client, {
 *   wallet: '0x...',
 *   token: '0xUSDC',
 *   maxLoops: 5,
 *   minHealthFactor: 1.35,
 *   utilizationBps: 9000  // Use 90% of available capacity per loop
 * });
 * ```
 */

import { RadiantClient } from '../radiantClient';

export interface LoopingConfig {
  wallet: string;           // User wallet address
  token: string;            // Token address to loop (e.g., USDC)
  maxLoops: number;         // Maximum number of borrow-supply cycles
  minHealthFactor: number;  // Stop if HF drops below this (e.g., 1.35)
  utilizationBps: number;   // Percentage of capacity to use per loop (e.g., 9000 = 90%)
}

export interface LoopingResult {
  loopsExecuted: number;    // Number of loops completed
  stoppedReason: string;    // Why the loop stopped
  finalHealthFactor: number; // Final health factor after execution
}

/**
 * Execute leveraged looping strategy
 * 
 * @param client - RadiantClient instance for protocol interaction
 * @param config - Strategy configuration
 * @returns Result containing loops executed and final state
 */
export async function executeLoopingLender(
  client: RadiantClient,
  config: LoopingConfig
): Promise<LoopingResult> {
  let loopsExecuted = 0;

  for (let i = 0; i < config.maxLoops; i++) {
    // Safety check: ensure health factor is above minimum
    const hf = await client.getHealthFactor(config.wallet);
    
    if (hf < config.minHealthFactor) {
      return {
        loopsExecuted,
        stoppedReason: 'HF below threshold',
        finalHealthFactor: hf,
      };
    }

    // Get available borrow capacity
    const capacity = await client.getBorrowCapacity(config.wallet);
    if (capacity === 0n) {
      return {
        loopsExecuted,
        stoppedReason: 'No borrow capacity',
        finalHealthFactor: hf,
      };
    }

    // Calculate borrow amount based on utilization rate
    const borrowAmount = (capacity * BigInt(config.utilizationBps)) / 10000n;
    if (borrowAmount === 0n) break;

    // Execute loop: borrow then supply
    await client.borrow({ token: config.token, amount: borrowAmount.toString() });
    await client.supply({ token: config.token, amount: borrowAmount.toString() });
    
    loopsExecuted++;
  }

  const finalHF = await client.getHealthFactor(config.wallet);
  return {
    loopsExecuted,
    stoppedReason: 'Max loops reached',
    finalHealthFactor: finalHF,
  };
}
