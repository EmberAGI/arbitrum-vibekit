import * as ethers from 'ethers';
import { MultiChainSigner } from '../multichain-signer.js';

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

  const txResponse = await multiChainSigner.sendTransaction(chainId, tx);
  await txResponse.wait();
  return txResponse.hash;
}

/**
 * Executes a transaction plan by signing and sending all transactions
 * @param transactions Array of transaction plans to execute
 * @param chainId The chain ID as a string
 * @param multiChainSigner The MultiChainSigner instance to use for signing
 * @returns Array of transaction hashes
 */
export async function executeTransactionPlan(
  transactions: Array<{ to: string; value: string; data: string }>,
  chainId: string,
  multiChainSigner: MultiChainSigner
): Promise<string[]> {
  const txHashes: string[] = [];

  for (const transaction of transactions) {
    const txHash = await signAndSendTransaction(transaction, chainId, multiChainSigner);
    txHashes.push(txHash);
  }

  return txHashes;
}

/**
 * Helper to format numeric values from the API responses
 * @param value The string value to format
 * @returns Formatted string value
 */
export function formatNumeric(value: string): string {
  const num = parseFloat(value);
  if (Number.isInteger(num)) return num.toString();
  return parseFloat(num.toFixed(2)).toString();
}

/**
 * Parse data from an agent's function call response
 * @param functionCall The function call from the agent's response
 * @returns Parsed arguments object
 */
export function parseFunctionCallArgs(functionCall: {
  name: string;
  arguments: string;
}): Record<string, unknown> {
  try {
    return JSON.parse(functionCall.arguments || '{}');
  } catch (error) {
    console.error('Error parsing function arguments:', error);
    return {};
  }
}
