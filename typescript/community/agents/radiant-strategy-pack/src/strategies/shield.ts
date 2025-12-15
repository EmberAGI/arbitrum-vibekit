/**
 * Radiant Health Factor Shield Strategy
 * 
 * Monitors and protects lending positions from liquidation with tiered response levels.
 * Acts as an automated risk management system that takes progressively stronger actions
 * as health factor deteriorates.
 * 
 * Response Tiers:
 * 1. HF >= warn: Position is healthy, no action needed
 * 2. HF < warn: Log warning, monitor closely
 * 3. HF < soft: Soft deleverage - repay 10% of debt
 * 4. HF < hard: Hard deleverage - repay 20% of debt
 * 5. HF < exit: Emergency exit - repay all debt to avoid liquidation
 * 
 * Safety Features:
 * - Multi-tier response prevents overreaction to temporary price movements
 * - Configurable thresholds for different risk tolerances
 * - Automatic full exit before liquidation becomes imminent
 * - Comprehensive error handling for all operations
 */

import { RadiantClient } from '../radiantClient.js';

export interface ShieldConfig {
  token: string;            // Token address to repay (e.g., USDC)
  warnThreshold: number;    // Warning threshold (e.g., 1.35)
  softThreshold: number;    // Soft deleverage threshold (e.g., 1.30)
  hardThreshold: number;    // Hard deleverage threshold (e.g., 1.25)
  exitThreshold: number;    // Full exit threshold (e.g., 1.20)
}

export class HealthFactorShield {
  constructor(private client: RadiantClient) {}

  /**
   * Execute health factor protection strategy
   * 
   * Monitors current health factor and takes appropriate action based on
   * configured thresholds to protect the position from liquidation.
   * 
   * @param config Shield configuration with HF thresholds
   */
  async execute(config: ShieldConfig): Promise<void> {
    console.log('🛡️  Executing Health Factor Shield...');
    console.log(`📋 Thresholds: Warn=${config.warnThreshold}, Soft=${config.softThreshold}, Hard=${config.hardThreshold}, Exit=${config.exitThreshold}`);
    
    try {
      // Get current health factor
      let currentHF: number;
      try {
        currentHF = await this.client.getHealthFactor('');
        console.log(`📊 Current health factor: ${currentHF}`);
      } catch (error: any) {
        console.error(`❌ Failed to get health factor: ${error.message}`);
        throw new Error(`Health factor check failed: ${error.message}`);
      }

      // Tier 1: Position is healthy, no action needed
      if (currentHF >= config.warnThreshold) {
        console.log('✅ Position is healthy, no action needed');
        console.log(`💚 Health factor ${currentHF} is above warning threshold ${config.warnThreshold}`);
        return;
      }

      // Get current debt for repayment calculations
      let currentDebt: bigint;
      try {
        currentDebt = await this.client.getBorrowedAmount('');
        console.log(`💰 Current debt: ${currentDebt}`);
      } catch (error: any) {
        console.error(`❌ Failed to get borrowed amount: ${error.message}`);
        throw new Error(`Debt check failed: ${error.message}`);
      }

      // If no debt, nothing to repay
      if (currentDebt === 0n) {
        console.log('ℹ️  No debt to repay, position is safe');
        return;
      }

      // Tier 5: Critical - Full exit to avoid liquidation
      if (currentHF < config.exitThreshold) {
        console.log('🚨 CRITICAL: Health factor below exit threshold!');
        console.log(`🚨 Executing emergency full exit to avoid liquidation...`);
        
        try {
          await this.client.repay({ 
            token: config.token, 
            amount: currentDebt.toString() 
          });
          console.log(`💰 Emergency repayment completed: ${currentDebt}`);
          console.log('✅ Position fully closed to prevent liquidation');
          
          // Verify the repayment worked
          const newHF = await this.client.getHealthFactor('');
          console.log(`📊 New health factor after full repayment: ${newHF}`);
          
        } catch (error: any) {
          console.error(`❌ Emergency repayment failed: ${error.message}`);
          throw new Error(`Critical: Emergency exit failed - ${error.message}`);
        }
        return;
      }

      // Calculate step amounts for partial repayments
      const stepAmount = currentDebt / 10n; // 10% of debt per step

      // Tier 4: Hard deleverage - Repay 20% of debt
      if (currentHF < config.hardThreshold) {
        console.log('⚠️  Hard deleverage triggered!');
        console.log(`⚠️  Health factor ${currentHF} below hard threshold ${config.hardThreshold}`);
        
        const repayAmount = stepAmount * 2n; // 20% of debt
        console.log(`💰 Repaying 20% of debt: ${repayAmount}`);
        
        try {
          await this.client.repay({ 
            token: config.token, 
            amount: repayAmount.toString() 
          });
          console.log(`✅ Hard deleverage completed: ${repayAmount} repaid`);
          
          // Check new health factor
          const newHF = await this.client.getHealthFactor('');
          console.log(`📊 New health factor: ${newHF}`);
          
        } catch (error: any) {
          console.error(`❌ Hard deleverage failed: ${error.message}`);
          throw new Error(`Hard deleverage failed: ${error.message}`);
        }
        return;
      }

      // Tier 3: Soft deleverage - Repay 10% of debt
      if (currentHF < config.softThreshold) {
        console.log('⚠️  Soft deleverage triggered');
        console.log(`⚠️  Health factor ${currentHF} below soft threshold ${config.softThreshold}`);
        
        console.log(`💰 Repaying 10% of debt: ${stepAmount}`);
        
        try {
          await this.client.repay({ 
            token: config.token, 
            amount: stepAmount.toString() 
          });
          console.log(`✅ Soft deleverage completed: ${stepAmount} repaid`);
          
          // Check new health factor
          const newHF = await this.client.getHealthFactor('');
          console.log(`📊 New health factor: ${newHF}`);
          
        } catch (error: any) {
          console.error(`❌ Soft deleverage failed: ${error.message}`);
          throw new Error(`Soft deleverage failed: ${error.message}`);
        }
        return;
      }

      // Tier 2: Warning only - Monitor but don't act yet
      console.log('⚠️  Health factor below warning threshold');
      console.log(`⚠️  Health factor ${currentHF} below warning threshold ${config.warnThreshold}`);
      console.log('👀 Monitoring position closely, no action taken yet');
      console.log('💡 Consider manually reducing leverage if this persists');

    } catch (error: any) {
      console.error(`\n❌ Health Factor Shield failed: ${error.message}`);
      throw error;
    }
  }
}
