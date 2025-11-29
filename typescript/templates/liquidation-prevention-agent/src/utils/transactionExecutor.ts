/**
 * Transaction Executor Utility
 *
 * Handles actual transaction execution using user's private key
 * Based on the swapping-agent pattern for real on-chain transactions
 */

import {
  type Address,
  type Hex,
  type TransactionReceipt,
  type LocalAccount,
  BaseError,
  ContractFunctionRevertedError,
  hexToString,
  isHex,
  createWalletClient,
  createPublicClient,
  http,
} from 'viem';
import { arbitrum } from 'viem/chains';
import type { TransactionPlan } from 'ember-api';

interface ChainConfig {
  viemChain: typeof arbitrum;
  quicknodeSegment: string;
}

// For now, focus on Arbitrum (can be extended later)
const chainIdMap: Record<string, ChainConfig> = {
  '42161': { viemChain: arbitrum, quicknodeSegment: 'arbitrum-mainnet' },
};

function getChainConfigById(chainId: string): ChainConfig {
  const config = chainIdMap[chainId];
  if (!config) {
    throw new Error(`Unsupported chainId: ${chainId}. Currently only Arbitrum (42161) is supported.`);
  }
  return config;
}

export class TransactionExecutor {
  private account: LocalAccount<string>;
  private userAddress: Address;
  private quicknodeSubdomain: string;
  private quicknodeApiKey: string;

  constructor(
    account: LocalAccount<string>,
    userAddress: Address,
    quicknodeSubdomain: string,
    quicknodeApiKey: string
  ) {
    this.account = account;
    this.userAddress = userAddress;
    this.quicknodeSubdomain = quicknodeSubdomain;
    this.quicknodeApiKey = quicknodeApiKey;
  }

  private log(...args: unknown[]) {
    console.log('[TransactionExecutor]', ...args);
  }

  private logError(...args: unknown[]) {
    console.error('[TransactionExecutor]', ...args);
  }

  async executeTransactions(actionName: string, transactions: TransactionPlan[]): Promise<string> {
    if (!transactions || transactions.length === 0) {
      this.log(`${actionName}: No transactions required.`);
      return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)}: No on-chain transactions required.`;
    }

    try {
      this.log(`Executing ${transactions.length} transaction(s) for ${actionName}...`);
      const txHashes: string[] = [];

      for (const transaction of transactions) {
        const txHash = await this.signAndSendTransaction(transaction);
        this.log(`${actionName} transaction sent: ${txHash}`);
        txHashes.push(txHash);
      }

      return `${actionName.charAt(0).toUpperCase() + actionName.slice(1)} successful! Transaction hash(es): ${txHashes.join(', ')}`;
    } catch (error: unknown) {
      const err = error as Error;
      this.logError(`Error executing ${actionName} action:`, err.message);
      throw new Error(`Error executing ${actionName}: ${err.message}`);
    }
  }

  private async signAndSendTransaction(tx: TransactionPlan): Promise<string> {
    if (!tx.chainId) {
      const errorMsg = `Transaction object missing required 'chainId' field`;
      this.logError(errorMsg, tx);
      throw new Error(errorMsg);
    }

    let chainConfig: ChainConfig;
    try {
      chainConfig = getChainConfigById(tx.chainId);
    } catch (chainError) {
      this.logError((chainError as Error).message, tx);
      throw chainError;
    }

    const targetChain = chainConfig.viemChain;
    const networkSegment = chainConfig.quicknodeSegment;

    // Build QuickNode RPC URL
    const dynamicRpcUrl = `https://${this.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${this.quicknodeApiKey}`;

    const publicClient = createPublicClient({
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });

    const walletClient = createWalletClient({
      account: this.account,
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });

    // Validate transaction fields
    if (!tx.to || !/^0x[a-fA-F0-9]{40}$/.test(tx.to)) {
      const errorMsg = `Transaction object invalid 'to' field: ${tx.to}`;
      this.logError(errorMsg, tx);
      throw new Error(errorMsg);
    }

    if (!tx.data || !isHex(tx.data)) {
      const errorMsg = `Transaction object invalid 'data' field (not hex): ${tx.data}`;
      this.logError(errorMsg, tx);
      throw new Error(errorMsg);
    }

    const toAddress = tx.to as Address;
    const txData = tx.data as Hex;
    const txValue = tx.value ? BigInt(tx.value) : 0n;

    try {
      const dataPrefix = txData.substring(0, 10);
      this.log(
        `Preparing transaction to ${toAddress} on chain ${targetChain.id} (${networkSegment}) from ${this.userAddress} with data ${dataPrefix}...`
      );

      this.log(`Sending transaction...`);
      const txHash = await walletClient.sendTransaction({
        to: toAddress,
        value: txValue,
        data: txData,
      });

      this.log(
        `Transaction submitted to chain ${targetChain.id}: ${txHash}. Waiting for confirmation...`
      );

      const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      this.log(
        `Transaction confirmed on chain ${targetChain.id} in block ${receipt.blockNumber} (Status: ${receipt.status}): ${txHash}`
      );

      if (receipt.status === 'reverted') {
        throw new Error(
          `Transaction ${txHash} failed (reverted). Check blockchain explorer for details.`
        );
      }

      return txHash;
    } catch (error: unknown) {
      let revertReason =
        error instanceof Error
          ? `Transaction failed: ${error.message}`
          : 'Transaction failed: Unknown error';

      if (error instanceof BaseError) {
        const cause = error.walk((e: unknown) => e instanceof ContractFunctionRevertedError);
        if (cause instanceof ContractFunctionRevertedError) {
          const errorName = cause.reason ?? cause.shortMessage;
          revertReason = `Transaction reverted: ${errorName}`;

          if (cause.data?.errorName === '_decodeRevertReason') {
            const hexReason = cause.data.args?.[0];
            if (hexReason && typeof hexReason === 'string' && isHex(hexReason as Hex)) {
              try {
                revertReason = `Transaction reverted: ${hexToString(hexReason as Hex)}`;
              } catch (decodeError) {
                this.logError('Failed to decode revert reason hex:', hexReason, decodeError);
              }
            }
          }
        } else {
          revertReason = `Transaction failed: ${error.shortMessage}`;
        }
        this.logError(`Send transaction failed: ${revertReason}`, error.details);
      } else if (error instanceof Error) {
        this.logError(`Send transaction failed: ${revertReason}`, error);
      } else {
        this.logError(`Send transaction failed with unknown error type: ${revertReason}`, error);
      }

      throw new Error(revertReason);
    }
  }
}
