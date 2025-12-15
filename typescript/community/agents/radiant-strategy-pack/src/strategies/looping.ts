/**
 * Radiant Leveraged Looping Strategy
 * 
 * Automates the process of building leverage by repeatedly borrowing and re-supplying assets.
 * This creates a leveraged position that amplifies both yields and risks.
 * 
 * Safety Features:
 * - Health factor monitoring before each loop
 * - Configurable utilization rate to maintain safe margins
 * - Maximum loop limit to prevent infinite execution
 * - Zero-borrow detection to stop when no capacity remains
 * - Comprehensive error handling for all operations
 */

import { RadiantClient } from '../radiantClient.js';

export interface LoopingConfig {
  token: string;            // Token address to loop (e.g., USDC)
  maxLoops: number;         // Maximum number of borrow-supply cycles
  minHealthFactor: number;  // Stop if HF drops below this (e.g., 1.35)
  utilizationBps: number;   // Percentage of capacity to use per loop (e.g., 9000 = 90%)
}

export class LoopingStrategy {
  constructor(private client: RadiantClient) {}

  /**
   * Execute the leveraged looping strategy
   * 
   * Process:
   * 1. Check current health factor for safety
   * 2. Calculate available borrow capacity
   * 3. Borrow a percentage of available capacity
   * 4. Supply the borrowed amount back as collateral
   * 5. Repeat until conditions are met
   * 
   * @param config Strategy configuration parameters
   */
  async execute(config: LoopingConfig): Promise<void> {
    console.log('🔄 Starting leveraged looping strategy...');
    console.log(`📋 Config: ${config.maxLoops} loops, ${config.minHealthFactor} min HF, ${config.utilizationBps/100}% utilization`);
    
    let loopsExecuted = 0;

    try {
      for (let i = 0; i < config.maxLoops; i++) {
        console.log(`\n🔄 Loop ${i + 1}/${config.maxLoops}:`);

        // Safety check: ensure health factor is above minimum threshold
        let currentHF: number;
        try {
          currentHF = await this.client.getHealthFactor('');
          console.log(`📊 Current health factor: ${currentHF}`);
        } catch (error: any) {
          console.error(`❌ Failed to get health factor: ${error.message}`);
          throw new Error(`Health factor check failed: ${error.message}`);
        }
        
        // Stop if health factor is too low
        if (currentHF < config.minHealthFactor) {
          console.log(`⚠️  Health factor ${currentHF} below threshold ${config.minHealthFactor}, stopping for safety`);
          break;
        }

        // Get available borrow capacity
        let capacity: bigint;
        try {
          capacity = await this.client.getBorrowCapacity('');
          console.log(`💰 Available borrow capacity: ${capacity}`);
        } catch (error: any) {
          console.error(`❌ Failed to get borrow capacity: ${error.message}`);
          throw new Error(`Borrow capacity check failed: ${error.message}`);
        }

        // Stop if no borrow capacity remaining
        if (capacity === 0n) {
          console.log('⚠️  No borrow capacity remaining, stopping');
          break;
        }

        // Calculate borrow amount based on utilization rate
        const borrowAmount = (capacity * BigInt(config.utilizationBps)) / 10000n;
        if (borrowAmount === 0n) {
          console.log('⚠️  Calculated borrow amount is 0, stopping');
          break;
        }

        console.log(`📈 Executing loop: Borrowing ${borrowAmount} and re-supplying...`);

        try {
          // Execute borrow operation
          console.log(`📤 Borrowing ${borrowAmount} of ${config.token}...`);
          await this.client.borrow({ 
            token: config.token, 
            amount: borrowAmount.toString() 
          });

          // Execute supply operation
          console.log(`📥 Supplying ${borrowAmount} of ${config.token}...`);
          await this.client.supply({ 
            token: config.token, 
            amount: borrowAmount.toString() 
          });

          loopsExecuted++;
          console.log(`✅ Loop ${i + 1} completed successfully`);

        } catch (error: any) {
          console.error(`❌ Loop ${i + 1} failed: ${error.message}`);
          
          // If it's a transaction error, we should stop to avoid further issues
          if (error.message.includes('Transaction failed') || 
              error.message.includes('insufficient') ||
              error.message.includes('revert')) {
            console.log('🛑 Stopping due to transaction failure');
            break;
          }
          
          // For other errors, rethrow to stop execution
          throw new Error(`Loop execution failed: ${error.message}`);
        }

        // Small delay between loops to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Final status check
      try {
        const finalHF = await this.client.getHealthFactor('');
        console.log(`\n✅ Strategy completed successfully!`);
        console.log(`📊 Final status: ${loopsExecuted} loops executed, health factor: ${finalHF}`);
        
        if (finalHF < config.minHealthFactor) {
          console.log(`⚠️  Warning: Final health factor ${finalHF} is below threshold ${config.minHealthFactor}`);
        }
      } catch (error: any) {
        console.log(`\n✅ Strategy completed (${loopsExecuted} loops), but final status check failed: ${error.message}`);
      }

    } catch (error: any) {
      console.error(`\n❌ Strategy failed after ${loopsExecuted} loops: ${error.message}`);
      throw error;
    }
  }
}
