/**
 * Transaction Utilities
 *
 * Shared utilities and types for handling blockchain transactions across the app.
 */

import { type Hex } from "viem";

export interface RawTransaction {
  to: string;
  data?: string;
  value?: string;
  chainId: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface TxPlan extends Array<RawTransaction> {
  // TxPlan is an array of RawTransactions
  // Last item is typically the main transaction
  // Previous items are approval transactions
}

/**
 * Convert various value formats to bigint
 */
export function toBigInt(value: string | number | bigint | undefined): bigint {
  if (value === undefined || value === null) {
    return BigInt(0);
  }

  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(Math.floor(value));
  }

  if (typeof value === "string") {
    // Handle hex strings
    if (value.startsWith("0x")) {
      return BigInt(value);
    }
    // Handle decimal strings
    const parsed = parseFloat(value);
    if (isNaN(parsed)) {
      return BigInt(0);
    }
    return BigInt(Math.floor(parsed));
  }

  return BigInt(0);
}

/**
 * Get safe defaults for gas and other transaction parameters
 * This is a placeholder implementation - in a real app you'd want to:
 * - Use a gas estimation service
 * - Query the current network for gas prices
 * - Apply chain-specific optimizations
 */
export async function withSafeDefaults(
  chainId: number,
  transaction: {
    to: string;
    data?: string;
    value?: bigint;
  },
  fromAddress: string
): Promise<{
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}> {
  console.log("[withSafeDefaults] Getting gas estimates for chain", chainId);

  // Basic gas estimates based on transaction type
  let gasLimit = BigInt(21000); // Basic transfer

  if (transaction.data && transaction.data !== "0x") {
    // Contract interaction, estimate higher
    gasLimit = transaction.data.length > 1000 ? BigInt(500000) : BigInt(150000);
  }

  // Basic fee estimates (in a real app, fetch from network)
  const baseFees = {
    1: {
      maxFeePerGas: BigInt(30000000000),
      maxPriorityFeePerGas: BigInt(2000000000),
    }, // Ethereum
    137: {
      maxFeePerGas: BigInt(50000000000),
      maxPriorityFeePerGas: BigInt(30000000000),
    }, // Polygon
    42161: {
      maxFeePerGas: BigInt(1000000000),
      maxPriorityFeePerGas: BigInt(100000000),
    }, // Arbitrum
    10: {
      maxFeePerGas: BigInt(1000000000),
      maxPriorityFeePerGas: BigInt(100000000),
    }, // Optimism
  };

  const fees = baseFees[chainId as keyof typeof baseFees] || baseFees[1];

  return {
    gasLimit,
    ...fees,
  };
}

/**
 * Format transaction hash for display
 */
export function formatTxHash(hash: string): string {
  if (!hash) return "";
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

/**
 * Format wei amount to readable format
 */
export function formatWei(wei: bigint, decimals: number = 18): string {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = wei / divisor;
  const fraction = wei % divisor;

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(decimals, "0");
  const trimmed = fractionStr.replace(/0+$/, "");

  return `${whole.toString()}.${trimmed}`;
}

/**
 * Parse token amount string to wei
 */
export function parseTokenAmount(
  amount: string,
  decimals: number = 18
): bigint {
  const [whole, fraction = ""] = amount.split(".");
  const fractionPadded = fraction.padEnd(decimals, "0").slice(0, decimals);
  const combined = whole + fractionPadded;
  return BigInt(combined);
}

/**
 * Check if transaction is likely an approval
 */
export function isApprovalTransaction(transaction: RawTransaction): boolean {
  if (!transaction.data) return false;

  // ERC-20 approve function signature: 0x095ea7b3
  return transaction.data.startsWith("0x095ea7b3");
}

/**
 * Get chain name from chain ID
 */
export function getChainName(chainId: number): string {
  const chainNames: Record<number, string> = {
    1: "Ethereum",
    137: "Polygon",
    42161: "Arbitrum One",
    10: "Optimism",
    56: "BNB Chain",
    43114: "Avalanche",
    250: "Fantom",
    8453: "Base",
  };

  return chainNames[chainId] || `Chain ${chainId}`;
}

/**
 * Validate transaction object
 */
export function validateTransaction(tx: RawTransaction): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!tx.to || !tx.to.match(/^0x[a-fA-F0-9]{40}$/)) {
    errors.push('Invalid "to" address');
  }

  if (!tx.chainId || tx.chainId <= 0) {
    errors.push("Invalid chain ID");
  }

  if (tx.data && !tx.data.startsWith("0x")) {
    errors.push("Transaction data must start with 0x");
  }

  if (tx.value && tx.value !== "0x0" && tx.value !== "0") {
    try {
      toBigInt(tx.value);
    } catch {
      errors.push("Invalid transaction value");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate total gas cost
 */
export function calculateGasCost(gasLimit: bigint, gasPrice: bigint): bigint {
  return gasLimit * gasPrice;
}

/**
 * Format gas cost for display
 */
export function formatGasCost(
  gasLimit: bigint,
  gasPrice: bigint,
  nativeTokenSymbol: string = "ETH"
): string {
  const cost = calculateGasCost(gasLimit, gasPrice);
  const formatted = formatWei(cost);
  return `${formatted} ${nativeTokenSymbol}`;
}
