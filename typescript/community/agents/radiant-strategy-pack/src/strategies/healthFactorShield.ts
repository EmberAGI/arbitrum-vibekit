/**
 * Radiant Health Factor Shield Strategy
 * 
 * Monitors and protects lending positions from liquidation with tiered response levels.
 * Acts as an automated risk management system that takes progressively stronger actions
 * as health factor deteriorates.
 * 
 * Response tiers:
 * 1. HF >= warnHF: No action (position is healthy)
 * 2. HF < warnHF: Log warning only
 * 3. HF < softHF: Small repayment (deleverageStepBps)
 * 4. HF < hardHF: Large repayment (2x deleverageStepBps)
 * 5. HF < exitHF: Full exit (repay all debt)
 * 
 * Safety features:
 * - Multi-tier response prevents overreaction
 * - Configurable thresholds for different risk tolerances
 * - Automatic full exit before liquidation risk
 * 
 * @example
 * ```typescript
 * const result = await executeHealthFactorShield(client, {
 *   wallet: '0x...',
 *   token: '0xUSDC',
 *   warnHF: 1.35,
 *   softHF: 1.30,
 *   hardHF: 1.25,
 *   exitHF: 1.20,
 *   deleverageStepBps: 1500  // Repay 15% of debt per step
 * });
 * ```
 */

import { RadiantClient } from '../radiantClient';

export interface ShieldConfig {
  wallet: string;           // User wallet address
  token: string;            // Token address to repay (e.g., USDC)
  warnHF: number;           // Warning threshold (e.g., 1.35)
  softHF: number;           // Soft deleverage threshold (e.g., 1.30)
  hardHF: number;           // Hard deleverage threshold (e.g., 1.25)
  exitHF: number;           // Full exit threshold (e.g., 1.20)
  deleverageStepBps: number; // Repayment percentage per step (e.g., 1500 = 15%)
}

export interface ShieldResult {
  action: string;           // Action taken: 'none', 'warn', 'soft_deleverage', 'hard_deleverage', 'full_exit'
  healthFactor: number;     // Current health factor
  amountRepaid?: bigint;    // Amount repaid (if any action taken)
}

/**
 * Execute health factor protection strategy
 * 
 * @param client - RadiantClient instance for protocol interaction
 * @param config - Strategy configuration with HF thresholds
 * @returns Result containing action taken and current state
 */
export async function executeHealthFactorShield(
  client: RadiantClient,
  config: ShieldConfig
): Promise<ShieldResult> {
  const hf = await client.getHealthFactor(config.wallet);

  // Tier 1: Position is healthy, no action needed
  if (hf >= config.warnHF) {
    return { action: 'none', healthFactor: hf };
  }

  // Tier 5: Critical - Full exit to avoid liquidation
  if (hf < config.exitHF) {
    const borrowed = await client.getBorrowedAmount(config.wallet);
    await client.repay({ token: config.token, amount: borrowed.toString() });
    return { action: 'full_exit', healthFactor: hf, amountRepaid: borrowed };
  }

  const borrowed = await client.getBorrowedAmount(config.wallet);
  const repayAmount = (borrowed * BigInt(config.deleverageStepBps)) / 10000n;

  // Tier 4: Hard deleverage - Repay 2x step amount
  if (hf < config.hardHF) {
    await client.repay({ token: config.token, amount: (repayAmount * 2n).toString() });
    return { action: 'hard_deleverage', healthFactor: hf, amountRepaid: repayAmount * 2n };
  }

  // Tier 3: Soft deleverage - Repay 1x step amount
  if (hf < config.softHF) {
    await client.repay({ token: config.token, amount: repayAmount.toString() });
    return { action: 'soft_deleverage', healthFactor: hf, amountRepaid: repayAmount };
  }

  // Tier 2: Warning only - Monitor but don't act yet
  return { action: 'warn', healthFactor: hf };
}
