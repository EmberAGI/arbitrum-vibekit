import * as ethers from 'ethers';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';

import { extractLendingTransactionPlan } from './lending.js';
import { MultiChainSigner } from './multi-chain-signer.js';
import { parseFunctionCallArgs } from './response.js';

export interface TransactionPlan {
  to: string;
  data: string;
  value?: string;
  chainId: string;
}

/**
 * Extract function calls from task response
 */
export function extractFunctionCall(task: Task): { name: string; arguments: string } {
  // Check if there's a parts array with function_call
  if (task.status?.message?.parts) {
    for (const part of task.status.message.parts) {
      if (part.kind === 'text' && 'function_call' in part && part.function_call) {
        return part.function_call as { name: string; arguments: string };
      }
    }
  }

  // For handling different response formats
  if (task.status?.message && 'function_call' in task.status.message) {
    const message = task.status.message as Record<string, unknown>;
    return message.function_call as { name: string; arguments: string };
  }

  throw new Error(`No function call found in task response: ${JSON.stringify(task)}`);
}

// Constants for gas limit and fee buffers
const GAS_LIMIT_BUFFER = 10; // percentage
const FEE_BUFFER = 5; // percentage, applies to maxFeePerGas and maxPriorityFeePerGas

/**
 * Signs and sends a transaction based on a transaction plan
 * @param txPlan The transaction plan to execute
 * @param chainIdStr The chain ID as a string
 * @param multiChainSigner The MultiChainSigner instance to use for signing
 * @returns The transaction hash
 */
export async function signAndSendTransaction(
  txPlan: { to: string; value: string; data: string },
  chainIdStr: string,
  multiChainSigner: MultiChainSigner
): Promise<string> {
  const tx: ethers.PopulatedTransaction = {
    to: txPlan.to,
    value: ethers.BigNumber.from(txPlan.value),
    data: txPlan.data,
    from: multiChainSigner.wallet.address,
  };

  const chainId = parseInt(chainIdStr);
  const signer = multiChainSigner.getSignerForChainId(chainId);
  const provider = signer?.provider;

  if (typeof signer === 'undefined' || typeof provider === 'undefined') {
    throw new Error(`signAndSendTransaction: no RPC provider for chain ID ${chainIdStr}`);
  }

  // Bump gasLimit by GAS_LIMIT_BUFFER percent
  const gasEstimate = await provider.estimateGas(tx);
  tx.gasLimit = gasEstimate.mul(100 + GAS_LIMIT_BUFFER).div(100);

  // Apply FEE_BUFFER to fee data
  const feeData = await provider.getFeeData();

  if (feeData.maxFeePerGas) {
    tx.maxFeePerGas = feeData.maxFeePerGas.mul(100 + FEE_BUFFER).div(100);
  }

  if (feeData.maxPriorityFeePerGas) {
    tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas.mul(100 + FEE_BUFFER).div(100);
  }

  const txResponse = await signer.sendTransaction(tx);
  await txResponse.wait(1);
  return txResponse.hash;
}

/**
 * Extract transaction plan from liquidity artifacts
 */
export function extractLiquidityTransactionPlan(response: Task): Array<TransactionPlan> {
  if (!response.artifacts) {
    throw new Error('No artifacts found in response');
  }

  // Look for liquidity-transaction artifact
  for (const artifact of response.artifacts) {
    if (artifact.name === 'liquidity-transaction') {
      for (const part of artifact.parts) {
        if (part.kind === 'data' && part.data.txPlan) {
          return part.data.txPlan as Array<TransactionPlan>;
        }
      }
    }
  }

  throw new Error('No transaction plan found in artifacts');
}

/**
 * Extract transaction plan from pendle swap artifacts
 */
export function extractPendleSwapTransactionPlan(response: Task): Array<TransactionPlan> {
  if (!response.artifacts) {
    throw new Error(`No artifacts found in response: ${JSON.stringify(response)}`);
  }

  // Look for swap-transaction-plan artifact
  for (const artifact of response.artifacts) {
    if (artifact.name === 'swap-transaction-plan') {
      for (const part of artifact.parts) {
        if (part.kind === 'data' && part.data.txPlan) {
          return part.data.txPlan as Array<TransactionPlan>;
        }
      }
    }
  }

  throw new Error('No transaction plan found in artifacts');
}

/**
 * Extract transactions and execute them, with proper error handling
 */
export async function extractAndExecuteTransactions(
  response: Task,
  multiChainSigner: MultiChainSigner,
  operationName: string
): Promise<string[]> {
  // First try to get the transaction plan from the artifacts
  let txPlanEntries: TransactionPlan[];
  try {
    // Try extracting from transaction-plan first (lending)
    try {
      txPlanEntries = extractLendingTransactionPlan(response);
    } catch (_lendingError) {
      // If that fails, try extracting from liquidity-transaction (liquidity)
      try {
        txPlanEntries = extractLiquidityTransactionPlan(response);
      } catch (_liquidityError) {
        // If that fails, try extracting from swap-transaction-plan (pendle)
        txPlanEntries = extractPendleSwapTransactionPlan(response);
      }
    }
  } catch (e) {
    // If no transaction plan in artifacts, try the old function call method
    // TODO: should be eventually removed
    try {
      const functionCall = extractFunctionCall(response);
      const args = parseFunctionCallArgs(functionCall);
      if (args.transactions && Array.isArray(args.transactions)) {
        txPlanEntries = args.transactions;
      } else {
        throw new Error(
          `No transactions found in function call args for ${operationName} operation`
        );
      }
    } catch (functionCallError) {
      console.log('Function call extraction failed:', functionCallError);
      throw new Error(`Failed to extract transactions for ${operationName} operation: ${e}`);
    }
  }

  // Verify we have a valid transaction plan
  if (!txPlanEntries || txPlanEntries.length === 0) {
    throw new Error(`No transactions found in response for ${operationName} operation`);
  }

  // Extract chain ID from first transaction or fail
  const chainId = txPlanEntries?.[0]?.chainId;
  if (!chainId) {
    throw new Error(`No chainId found in transaction plan for ${operationName} operation`);
  }

  // Map to the structure expected by the new executeTransactionPlan
  const transactionsToExecute = txPlanEntries.map(tx => ({
    to: tx.to,
    data: tx.data,
    value: tx.value || '0', // Ensure value is a string, defaulting to '0'
  }));

  // Execute the transactions using the (new) executeTransactionPlan
  const txHashes = await executeTransactionPlan(transactionsToExecute, chainId, multiChainSigner);

  if (txHashes.length === 0) {
    throw new Error(`Failed to execute transactions for ${operationName} operation`);
  }

  return txHashes;
}

/**
 * Executes a transaction plan using the provided signer
 * @param transactions - Array of transaction objects
 * @param chainId - Chain ID where transactions should be executed
 * @param multiChainSigner - The multi-chain signer object
 * @returns Array of transaction hashes
 */
export async function executeTransactionPlan(
  transactions: Array<{ to: string; value: string; data: string }>,
  chainId: string, // Changed from string | number to string to match signAndSendTransaction
  multiChainSigner: MultiChainSigner
): Promise<string[]> {
  const txHashes: string[] = [];

  for (const transaction of transactions) {
    // We now call the more detailed signAndSendTransaction for each
    const txHash = await signAndSendTransaction(transaction, chainId, multiChainSigner);
    txHashes.push(txHash);
  }

  if (txHashes.length !== transactions.length) {
    // This check might be too strict if some transactions are allowed to fail
    // For now, assume all transactions in a plan are expected to succeed
    throw new Error('Some transactions in the plan failed to execute.');
  }

  return txHashes;
}
