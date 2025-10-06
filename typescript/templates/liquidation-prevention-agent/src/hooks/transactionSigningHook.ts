import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { TransactionPlan } from 'ember-schemas';
import type { AfterHook } from './withHooks.js';
import type { LiquidationPreventionContext } from '../context/types.js';

/**
 * Transaction execution result interface
 */
interface TransactionResult {
  transactions: TransactionPlan[];
  [key: string]: any;
}

/**
 * After hook for secure transaction signing and execution using Vibekit's withHooks pattern.
 * This hook handles the transaction signing and execution for blockchain operations.
 *
 * @param result The result from the tool execution containing transactions to execute
 * @param context The agent context with transaction executor
 * @param args The original tool arguments
 * @returns Task with execution result or error
 */
export const transactionSigningAfterHook: AfterHook<TransactionResult, any, LiquidationPreventionContext> = async (
  result,
  context,
  args
) => {
  try {
    // Extract transactions from the result
    const { transactions, ...otherData } = result;
    
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      throw new Error('No transactions to execute');
    }

    console.log(`🔐 [withHooks] Executing ${transactions.length} transaction(s) with secure signing...`);
    
    // Use the transaction executor from context for secure signing
    const executionResult = await context.custom.executeTransaction(
      `${args.userAddress}-transaction`, 
      transactions
    );

    console.log('✅ [withHooks] Transaction execution completed successfully');

    // Return success task with execution details
    return createSuccessTask(
      'transaction-execution',
      undefined,
      `🛡️ Transaction executed successfully using secure signing. ${executionResult}`
    );

  } catch (error) {
    console.error('❌ [withHooks] Transaction signing/execution failed:', error);
    
    return createErrorTask(
      'transaction-execution',
      error instanceof Error ? error : new Error(`Transaction execution failed: ${error}`)
    );
  }
};

/**
 * Before hook for transaction validation and security checks.
 * This can be used to validate inputs before transaction preparation.
 */
export const transactionValidationBeforeHook = async (args: any, context: any) => {
  // Validate required fields
  if (!args.userAddress) {
    throw new Error('User address is required for transaction execution');
  }

  if (!args.amount || parseFloat(args.amount) <= 0) {
    throw new Error('Valid amount is required for transaction execution');
  }

  console.log(`🔍 [withHooks] Transaction validation passed for user: ${args.userAddress}`);
  
  // Return processed args (no changes in this case)
  return args;
};
